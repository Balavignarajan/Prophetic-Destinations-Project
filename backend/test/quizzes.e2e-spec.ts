import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';

// Quizzes over HTTP: who may author and publish, validation, the freeze of a published quiz, what a learner can see
// (never the answers), and scoring.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-quiz-${runId}-${name}${EMAIL_SUFFIX}`;
const API = '/api/v1';
const ADMIN_QUIZZES = `${API}/admin/quizzes`;
const QUIZZES = `${API}/quizzes`;
const MISSING = '3f1b8b6e-7c1d-4a52-9d2e-0a1b2c3d4e5f';
const SECRET_EXPLANATION = 'Genesis 6 tells the story of the ark.';

const quizBody = (name: string, overrides: object = {}) => ({
  title: `e2e-${runId}-${name}`,
  description: 'A short demo quiz',
  questions: [
    {
      prompt: 'Who built the ark?',
      explanation: SECRET_EXPLANATION,
      options: [
        { text: 'Noah', correct: true },
        { text: 'Moses', correct: false },
        { text: 'David', correct: false },
      ],
    },
    {
      prompt: 'How many days did the flood rain fall?',
      options: [
        { text: '7', correct: false },
        { text: '40', correct: true },
      ],
    },
  ],
  ...overrides,
});

interface AdminQuiz {
  id: string;
  version: number;
  status: string;
  questions: {
    id: string;
    options: { id: string; text: string; correct: boolean }[];
  }[];
}

