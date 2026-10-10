import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import { LessonsModule } from '../lessons.module.js';
import { LessonBlockLevelRepository } from './lesson-block-level.repository.js';
import { LessonBlockRepository } from './lesson-block.repository.js';
import { LessonRepository } from './lesson.repository.js';

// Integration: the real repositories against the development database (DATABASE_URL).
// Everything created here hangs off a course with a per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;

const doc = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

describe('lesson block levels persistence (integration)', () => {
  let dataSource: DataSource;
  let lessons: LessonRepository;
  let blocks: LessonBlockRepository;
  let levels: LessonBlockLevelRepository;
  let transactions: TransactionRunner;
  let closeModule: () => Promise<void>;

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

  /** A fresh course > module > lesson available at the given levels. Returns the lesson id. */
  const newLesson = async (
    name: string,
    lessonLevels: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
  ): Promise<string> => {
    const [course] = await dataSource.query(
      `INSERT INTO "courses" ("title") VALUES ($1) RETURNING "id"`,
      [title(name)],
    );
    const [module] = await dataSource.query(
      `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,1) RETURNING "id"`,
      [course.id, title(`${name}-module`)],
    );
    const [lesson] = await dataSource.query(
      `INSERT INTO "lessons" ("module_id","title","position") VALUES ($1,$2,1) RETURNING "id"`,
      [module.id, title(`${name}-lesson`)],
    );
    for (const level of lessonLevels) {
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,$2)`,
        [lesson.id, level],
      );
    }
    return lesson.id;
  };

  const newBlock = async (lessonId: string, position = 1) =>
    transactions.run((manager) =>
      blocks.insert(
        { lessonId, type: 'RICH_TEXT', sharedContent: doc('shared'), position },
        manager,
      ),
    );

  const setLevel = (
    blockId: string,
    lessonId: string,
    level: LearningLevel,
    content: Record<string, unknown> | null,
  ) =>
    transactions.run((manager) =>
      levels.upsert(blockId, lessonId, level, content, manager),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, LessonsModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    lessons = moduleRef.get(LessonRepository, { strict: false });
    blocks = moduleRef.get(LessonBlockRepository, { strict: false });
    levels = moduleRef.get(LessonBlockLevelRepository, { strict: false });
    transactions = moduleRef.get(TransactionRunner, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('visibility and variants', () => {
    it('a row means visible; with null content the block uses its shared content', async () => {
      const lessonId = await newLesson('visible');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'BEGINNER', null);

      expect(await levels.listByBlock(block.id)).toEqual([
        { level: 'BEGINNER', content: null },
      ]);
      const [row] = await dataSource.query(
        `SELECT "content" IS NULL AS is_null FROM "lesson_block_levels" WHERE "block_id" = $1`,
        [block.id],
      );
      expect(row.is_null).toBe(true);
    });

    it('stores a variant and reads it back exactly', async () => {
      const lessonId = await newLesson('variant');
      const block = await newBlock(lessonId);
      await setLevel(
        block.id,
        lessonId,
        'ADVANCED',
        doc('advanced variant ✝ 日本'),
      );
      expect(await levels.find(block.id, 'ADVANCED')).toEqual({
        blockId: block.id,
        level: 'ADVANCED',
        content: doc('advanced variant ✝ 日本'),
      });
    });

    it('a second write fully replaces the first: nothing is merged', async () => {
      const lessonId = await newLesson('replace');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'BEGINNER', {
        a: 1,
        b: { c: 2 },
        d: [1, 2, 3],
      });
      await setLevel(block.id, lessonId, 'BEGINNER', { x: 'only' });
      expect((await levels.find(block.id, 'BEGINNER'))?.content).toEqual({
        x: 'only',
      });

      await setLevel(block.id, lessonId, 'BEGINNER', null);
      expect((await levels.find(block.id, 'BEGINNER'))?.content).toBeNull();
      expect(await levels.listByBlock(block.id)).toHaveLength(1);
    });

    it("lists a block's levels in canonical order whatever order they were written in", async () => {
      const lessonId = await newLesson('order');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'ADVANCED', null);
      await setLevel(block.id, lessonId, 'BEGINNER', null);
      await setLevel(block.id, lessonId, 'INTERMEDIATE', null);
      expect((await levels.listByBlock(block.id)).map((l) => l.level)).toEqual([
        'BEGINNER',
        'INTERMEDIATE',
        'ADVANCED',
      ]);
    });

    it('lists the rows of every block of a lesson in one call, and only that lesson', async () => {
      const lessonId = await newLesson('list');
      const other = await newLesson('list-other');
      const a = await newBlock(lessonId, 1);
      const b = await newBlock(lessonId, 2);
      const foreign = await newBlock(other, 1);
      await setLevel(a.id, lessonId, 'BEGINNER', null);
      await setLevel(b.id, lessonId, 'ADVANCED', doc('b'));
      await setLevel(foreign.id, other, 'BEGINNER', null);

      const rows = await levels.listByLesson(lessonId);
      const byKey = (x: string, y: string) => x.localeCompare(y);
      expect(rows.map((r) => `${r.blockId}:${r.level}`).sort(byKey)).toEqual(
        [`${a.id}:BEGINNER`, `${b.id}:ADVANCED`].sort(byKey),
      );
    });

    it('deletes one level row and leaves the others', async () => {
      const lessonId = await newLesson('delete-one');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'BEGINNER', null);
      await setLevel(block.id, lessonId, 'ADVANCED', null);
      await transactions.run((manager) =>
        levels.delete(block.id, 'BEGINNER', manager),
      );
      expect((await levels.listByBlock(block.id)).map((l) => l.level)).toEqual([
        'ADVANCED',
      ]);
    });
  });

  describe('constraints', () => {
    it('allows one row per block and level (primary key)', async () => {
      const lessonId = await newLesson('pk');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'BEGINNER', null);
      await expect(
        dataSource.query(
          `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,'BEGINNER')`,
          [block.id, lessonId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it("composite FK 1: a row's lesson must be the block's own lesson", async () => {
      const lessonId = await newLesson('fk1');
      const other = await newLesson('fk1-other');
      const block = await newBlock(lessonId);
      await expect(
        dataSource.query(
          `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,'BEGINNER')`,
          [block.id, other],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        dataSource.query(
          `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,'BEGINNER')`,
          [randomUUID(), lessonId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('composite FK 2: a block can only be visible at levels its lesson is available at', async () => {
      const lessonId = await newLesson('fk2', ['BEGINNER']);
      const block = await newBlock(lessonId);

      await expect(
        dataSource.query(
          `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,'ADVANCED')`,
          [block.id, lessonId],
        ),
      ).rejects.toMatchObject({ code: '23503' });

      await expect(
        setLevel(block.id, lessonId, 'ADVANCED', null),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(await levels.listByBlock(block.id)).toEqual([]);
      await expect(
        setLevel(block.id, lessonId, 'BEGINNER', null),
      ).resolves.toBeUndefined();
    });

    it('rejects anything but the three levels (check)', async () => {
      const lessonId = await newLesson('level-check');
      const block = await newBlock(lessonId);
      for (const level of ['EXPERT', 'beginner', '']) {
        await expect(
          dataSource.query(
            `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,$3)`,
            [block.id, lessonId, level],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('content must be a JSON object or SQL NULL, within the size backstop', async () => {
      const lessonId = await newLesson('content-check');
      const block = await newBlock(lessonId);
      const insert = (json: string, level: string) =>
        dataSource.query(
          `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level","content") VALUES ($1,$2,$3,$4::jsonb)`,
          [block.id, lessonId, level, json],
        );
      for (const json of ['[]', '[{"a":1}]', '"text"', '42', 'true', 'null']) {
        await expect(insert(json, 'BEGINNER')).rejects.toMatchObject({
          code: '23514',
        });
      }
      await expect(insert('{}', 'BEGINNER')).resolves.toBeDefined();
      await expect(
        insert(JSON.stringify({ x: 'a'.repeat(199_000) }), 'INTERMEDIATE'),
      ).resolves.toBeDefined();
      await expect(
        insert(JSON.stringify({ x: 'a'.repeat(200_000) }), 'ADVANCED'),
      ).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('the (id, lesson_id) unique constraint the foreign key relies on is not deferrable', async () => {
      const [row] = await dataSource.query(
        `SELECT "condeferrable", "contype" FROM "pg_constraint" WHERE "conname" = 'UQ_lesson_blocks_id_lesson_id'`,
      );
      expect(row).toEqual({ condeferrable: false, contype: 'u' });
    });
  });

  describe('RESTRICT: nothing is deleted silently', () => {
    it('a lesson level used by a block cannot be deleted', async () => {
      const lessonId = await newLesson('restrict-level');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'ADVANCED', null);
      await expect(
        dataSource.query(
          `DELETE FROM "lesson_levels" WHERE "lesson_id" = $1 AND "level" = 'ADVANCED'`,
          [lessonId],
        ),
      ).rejects.toMatchObject({ code: '23001' });
      // a level no block uses can go
      await expect(
        dataSource.query(
          `DELETE FROM "lesson_levels" WHERE "lesson_id" = $1 AND "level" = 'BEGINNER'`,
          [lessonId],
        ),
      ).resolves.toBeDefined();
    });

    it('the repository turns that refusal into a ConflictError and rolls back', async () => {
      const lessonId = await newLesson('restrict-repo');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'ADVANCED', null);
      await expect(
        transactions.run((manager) =>
          lessons.replaceLevels(
            lessonId,
            ['BEGINNER', 'INTERMEDIATE'],
            manager,
          ),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await lessons.findById(lessonId))?.levels).toEqual([
        'BEGINNER',
        'INTERMEDIATE',
        'ADVANCED',
      ]);
    });

    it('a block with level rows cannot be deleted until the rows are deleted explicitly', async () => {
      const lessonId = await newLesson('restrict-block');
      const block = await newBlock(lessonId);
      await setLevel(block.id, lessonId, 'BEGINNER', doc('variant'));
      await expect(
        dataSource.query(`DELETE FROM "lesson_blocks" WHERE "id" = $1`, [
          block.id,
        ]),
      ).rejects.toMatchObject({ code: '23001' });

      await transactions.run(async (manager) => {
        await levels.deleteAllForBlock(block.id, manager);
        await blocks.delete(block.id, manager);
      });
      expect(await blocks.findById(block.id)).toBeNull();
      expect(await levels.listByBlock(block.id)).toEqual([]);
    });
  });

  describe('copy, lookup and bookkeeping', () => {
    it('copies every row, including variants, to another block as independent rows', async () => {
      const lessonId = await newLesson('copy');
      const source = await newBlock(lessonId, 1);
      const target = await newBlock(lessonId, 2);
      await setLevel(source.id, lessonId, 'BEGINNER', doc('beginner variant'));
      await setLevel(source.id, lessonId, 'INTERMEDIATE', null);

      await transactions.run((manager) =>
        levels.copy(source.id, target.id, manager),
      );
      expect(await levels.listByBlock(target.id)).toEqual([
        { level: 'BEGINNER', content: doc('beginner variant') },
        { level: 'INTERMEDIATE', content: null },
      ]);

      await setLevel(target.id, lessonId, 'BEGINNER', doc('changed'));
      expect((await levels.find(source.id, 'BEGINNER'))?.content).toEqual(
        doc('beginner variant'),
      );
    });

    it('finds which blocks are visible at given levels', async () => {
      const lessonId = await newLesson('visible-at');
      const a = await newBlock(lessonId, 1);
      const b = await newBlock(lessonId, 2);
      await setLevel(a.id, lessonId, 'ADVANCED', null);
      await setLevel(b.id, lessonId, 'ADVANCED', null);
      await setLevel(b.id, lessonId, 'BEGINNER', null);

      const found = await transactions.run((manager) =>
        levels.findVisibleAt(lessonId, ['ADVANCED'], manager),
      );
      expect(found.map((row) => row.blockId).sort()).toEqual(
        [a.id, b.id].sort(),
      );
      expect(found.every((row) => row.level === 'ADVANCED')).toBe(true);
      expect(
        await transactions.run((manager) =>
          levels.findVisibleAt(lessonId, ['INTERMEDIATE'], manager),
        ),
      ).toEqual([]);
    });

    it('touch bumps the block version and updated_at', async () => {
      const lessonId = await newLesson('touch');
      const block = await newBlock(lessonId);
      await transactions.run((manager) => blocks.touch(block.id, manager));
      const touched = await blocks.findById(block.id);
      expect(touched?.version).toBe(block.version + 1);
      expect(touched!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        block.updatedAt.getTime(),
      );
    });

    it('rolls back level writes with the rest of the transaction', async () => {
      const lessonId = await newLesson('rollback');
      const block = await newBlock(lessonId);
      await expect(
        transactions.run(async (manager) => {
          await levels.upsert(
            block.id,
            lessonId,
            'BEGINNER',
            doc('x'),
            manager,
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await levels.listByBlock(block.id)).toEqual([]);
    });
  });
});
