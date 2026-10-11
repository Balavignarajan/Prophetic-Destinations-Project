import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { QuizDeliveryService } from '../application/quiz-delivery.service.js';
import { QuizService } from '../application/quiz.service.js';
import type { QuizInput } from '../domain/quiz-rules.js';
import { QuizzesModule } from '../quizzes.module.js';

// Integration: quizzes against the real database (see .env): the schema's constraints and triggers, the authoring
// service (locking, versions, publishing) and the learner service. Rows carry a per-run prefix and are deleted afterwards.
const runId = randomUUID().slice(0, 8);
const EMAIL = `quiz-${runId}@int-test.invalid`;
const title = (name: string) => `int-${runId}-${name}`;

const content = (name: string, extra: Partial<QuizInput> = {}): QuizInput => ({
  title: title(name),
  description: 'integration',
  questions: [
    {
      prompt: 'First?',
      explanation: 'Because.',
      options: [
        { text: 'Yes', correct: true },
        { text: 'No', correct: false },
      ],
    },
    {
      prompt: 'Second?',
      options: [
        { text: 'A', correct: false },
        { text: 'B', correct: false },
        { text: 'C', correct: true },
      ],
    },
  ],
  ...extra,
});

describe('quizzes (integration)', () => {
  let dataSource: DataSource;
  let quizzes: QuizService;
  let delivery: QuizDeliveryService;
  let adminId: string;
  let closeModule: () => Promise<void>;

  const cleanup = async () => {
    // a published quiz is frozen; unpublish before deleting what the tests created
    await dataSource.query(
      `UPDATE "quizzes" SET "status" = 'DRAFT', "published_at" = NULL WHERE "created_by" IN (SELECT "id" FROM "admins" WHERE "email" = $1)`,
      [EMAIL],
    );
    await dataSource.query(
      `DELETE FROM "quizzes" WHERE "created_by" IN (SELECT "id" FROM "admins" WHERE "email" = $1)`,
      [EMAIL],
    );
    await dataSource.query(`DELETE FROM "admins" WHERE "email" = $1`, [EMAIL]);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, QuizzesModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    quizzes = moduleRef.get(QuizService, { strict: false });
    delivery = moduleRef.get(QuizDeliveryService, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
    const [admin] = await dataSource.query(
      `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'not-a-real-hash','EDITOR') RETURNING "id"`,
      [EMAIL],
    );
    adminId = admin.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('the schema', () => {
    const draft = async () => {
      const [quiz] = await dataSource.query(
        `INSERT INTO "quizzes" ("title","created_by") VALUES ($1,$2) RETURNING "id"`,
        [title('schema'), adminId],
      );
      return quiz.id as string;
    };

    /** A question and its options in one transaction, as the application writes them. */
    const writeQuestion = async (
      quizId: string,
      correct: (optionIds: string[]) => string,
      position = 1,
    ) => {
      const questionId = randomUUID();
      const optionIds = [randomUUID(), randomUUID()];
      await dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO "quiz_questions" ("id","quiz_id","position","prompt","correct_option_id") VALUES ($1,$2,$3,'Q?',$4)`,
          [questionId, quizId, position, correct(optionIds)],
        );
        await manager.query(
          `INSERT INTO "quiz_options" ("id","question_id","position","text") VALUES ($1,$3,1,'a'),($2,$3,2,'b')`,
          [optionIds[0], optionIds[1], questionId],
        );
      });
      return { questionId, optionIds };
    };

    it('writes a question and its options in one transaction (the deferred reference to the correct option)', async () => {
      const quizId = await draft();
      const { questionId, optionIds } = await writeQuestion(
        quizId,
        (o) => o[1],
      );
      const [row] = await dataSource.query(
        `SELECT "correct_option_id" FROM "quiz_questions" WHERE "id" = $1`,
        [questionId],
      );
      expect(row.correct_option_id).toBe(optionIds[1]);
    });

    it('refuses a question whose correct option does not exist or belongs to another question', async () => {
      const quizId = await draft();
      await expect(
        writeQuestion(quizId, () => randomUUID()),
      ).rejects.toMatchObject({
        code: '23503',
      });
      const other = await writeQuestion(quizId, (o) => o[0]);
      await expect(
        writeQuestion(quizId, () => other.optionIds[0], 2),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('keeps positions unique, restricts the type and the option count of a position', async () => {
      const quizId = await draft();
      await writeQuestion(quizId, (o) => o[0]);
      await expect(writeQuestion(quizId, (o) => o[0])).rejects.toMatchObject({
        code: '23505',
      });
      await expect(
        dataSource.query(
          `UPDATE "quiz_questions" SET "type" = 'ESSAY' WHERE "quiz_id" = $1`,
          [quizId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const { questionId } = await writeQuestion(quizId, (o) => o[0], 3);
      await expect(
        dataSource.query(
          `INSERT INTO "quiz_options" ("id","question_id","position","text") VALUES (gen_random_uuid(),$1,7,'x')`,
          [questionId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects blank text and an unknown uploader', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "quizzes" ("title","created_by") VALUES ('   ',$1)`,
          [adminId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        dataSource.query(
          `INSERT INTO "quizzes" ("title","created_by") VALUES ('x',$1)`,
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('freezes the questions and options of a published quiz, and unfreezes them when it is unpublished', async () => {
      const quizId = await draft();
      const { questionId, optionIds } = await writeQuestion(
        quizId,
        (o) => o[0],
      );
      await dataSource.query(
        `UPDATE "quizzes" SET "status" = 'PUBLISHED', "published_at" = now() WHERE "id" = $1`,
        [quizId],
      );
      for (const statement of [
        `UPDATE "quiz_questions" SET "prompt" = 'changed' WHERE "id" = '${questionId}'`,
        `DELETE FROM "quiz_questions" WHERE "id" = '${questionId}'`,
        `UPDATE "quiz_options" SET "text" = 'changed' WHERE "id" = '${optionIds[0]}'`,
        `DELETE FROM "quiz_options" WHERE "id" = '${optionIds[1]}'`,
        `INSERT INTO "quiz_questions" ("id","quiz_id","position","prompt","correct_option_id") VALUES (gen_random_uuid(),'${quizId}',9,'Q?','${optionIds[0]}')`,
        `INSERT INTO "quiz_options" ("id","question_id","position","text") VALUES (gen_random_uuid(),'${questionId}',3,'c')`,
      ]) {
        await expect(dataSource.query(statement)).rejects.toMatchObject({
          code: '23000',
        });
      }
      await dataSource.query(
        `UPDATE "quizzes" SET "status" = 'DRAFT', "published_at" = NULL WHERE "id" = $1`,
        [quizId],
      );
      await expect(
        dataSource.query(
          `UPDATE "quiz_questions" SET "prompt" = 'changed' WHERE "id" = $1`,
          [questionId],
        ),
      ).resolves.toBeDefined();
    });

    it('requires published_at exactly when the quiz is published', async () => {
      const quizId = await draft();
      await expect(
        dataSource.query(
          `UPDATE "quizzes" SET "status" = 'PUBLISHED' WHERE "id" = $1`,
          [quizId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('deletes questions and options with their quiz', async () => {
      const quizId = await draft();
      const { questionId } = await writeQuestion(quizId, (o) => o[0]);
      await dataSource.query(`DELETE FROM "quizzes" WHERE "id" = $1`, [quizId]);
      const left = await dataSource.query(
        `SELECT (SELECT count(*)::int FROM "quiz_questions" WHERE "id" = $1) AS "q",
                (SELECT count(*)::int FROM "quiz_options" WHERE "question_id" = $1) AS "o"`,
        [questionId],
      );
      expect(left[0]).toEqual({ q: 0, o: 0 });
    });
  });

  describe('authoring', () => {
    it('creates a quiz with questions in order, and the correct option is the one marked', async () => {
      const quiz = await quizzes.create(adminId, content('create'));
      expect(quiz).toMatchObject({
        status: 'DRAFT',
        version: 1,
        createdBy: adminId,
      });
      expect(quiz.questions.map((q) => q.prompt)).toEqual([
        'First?',
        'Second?',
      ]);
      const first = quiz.questions[0];
      expect(first.options.map((o) => o.text)).toEqual(['Yes', 'No']);
      expect(
        first.options.find((o) => o.id === first.correctOptionId)?.text,
      ).toBe('Yes');
      const second = quiz.questions[1];
      expect(
        second.options.find((o) => o.id === second.correctOptionId)?.text,
      ).toBe('C');
    });

    it('refuses invalid content with every problem and stores nothing', async () => {
      const before = (await quizzes.list(1000, 0)).total;
      await expect(
        quizzes.create(
          adminId,
          content('bad', {
            questions: [
              { prompt: 'x', options: [{ text: 'only', correct: false }] },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect((await quizzes.list(1000, 0)).total).toBe(before);
    });

    it('replaces the content of a draft, moves the version, and detects a stale version', async () => {
      const quiz = await quizzes.create(adminId, content('update'));
      const updated = await quizzes.update(
        quiz.id,
        content('update-2', {
          questions: [
            {
              prompt: 'Only?',
              options: [
                { text: 'x', correct: false },
                { text: 'y', correct: true },
              ],
            },
          ],
        }),
        1,
      );
      expect(updated.version).toBe(2);
      expect(updated.questions.map((q) => q.prompt)).toEqual(['Only?']);
      expect(updated.title).toBe(title('update-2'));
      await expect(
        quizzes.update(quiz.id, content('stale'), 1),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await quizzes.get(quiz.id)).title).toBe(title('update-2'));
    });

    it('two simultaneous edits from the same version: exactly one wins', async () => {
      const quiz = await quizzes.create(adminId, content('race'));
      const results = await Promise.allSettled([
        quizzes.update(quiz.id, content('race-a'), 1),
        quizzes.update(quiz.id, content('race-b'), 1),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
          .reason,
      ).toBeInstanceOf(ConflictError);
      expect((await quizzes.get(quiz.id)).version).toBe(2);
    });

    it('publishes only a quiz with questions, freezes it, and allows editing again after unpublishing', async () => {
      const empty = await quizzes.create(
        adminId,
        content('empty', { questions: [] }),
      );
      await expect(quizzes.publish(empty.id)).rejects.toBeInstanceOf(
        BusinessRuleError,
      );

      const quiz = await quizzes.create(adminId, content('publish'));
      const published = await quizzes.publish(quiz.id);
      expect(published).toMatchObject({ status: 'PUBLISHED' });
      expect(published.publishedAt).toBeInstanceOf(Date);
      await expect(quizzes.publish(quiz.id)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        quizzes.update(quiz.id, content('nope')),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(quizzes.delete(quiz.id)).rejects.toBeInstanceOf(
        ConflictError,
      );

      const back = await quizzes.unpublish(quiz.id);
      expect(back).toMatchObject({ status: 'DRAFT', publishedAt: null });
      await expect(quizzes.unpublish(quiz.id)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        quizzes.update(quiz.id, content('again')),
      ).resolves.toBeDefined();
    });

    it('deletes a draft, and reports unknown quizzes as 404', async () => {
      const quiz = await quizzes.create(adminId, content('delete'));
      await quizzes.delete(quiz.id);
      await expect(quizzes.get(quiz.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(quizzes.delete(quiz.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(quizzes.publish(randomUUID())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('the learner side', () => {
    it('serves only published quizzes, and a draft looks exactly like a missing quiz', async () => {
      const quiz = await quizzes.create(adminId, content('learner'));
      const draft = await delivery.read(quiz.id).catch((e: unknown) => e);
      const missing = await delivery
        .read(randomUUID())
        .catch((e: unknown) => e);
      expect(draft).toBeInstanceOf(NotFoundError);
      expect((draft as Error).message).toBe((missing as Error).message);

      await quizzes.publish(quiz.id);
      const view = await delivery.read(quiz.id);
      expect(view.questions).toHaveLength(2);
      expect(JSON.stringify(view)).not.toMatch(/correct|explanation|Because/i);

      await quizzes.unpublish(quiz.id);
      await expect(delivery.read(quiz.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('scores a submission against the stored correct options', async () => {
      const quiz = await quizzes.publish(
        (await quizzes.create(adminId, content('score'))).id,
      );
      const [q1, q2] = quiz.questions;
      const right = (q: typeof q1) => ({
        questionId: q.id,
        optionId: q.correctOptionId,
      });
      const wrong = (q: typeof q1) => ({
        questionId: q.id,
        optionId: q.options.find((o) => o.id !== q.correctOptionId)!.id,
      });

      expect(
        (await delivery.submit(quiz.id, [right(q1), right(q2)])).score,
      ).toBe(2);
      const half = await delivery.submit(quiz.id, [right(q1), wrong(q2)]);
      expect(half).toMatchObject({ score: 1, total: 2 });
      expect(half.results[1]).toMatchObject({
        correct: false,
        correctOptionId: q2.correctOptionId,
      });
      expect(half.results[0].explanation).toBe('Because.');
      expect((await delivery.submit(quiz.id, [])).score).toBe(0);
      await expect(
        delivery.submit(quiz.id, [
          { questionId: q1.id, optionId: q2.options[0].id },
        ]),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });
  });
});