describe('Quizzes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;

  const create = async (name: string, overrides: object = {}) =>
    (
      await http()
        .post(ADMIN_QUIZZES)
        .set('Authorization', as(Role.EDITOR))
        .send(quizBody(name, overrides))
        .expect(201)
    ).body as AdminQuiz;
  const publish = (id: string) =>
    http()
      .post(`${ADMIN_QUIZZES}/${id}/publish`)
      .set('Authorization', as(Role.ADMIN));

  const correct = (quiz: AdminQuiz, index: number) =>
    quiz.questions[index].options.find((o) => o.correct)!;
  const wrong = (quiz: AdminQuiz, index: number) =>
    quiz.questions[index].options.find((o) => !o.correct)!;
  const answer = (quiz: AdminQuiz, index: number, option: { id: string }) => ({
    questionId: quiz.questions[index].id,
    optionId: option.id,
  });

  const cleanup = async () => {
    const owner = `SELECT "id" FROM "admins" WHERE "email" LIKE $1`;
    const pattern = `e2e-quiz-${runId}-%${EMAIL_SUFFIX}`;
    // a published quiz is frozen: unpublish what the tests left before deleting it
    await dataSource.query(
      `UPDATE "quizzes" SET "status" = 'DRAFT', "published_at" = NULL WHERE "created_by" IN (${owner})`,
      [pattern],
    );
    await dataSource.query(
      `DELETE FROM "quizzes" WHERE "created_by" IN (${owner})`,
      [pattern],
    );
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      pattern,
    ]);
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '1000';
    process.env.PUBLIC_RATE_LIMIT = '10000';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    await cleanup();
    for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
      await app.get(AdminProvisioningService).create({
        email: emailFor(role),
        password: PASSWORD,
        role,
      });
      const res = await http()
        .post(`${API}/admin/auth/login`)
        .send({ email: emailFor(role), password: PASSWORD })
        .expect(200);
      tokens[role] = res.body.accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('who may do what', () => {
    it('requires authentication for authoring, but not for the learner routes', async () => {
      await http().post(ADMIN_QUIZZES).send(quizBody('x')).expect(401);
      await http().get(ADMIN_QUIZZES).expect(401);
      await http().get(`${ADMIN_QUIZZES}/${MISSING}`).expect(401);
      await http()
        .put(`${ADMIN_QUIZZES}/${MISSING}`)
        .send(quizBody('x'))
        .expect(401);
      await http().post(`${ADMIN_QUIZZES}/${MISSING}/publish`).expect(401);
      await http().delete(`${ADMIN_QUIZZES}/${MISSING}`).expect(401);
      await http().get(`${QUIZZES}/${MISSING}`).expect(404); // anonymous reaches the route
    });

    it('REVIEWER reads but cannot change; EDITOR authors but cannot publish; ADMIN does everything', async () => {
      const quiz = await create('roles');
      const reviewer = as(Role.REVIEWER);
      await http()
        .get(ADMIN_QUIZZES)
        .set('Authorization', reviewer)
        .expect(200);
      await http()
        .get(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', reviewer)
        .expect(200);
      await http()
        .post(ADMIN_QUIZZES)
        .set('Authorization', reviewer)
        .send(quizBody('r'))
        .expect(403);
      await http()
        .put(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', reviewer)
        .send(quizBody('r'))
        .expect(403);
      await http()
        .delete(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', reviewer)
        .expect(403);

      await http()
        .put(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.EDITOR))
        .send(quizBody('roles-edited'))
        .expect(200);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/publish`)
        .set('Authorization', as(Role.EDITOR))
        .expect(403);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/publish`)
        .set('Authorization', reviewer)
        .expect(403);
      await publish(quiz.id).expect(200);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/unpublish`)
        .set('Authorization', as(Role.EDITOR))
        .expect(403);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/unpublish`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
      await http()
        .delete(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.EDITOR))
        .expect(204);
    });
  });

  describe('validation', () => {
    const post = (body: object) =>
      http()
        .post(ADMIN_QUIZZES)
        .set('Authorization', as(Role.EDITOR))
        .send(body);

    it('rejects malformed shapes with 400 and unknown fields', async () => {
      await post({ questions: [] }).expect(400); // no title
      await post(quizBody('x', { questions: 'nope' })).expect(400);
      await post(quizBody('x', { extra: 1 })).expect(400);
      await post(
        quizBody('x', {
          questions: [
            { prompt: 'p', options: [{ text: 'a', correct: 'yes' }] },
          ],
        }),
      ).expect(400);
      await post(
        quizBody('x', {
          questions: [{ prompt: 'p', type: 'ESSAY', options: [] }],
        }),
      ).expect(400); // question types other than the default cannot be asked for
      await http()
        .get(`${ADMIN_QUIZZES}/not-a-uuid`)
        .set('Authorization', as(Role.ADMIN))
        .expect(400);
      await http()
        .get(`${ADMIN_QUIZZES}?limit=0`)
        .set('Authorization', as(Role.ADMIN))
        .expect(400);
    });

    it('rejects content that breaks the quiz rules with 422 and a list of problems, storing nothing', async () => {
      const before = (
        await http()
          .get(`${ADMIN_QUIZZES}?limit=100`)
          .set('Authorization', as(Role.ADMIN))
      ).body.total;
      const bad = (questions: object[]) =>
        post(quizBody('bad', { questions })).expect(422);
      const none = await bad([
        {
          prompt: 'p',
          options: [
            { text: 'a', correct: false },
            { text: 'b', correct: false },
          ],
        },
      ]);
      expect(none.body.details[0]).toContain('exactly one option');
      await bad([
        {
          prompt: 'p',
          options: [
            { text: 'a', correct: true },
            { text: 'b', correct: true },
          ],
        },
      ]);
      await bad([{ prompt: 'p', options: [{ text: 'a', correct: true }] }]);
      await bad([
        {
          prompt: 'p',
          options: [
            { text: 'a', correct: true },
            { text: 'A', correct: false },
          ],
        },
      ]);
      await bad([
        {
          prompt: '   ',
          options: [
            { text: 'a', correct: true },
            { text: 'b', correct: false },
          ],
        },
      ]);
      await post(quizBody('bad', { title: '   ' })).expect(422);
      expect(
        (
          await http()
            .get(`${ADMIN_QUIZZES}?limit=100`)
            .set('Authorization', as(Role.ADMIN))
        ).body.total,
      ).toBe(before);
    });
  });

  describe('authoring', () => {
    it('creates, shows the answer key to staff, lists, and replaces a draft with version checking', async () => {
      const quiz = await create('author');
      expect(quiz).toMatchObject({ status: 'DRAFT', version: 1 });
      expect(quiz.questions).toHaveLength(2);
      expect(quiz.questions[0].options.filter((o) => o.correct)).toHaveLength(
        1,
      );
      expect(correct(quiz, 0).text).toBe('Noah');

      const shown = await http()
        .get(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(200);
      expect(shown.headers['cache-control']).toBe('no-store');
      expect(shown.body.questions[0].explanation).toBe(SECRET_EXPLANATION);

      const list = await http()
        .get(`${ADMIN_QUIZZES}?limit=100`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
      const row = list.body.items.find((q: { id: string }) => q.id === quiz.id);
      expect(row).toMatchObject({ status: 'DRAFT', questionCount: 2 });
      expect(JSON.stringify(row)).not.toMatch(/correct|explanation/i);

      const put = (version?: number) =>
        http()
          .put(`${ADMIN_QUIZZES}/${quiz.id}`)
          .set('Authorization', as(Role.EDITOR))
          .send({ ...quizBody('author-2'), version });
      const edited = await put(1).expect(200);
      expect(edited.body.version).toBe(2);
      await put(1).expect(409); // stale
      await put(2).expect(200);
      await http()
        .get(`${ADMIN_QUIZZES}/${MISSING}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
    });

    it('freezes a published quiz: no edits, no delete; publishing needs a question', async () => {
      const empty = await create('empty', { questions: [] });
      const refused = await publish(empty.id).expect(422);
      expect(refused.body.details[0]).toContain('at least one question');

      const quiz = await create('freeze');
      const published = await publish(quiz.id).expect(200);
      expect(published.body.status).toBe('PUBLISHED');
      await publish(quiz.id).expect(409);
      await http()
        .put(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.EDITOR))
        .send(quizBody('x'))
        .expect(409);
      await http()
        .delete(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(409);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/unpublish`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/unpublish`)
        .set('Authorization', as(Role.ADMIN))
        .expect(409);
      await http()
        .delete(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
      await http()
        .delete(`${ADMIN_QUIZZES}/${quiz.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
    });
  });

  describe('what a learner sees', () => {
    it('shows only published quizzes, with no answers, no explanations and no internal fields', async () => {
      const quiz = await create('learner');
      const draft = await http().get(`${QUIZZES}/${quiz.id}`).expect(404);
      const unknown = await http().get(`${QUIZZES}/${MISSING}`).expect(404);
      expect(draft.body.message).toBe(unknown.body.message);
      expect(draft.headers['cache-control']).toBe('no-store');

      await publish(quiz.id).expect(200);
      const res = await http().get(`${QUIZZES}/${quiz.id}`).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Object.keys(res.body).sort((a, b) => a.localeCompare(b))).toEqual([
        'description',
        'id',
        'questions',
        'title',
      ]);
      expect(res.body.questions).toHaveLength(2);
      expect(
        res.body.questions[0].options.map((o: { text: string }) => o.text),
      ).toEqual(['Noah', 'Moses', 'David']);
      for (const question of res.body.questions) {
        expect(
          Object.keys(question).sort((a, b) => a.localeCompare(b)),
        ).toEqual(['id', 'options', 'prompt', 'type']);
        for (const option of question.options) {
          expect(
            Object.keys(option).sort((a, b) => a.localeCompare(b)),
          ).toEqual(['id', 'text']);
        }
      }
      const text = res.text;
      expect(text).not.toMatch(/correct|explanation|status|version|createdBy/i);
      expect(text).not.toContain(SECRET_EXPLANATION);
    });

    it('stops serving a quiz the moment it is unpublished', async () => {
      const quiz = await create('withdraw');
      await publish(quiz.id).expect(200);
      await http().get(`${QUIZZES}/${quiz.id}`).expect(200);
      await http()
        .post(`${ADMIN_QUIZZES}/${quiz.id}/unpublish`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
      await http().get(`${QUIZZES}/${quiz.id}`).expect(404);
      await http()
        .post(`${QUIZZES}/${quiz.id}/submissions`)
        .send({ answers: [] })
        .expect(404);
    });
  });

  describe('checking answers', () => {
    let quiz: AdminQuiz;
    beforeAll(async () => {
      quiz = await create('scoring');
      await publish(quiz.id).expect(200);
    });
    const submit = (answers: unknown) =>
      http().post(`${QUIZZES}/${quiz.id}/submissions`).send({ answers });

    it('scores correct, partly correct, wrong and unanswered submissions and reveals the answers only in the result', async () => {
      const all = await submit([
        answer(quiz, 0, correct(quiz, 0)),
        answer(quiz, 1, correct(quiz, 1)),
      ]).expect(200);
      expect(all.headers['cache-control']).toBe('no-store');
      expect(all.body).toMatchObject({ quizId: quiz.id, score: 2, total: 2 });

      const half = await submit([
        answer(quiz, 0, correct(quiz, 0)),
        answer(quiz, 1, wrong(quiz, 1)),
      ]).expect(200);
      expect(half.body.score).toBe(1);
      expect(half.body.results[0]).toEqual({
        questionId: quiz.questions[0].id,
        answeredOptionId: correct(quiz, 0).id,
        correct: true,
        correctOptionId: correct(quiz, 0).id,
        explanation: SECRET_EXPLANATION,
      });
      expect(half.body.results[1]).toMatchObject({
        correct: false,
        answeredOptionId: wrong(quiz, 1).id,
        correctOptionId: correct(quiz, 1).id,
        explanation: null,
      });

      const none = await submit([]).expect(200);
      expect(none.body.score).toBe(0);
      expect(
        none.body.results.every(
          (r: { answeredOptionId: unknown }) => r.answeredOptionId === null,
        ),
      ).toBe(true);
      const wrongBoth = await submit([
        answer(quiz, 0, wrong(quiz, 0)),
        answer(quiz, 1, wrong(quiz, 1)),
      ]).expect(200);
      expect(wrongBoth.body.score).toBe(0);
    });

    it('does not store anything: the same submission always gives the same result', async () => {
      const before = await dataSource.query(
        `SELECT count(*)::int AS "n" FROM "quizzes"`,
      );
      const a = await submit([answer(quiz, 0, correct(quiz, 0))]).expect(200);
      const b = await submit([answer(quiz, 0, correct(quiz, 0))]).expect(200);
      expect(a.body).toEqual(b.body);
      expect(
        await dataSource.query(`SELECT count(*)::int AS "n" FROM "quizzes"`),
      ).toEqual(before);
    });

    it('refuses answers that do not fit the quiz, as a whole, and malformed bodies', async () => {
      await submit([{ questionId: MISSING, optionId: MISSING }]).expect(422);
      await submit([answer(quiz, 0, quiz.questions[1].options[0])]).expect(422); // another question's option
      await submit([
        answer(quiz, 0, correct(quiz, 0)),
        answer(quiz, 0, wrong(quiz, 0)),
      ]).expect(422); // twice
      await submit('nope').expect(400);
      await submit([{ questionId: 'x', optionId: 'y' }]).expect(400);
      await http()
        .post(`${QUIZZES}/${quiz.id}/submissions`)
        .send({})
        .expect(400);
      await http()
        .post(`${QUIZZES}/${quiz.id}/submissions`)
        .send({ answers: [], extra: 1 })
        .expect(400);
      await http()
        .post(`${QUIZZES}/not-a-uuid/submissions`)
        .send({ answers: [] })
        .expect(400);
      await http()
        .post(`${QUIZZES}/${MISSING}/submissions`)
        .send({ answers: [] })
        .expect(404);
    });
  });
});
