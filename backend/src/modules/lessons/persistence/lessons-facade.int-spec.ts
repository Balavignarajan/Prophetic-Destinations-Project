import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  NotFoundError,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import { BlockLevelService } from '../application/block-level.service.js';
import { BlockService } from '../application/block.service.js';
import { LessonService } from '../application/lesson.service.js';
import { LessonsFacade } from '../application/lessons.facade.js';
import { LessonsModule } from '../lessons.module.js';
import { LessonBlockLevelRepository } from './lesson-block-level.repository.js';
import { LessonBlockRepository } from './lesson-block.repository.js';
import { LessonRepository } from './lesson.repository.js';

// Integration: content_revision and the LessonsFacade against the development database (DATABASE_URL).
// Everything created here hangs off a course with a per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;
const doc = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('content revision and the lessons facade (integration)', () => {
  let dataSource: DataSource;
  let lessons: LessonRepository;
  let blocks: LessonBlockRepository;
  let blockLevels: LessonBlockLevelRepository;
  let facade: LessonsFacade;
  let transactions: TransactionRunner;
  let closeModule: () => Promise<void>;
  let moduleRefFor: <T>(token: new (...args: never[]) => T) => T;

  const cleanup = async () => {
    const like = `int-${runId}-%`;
    const modules = `SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;
    const owned = `SELECT "id" FROM "lessons" WHERE "module_id" IN (${modules})`;
    await dataSource.query(
      `DELETE FROM "lesson_block_levels" WHERE "lesson_id" IN (${owned})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lesson_blocks" WHERE "lesson_id" IN (${owned})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lesson_levels" WHERE "lesson_id" IN (${owned})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lessons" WHERE "module_id" IN (${modules})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "course_modules" WHERE "course_id" IN (SELECT "id" FROM "courses" WHERE "title" LIKE $1)`,
      [like],
    );
    await dataSource.query(`DELETE FROM "courses" WHERE "title" LIKE $1`, [
      like,
    ]);
  };

  const newLesson = async (
    name: string,
    levels: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
  ) => {
    const [course] = await dataSource.query(
      `INSERT INTO "courses" ("title") VALUES ($1) RETURNING "id"`,
      [title(name)],
    );
    const [module] = await dataSource.query(
      `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,1) RETURNING "id"`,
      [course.id, title(`${name}-module`)],
    );
    const [lesson] = await dataSource.query(
      `INSERT INTO "lessons" ("module_id","title","position","status") VALUES ($1,$2,1,'APPROVED') RETURNING "id"`,
      [module.id, title(`${name}-lesson`)],
    );
    for (const level of levels) {
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,$2)`,
        [lesson.id, level],
      );
    }
    return lesson.id as string;
  };

  const row = async (lessonId: string) =>
    (
      await dataSource.query(
        `SELECT "status", "version", "content_revision" AS rev FROM "lessons" WHERE "id" = $1`,
        [lessonId],
      )
    )[0] as { status: string; version: number; rev: number };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, LessonsModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    lessons = moduleRef.get(LessonRepository, { strict: false });
    blocks = moduleRef.get(LessonBlockRepository, { strict: false });
    blockLevels = moduleRef.get(LessonBlockLevelRepository, { strict: false });
    facade = moduleRef.get(LessonsFacade);
    moduleRefFor = (token) => moduleRef.get(token, { strict: false });
    transactions = moduleRef.get(TransactionRunner, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('content_revision column', () => {
    it('starts at 1 and the database refuses anything below 1', async () => {
      const lessonId = await newLesson('column');
      expect((await row(lessonId)).rev).toBe(1);
      await expect(
        dataSource.query(
          `UPDATE "lessons" SET "content_revision" = 0 WHERE "id" = $1`,
          [lessonId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('an update moves the version and the revision, once each', async () => {
      const lessonId = await newLesson('update');
      await transactions.run((m) =>
        lessons.update(lessonId, { title: title('renamed') }, m),
      );
      expect(await row(lessonId)).toMatchObject({ version: 2, rev: 2 });
      await transactions.run((m) =>
        lessons.update(lessonId, { title: title('again') }, m),
      );
      expect(await row(lessonId)).toMatchObject({ version: 3, rev: 3 });
    });

    it('markDraft resets to DRAFT, moves the revision by exactly one and never touches the version', async () => {
      const lessonId = await newLesson('markdraft'); // created APPROVED
      await transactions.run((m) => lessons.markDraft(lessonId, m));
      expect(await row(lessonId)).toEqual({
        status: 'DRAFT',
        version: 1,
        rev: 2,
      });
    });

    it('concurrent effective changes each count exactly once', async () => {
      const lessonId = await newLesson('concurrent');
      await Promise.all(
        Array.from({ length: 8 }, () =>
          transactions.run((m) => lessons.markDraft(lessonId, m)),
        ),
      );
      expect((await row(lessonId)).rev).toBe(9);
    });
  });

  describe('compareAndSetStatus', () => {
    it('changes the status only from the expected one, and is not an authoring change', async () => {
      const lessonId = await newLesson('cas'); // created APPROVED
      const before = await row(lessonId);

      expect(
        await transactions.run((m) =>
          facade.compareAndSetStatus(lessonId, 'DRAFT', 'PUBLISHED', m),
        ),
      ).toBe(false);
      expect((await row(lessonId)).status).toBe('APPROVED');

      expect(
        await transactions.run((m) =>
          facade.compareAndSetStatus(lessonId, 'APPROVED', 'PUBLISHED', m),
        ),
      ).toBe(true);
      expect(await row(lessonId)).toEqual({
        status: 'PUBLISHED',
        version: before.version,
        rev: before.rev,
      });
    });

    it('is unknown-lesson safe', async () => {
      expect(
        await transactions.run((m) =>
          facade.compareAndSetStatus(randomUUID(), 'APPROVED', 'PUBLISHED', m),
        ),
      ).toBe(false);
    });

    it('two simultaneous transitions from the same status: exactly one wins', async () => {
      const lessonId = await newLesson('cas-race');
      const results = await Promise.all([
        transactions.run((m) =>
          facade.compareAndSetStatus(lessonId, 'APPROVED', 'PUBLISHED', m),
        ),
        transactions.run((m) =>
          facade.compareAndSetStatus(lessonId, 'APPROVED', 'PUBLISHED', m),
        ),
        transactions.run((m) =>
          facade.compareAndSetStatus(lessonId, 'APPROVED', 'PUBLISHED', m),
        ),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('the database still refuses a status outside the four approved ones (no ARCHIVED)', async () => {
      const lessonId = await newLesson('cas-check');
      await expect(
        transactions.run((m) =>
          facade.compareAndSetStatus(
            lessonId,
            'APPROVED',
            'ARCHIVED' as never,
            m,
          ),
        ),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
      expect((await row(lessonId)).status).toBe('APPROVED');
    });
  });

  describe('lockForWorkflow', () => {
    it('returns plain workflow data', async () => {
      const lessonId = await newLesson('lock-data', ['ADVANCED', 'BEGINNER']);
      const state = await transactions.run((m) =>
        facade.lockForWorkflow(lessonId, m),
      );
      expect(state).toMatchObject({
        id: lessonId,
        status: 'APPROVED',
        contentRevision: 1,
        availableLevels: ['BEGINNER', 'ADVANCED'],
      });
    });

    it('reports an unknown lesson', async () => {
      await expect(
        transactions.run((m) => facade.lockForWorkflow(randomUUID(), m)),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('holds the lesson lock: authoring writers wait until the transaction ends', async () => {
      const lessonId = await newLesson('lock-wait');
      const order: string[] = [];

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let markLocked!: () => void;
      const locked = new Promise<void>((resolve) => (markLocked = resolve));

      const holder = transactions.run(async (m) => {
        await facade.lockForWorkflow(lessonId, m);
        order.push('holder locked');
        markLocked();
        await gate;
        order.push('holder done');
      });

      await locked; // the lock is certainly held before the writer starts
      const writer = transactions.run(async (m) => {
        await lessons.findByIdForUpdate(lessonId, m); // what every authoring writer does first
        order.push('writer ran');
      });

      await wait(700);
      expect(order).toEqual(['holder locked']); // the writer is still waiting
      release();

      await Promise.all([holder, writer]);
      expect(order).toEqual(['holder locked', 'holder done', 'writer ran']);
    });
  });

  describe('requests that change nothing (real services, real database)', () => {
    let lessonService: LessonService;
    let blockService: BlockService;
    let levelService: BlockLevelService;

    beforeAll(() => {
      lessonService = moduleRefFor(LessonService);
      blockService = moduleRefFor(BlockService);
      levelService = moduleRefFor(BlockLevelService);
    });

    const snapshot = async (lessonId: string, blockId?: string) => ({
      lesson: (
        await dataSource.query(
          `SELECT "status", "version", "content_revision" AS rev, "updated_at" FROM "lessons" WHERE "id" = $1`,
          [lessonId],
        )
      )[0],
      block: blockId
        ? (
            await dataSource.query(
              `SELECT "version", "position", "updated_at" FROM "lesson_blocks" WHERE "id" = $1`,
              [blockId],
            )
          )[0]
        : undefined,
    });

    const setStatus = (lessonId: string, status: string) =>
      dataSource.query(`UPDATE "lessons" SET "status" = $2 WHERE "id" = $1`, [
        lessonId,
        status,
      ]);

    it.each(['READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'])(
      'every no-op path leaves a %s lesson and its block exactly as they were',
      async (status) => {
        const lessonId = await newLesson(`noop-${status.toLowerCase()}`, [
          'BEGINNER',
          'ADVANCED',
        ]);
        const block = await blockService.create(lessonId, {
          type: 'RICH_TEXT',
          sharedContent: doc('same'),
          levels: ['BEGINNER'],
        });
        const second = await blockService.create(lessonId, {
          type: 'RICH_TEXT',
          sharedContent: doc('two'),
        });
        await setStatus(lessonId, status);
        const before = await snapshot(lessonId, block.id);

        await lessonService.update(lessonId, {
          title: title(`noop-${status.toLowerCase()}-lesson`),
        });
        await lessonService.setLevels(lessonId, ['ADVANCED', 'BEGINNER']);
        await blockService.update(lessonId, block.id, {
          sharedContent: {
            body: { content: doc('same').body.content, type: 'doc' },
          },
        });
        await blockService.reorder(lessonId, [block.id, second.id]);
        await levelService.setLevel(lessonId, block.id, 'BEGINNER', {
          content: null,
        });
        await levelService.removeLevel(lessonId, block.id, 'ADVANCED', {});

        expect(await snapshot(lessonId, block.id)).toEqual(before);
        expect(before.lesson.status).toBe(status);
      },
    );

    it.each(['READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'])(
      'a genuine change to a %s lesson still resets it to DRAFT and moves the versions',
      async (status) => {
        const lessonId = await newLesson(`real-${status.toLowerCase()}`, [
          'BEGINNER',
        ]);
        const block = await blockService.create(lessonId, {
          type: 'RICH_TEXT',
          sharedContent: doc('a'),
        });
        const changes: [string, () => Promise<unknown>][] = [
          [
            'metadata',
            () => lessonService.update(lessonId, { subtitle: `s-${status}` }),
          ],
          ['levels', () => lessonService.setLevels(lessonId, [])],
          [
            'block content',
            () =>
              blockService.update(lessonId, block.id, {
                sharedContent: doc(`new-${status}`),
              }),
          ],
        ];
        for (const [name, change] of changes) {
          await setStatus(lessonId, status);
          const before = await snapshot(lessonId);
          await change();
          const after = await snapshot(lessonId);
          expect(after.lesson.status, name).toBe('DRAFT');
          expect(after.lesson.rev, name).toBe(before.lesson.rev + 1);
        }
      },
    );

    it('a stale version is still refused for a request that would change nothing', async () => {
      const lessonId = await newLesson('noop-stale', ['BEGINNER']);
      const block = await blockService.create(lessonId, {
        type: 'RICH_TEXT',
        sharedContent: doc('a'),
      });
      const current = (await snapshot(lessonId, block.id)).block
        .version as number;

      await expect(
        blockService.update(lessonId, block.id, {
          sharedContent: doc('a'),
          version: current + 1,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        lessonService.setLevels(lessonId, ['BEGINNER'], 99),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        levelService.setLevel(lessonId, block.id, 'BEGINNER', {
          content: null,
          version: 99,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('assembleForPublication', () => {
    const addBlock = async (
      lessonId: string,
      position: number,
      shared: Record<string, unknown> | null,
      visibleAt: LearningLevel[],
    ) => {
      const block = await transactions.run((m) =>
        blocks.insert(
          { lessonId, type: 'RICH_TEXT', sharedContent: shared, position },
          m,
        ),
      );
      for (const level of visibleAt) {
        await transactions.run((m) =>
          blockLevels.upsert(block.id, lessonId, level, null, m),
        );
      }
      return block;
    };

    it('resolves every available level separately from real rows, in one consistent read', async () => {
      const lessonId = await newLesson('assemble', ['BEGINNER', 'ADVANCED']);
      const first = await addBlock(lessonId, 1, doc('one'), [
        'BEGINNER',
        'ADVANCED',
      ]);
      const second = await addBlock(lessonId, 2, doc('two'), ['ADVANCED']);
      await addBlock(lessonId, 3, doc('three'), []); // hidden everywhere

      const assembled = await transactions.run(async (m) => {
        await facade.lockForWorkflow(lessonId, m);
        return facade.assembleForPublication(lessonId, m);
      });

      expect(assembled).toMatchObject({
        lessonId,
        status: 'APPROVED',
        contentRevision: 1,
        availableLevels: ['BEGINNER', 'ADVANCED'],
        lesson: { title: title('assemble-lesson'), coverMediaId: null },
      });
      expect(assembled.levels.map((l) => l.level)).toEqual([
        'BEGINNER',
        'ADVANCED',
      ]);
      const [beginner, advanced] = assembled.levels;
      expect(beginner.resolution.blocks.map((b) => b.blockId)).toEqual([
        first.id,
      ]);
      expect(advanced.resolution.blocks.map((b) => b.blockId)).toEqual([
        first.id,
        second.id,
      ]);
      expect(
        assembled.levels.every((l) => l.resolution.diagnostics.length === 0),
      ).toBe(true);
      expect(assembled.levels.every((l) => l.blockProblems.length === 0)).toBe(
        true,
      );
    });

    it('reports a stored variant for RICH_TEXT as not allowed (variants are unconfirmed) and never uses it', async () => {
      const lessonId = await newLesson('assemble-variant', ['BEGINNER']);
      const block = await addBlock(lessonId, 1, doc('shared'), []);
      await dataSource.query(
        `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level","content") VALUES ($1,$2,'BEGINNER',$3::jsonb)`,
        [block.id, lessonId, JSON.stringify(doc('STORED-VARIANT'))],
      );

      const [beginner] = (
        await transactions.run((m) =>
          facade.assembleForPublication(lessonId, m),
        )
      ).levels;
      expect(beginner.resolution.diagnostics.map((d) => d.code)).toEqual([
        'BLOCK_VARIANT_NOT_ALLOWED',
      ]);
      expect(JSON.stringify(beginner)).not.toContain('STORED-VARIANT');
    });

    it('reports incomplete block content', async () => {
      const lessonId = await newLesson('assemble-incomplete', ['BEGINNER']);
      const block = await addBlock(lessonId, 1, doc('   '), ['BEGINNER']);
      const [beginner] = (
        await transactions.run((m) =>
          facade.assembleForPublication(lessonId, m),
        )
      ).levels;
      expect(beginner.blockProblems).toEqual([
        {
          blockId: block.id,
          code: 'BLOCK_CONTENT_INCOMPLETE',
          problems: [expect.any(Object)],
        },
      ]);
    });

    it('reports an unknown lesson', async () => {
      await expect(
        transactions.run((m) => facade.assembleForPublication(randomUUID(), m)),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
