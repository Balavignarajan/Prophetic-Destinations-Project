import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import { BLOCK_TYPES, type BlockType } from '../domain/blocks/block-types.js';
import { LessonsModule } from '../lessons.module.js';
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

describe('lesson blocks persistence (integration)', () => {
  let dataSource: DataSource;
  let lessons: LessonRepository;
  let blocks: LessonBlockRepository;
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

  /** A fresh course > module > lesson, created with plain SQL. Returns the lesson id. */
  const newLesson = async (name: string): Promise<string> => {
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
    return lesson.id;
  };

  const newBlock = (
    lessonId: string,
    label: string,
    position: number,
    type: BlockType = 'RICH_TEXT',
  ) =>
    transactions.run((manager) =>
      blocks.insert(
        { lessonId, type, sharedContent: doc(label), position },
        manager,
      ),
    );

  const layout = async (lessonId: string) =>
    (await blocks.listByLesson(lessonId)).map((b) => [
      b.position,
      (b.sharedContent as ReturnType<typeof doc> | null)?.body.content[0]
        .content[0].text,
    ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, LessonsModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    lessons = moduleRef.get(LessonRepository, { strict: false });
    blocks = moduleRef.get(LessonBlockRepository, { strict: false });
    transactions = moduleRef.get(TransactionRunner, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('blocks', () => {
    it('stores a block and reads it back as a plain domain object', async () => {
      const lessonId = await newLesson('basic');
      const created = await newBlock(lessonId, 'Hello', 1);
      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        lessonId,
        type: 'RICH_TEXT',
        position: 1,
        sharedContent: doc('Hello'),
        version: 1,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await blocks.findById(created.id)).toEqual(created);
    });

    it('round-trips nested JSON exactly', async () => {
      const lessonId = await newLesson('json');
      const content = {
        body: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Héllo ✝ 日本' }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'x',
                          marks: [
                            { type: 'link', attrs: { href: 'https://a.com' } },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
      const created = await transactions.run((manager) =>
        blocks.insert(
          { lessonId, type: 'RICH_TEXT', sharedContent: content, position: 1 },
          manager,
        ),
      );
      expect((await blocks.findById(created.id))?.sharedContent).toEqual(
        content,
      );
    });

    it('stores a block with no content as SQL NULL', async () => {
      const lessonId = await newLesson('null');
      const created = await transactions.run((manager) =>
        blocks.insert(
          { lessonId, type: 'RICH_TEXT', sharedContent: null, position: 1 },
          manager,
        ),
      );
      expect(created.sharedContent).toBeNull();
      const [row] = await dataSource.query(
        `SELECT "shared_content" IS NULL AS is_null FROM "lesson_blocks" WHERE "id" = $1`,
        [created.id],
      );
      expect(row.is_null).toBe(true);
    });

    it('returns null for an unknown block', async () => {
      expect(await blocks.findById(randomUUID())).toBeNull();
    });

    it('updates content, bumps the version and keeps id, type and position', async () => {
      const lessonId = await newLesson('update');
      const created = await newBlock(lessonId, 'old', 1);
      const updated = await transactions.run((manager) =>
        blocks.updateContent(created.id, doc('new'), manager),
      );
      expect(updated).toMatchObject({
        id: created.id,
        type: 'RICH_TEXT',
        position: 1,
        sharedContent: doc('new'),
        version: 2,
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
    });

    it('clears content to SQL NULL, not JSON null', async () => {
      const lessonId = await newLesson('clear');
      const created = await newBlock(lessonId, 'x', 1);
      await transactions.run((manager) =>
        blocks.updateContent(created.id, null, manager),
      );
      const [row] = await dataSource.query(
        `SELECT "shared_content" IS NULL AS is_null FROM "lesson_blocks" WHERE "id" = $1`,
        [created.id],
      );
      expect(row.is_null).toBe(true);
    });

    it('locks the block row for update inside a transaction', async () => {
      const lessonId = await newLesson('lock');
      const created = await newBlock(lessonId, 'x', 1);
      const locked = await transactions.run((manager) =>
        blocks.findByIdForUpdate(created.id, manager),
      );
      expect(locked?.id).toBe(created.id);
    });

    it('deletes a block', async () => {
      const lessonId = await newLesson('delete');
      const created = await newBlock(lessonId, 'x', 1);
      await transactions.run((manager) => blocks.delete(created.id, manager));
      expect(await blocks.findById(created.id)).toBeNull();
    });
  });

  describe('lesson relationship', () => {
    it('requires an existing lesson (foreign key)', async () => {
      await expect(newBlock(randomUUID(), 'orphan', 1)).rejects.toMatchObject({
        driverError: { code: '23503' },
      });
    });

    it('lists the blocks of one lesson only, in position order', async () => {
      const one = await newLesson('list-1');
      const two = await newLesson('list-2');
      await newBlock(one, 'c', 3);
      await newBlock(one, 'a', 1);
      await newBlock(one, 'b', 2);
      await newBlock(two, 'z', 1);

      expect(await layout(one)).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
      expect(await layout(two)).toEqual([[1, 'z']]);
      expect(await blocks.countByLesson(one)).toBe(3);
    });

    it('refuses to delete a lesson that has blocks (ON DELETE RESTRICT)', async () => {
      const lessonId = await newLesson('restrict');
      await newBlock(lessonId, 'a', 1);
      await expect(
        dataSource.query(`DELETE FROM "lessons" WHERE "id" = $1`, [lessonId]),
      ).rejects.toMatchObject({ code: '23001' });
      expect(await blocks.countByLesson(lessonId)).toBe(1);
    });

    it('turns that refusal into a ConflictError and rolls back the level rows too', async () => {
      const lessonId = await newLesson('backstop');
      await newBlock(lessonId, 'a', 1);
      await transactions.run((manager) =>
        lessons.replaceLevels(lessonId, ['BEGINNER'], manager),
      );

      await expect(
        transactions.run((manager) => lessons.delete(lessonId, manager)),
      ).rejects.toBeInstanceOf(ConflictError);

      expect((await lessons.findById(lessonId))?.levels).toEqual(['BEGINNER']);
      expect(await blocks.countByLesson(lessonId)).toBe(1);
    });

    it('allows deleting the lesson once its blocks are gone', async () => {
      const lessonId = await newLesson('after');
      const block = await newBlock(lessonId, 'a', 1);
      await transactions.run(async (manager) => {
        await blocks.delete(block.id, manager);
        await lessons.delete(lessonId, manager);
      });
      expect(await lessons.findById(lessonId)).toBeNull();
    });

    it('marks the lesson as a draft without bumping its version', async () => {
      const lessonId = await newLesson('draft');
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );
      const before = await lessons.findById(lessonId);

      await transactions.run((manager) => lessons.markDraft(lessonId, manager));

      const after = await lessons.findById(lessonId);
      expect(after?.status).toBe('DRAFT');
      expect(after?.version).toBe(before?.version);
      expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        before!.updatedAt.getTime(),
      );
    });
  });

  describe('block type', () => {
    it('accepts every one of the 19 types the guide defines, and the CHECK lists exactly those', async () => {
      const lessonId = await newLesson('types');
      for (const [index, type] of BLOCK_TYPES.entries()) {
        await newBlock(lessonId, type, index + 1, type);
      }
      const rows = await blocks.listByLesson(lessonId);
      expect(rows.map((b) => b.type)).toEqual([...BLOCK_TYPES]);

      const [{ def }] = await dataSource.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'chk_lesson_blocks_type'`,
      );
      const listed = [...def.matchAll(/'([A-Z_]+)'::character varying/g)].map(
        (m) => m[1],
      );
      const byName = (a: string, b: string) => a.localeCompare(b);
      expect(listed.sort(byName)).toEqual([...BLOCK_TYPES].sort(byName));
    });

    it('rejects any other type', async () => {
      const lessonId = await newLesson('badtype');
      for (const type of [
        'HTML',
        'rich_text',
        'Rich_Text',
        '',
        'TEXT',
        'RICH_TEXT ',
      ]) {
        await expect(
          dataSource.query(
            `INSERT INTO "lesson_blocks" ("lesson_id","type","position") VALUES ($1,$2,1)`,
            [lessonId, type],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('can never be changed after creation (database trigger)', async () => {
      const lessonId = await newLesson('immutable');
      const block = await newBlock(lessonId, 'x', 1);

      await expect(
        dataSource.query(
          `UPDATE "lesson_blocks" SET "type" = 'SUMMARY' WHERE "id" = $1`,
          [block.id],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        message: expect.stringContaining('immutable'),
      });
      expect((await blocks.findById(block.id))?.type).toBe('RICH_TEXT');
    });

    it('still allows other changes, and writing the same type again', async () => {
      const lessonId = await newLesson('immutable-ok');
      const block = await newBlock(lessonId, 'x', 1);
      await dataSource.query(
        `UPDATE "lesson_blocks" SET "type" = 'RICH_TEXT', "position" = 2 WHERE "id" = $1`,
        [block.id],
      );
      await transactions.run((manager) =>
        blocks.updateContent(block.id, doc('y'), manager),
      );
      expect(await blocks.findById(block.id)).toMatchObject({
        type: 'RICH_TEXT',
        position: 2,
      });
    });
  });

  describe('shared_content', () => {
    const insertRaw = async (
      lessonId: string,
      json: string | null,
      position = 1,
    ) =>
      dataSource.query(
        `INSERT INTO "lesson_blocks" ("lesson_id","type","position","shared_content") VALUES ($1,'RICH_TEXT',$2,$3::jsonb)`,
        [lessonId, position, json],
      );

    it('must be a JSON object: arrays, strings, numbers and JSON null are rejected', async () => {
      const lessonId = await newLesson('content-type');
      for (const json of ['[]', '[{"a":1}]', '"text"', '42', 'true', 'null']) {
        await expect(insertRaw(lessonId, json)).rejects.toMatchObject({
          code: '23514',
        });
      }
      await expect(insertRaw(lessonId, '{}')).resolves.toBeDefined();
    });

    it('accepts SQL NULL', async () => {
      const lessonId = await newLesson('content-null');
      await expect(insertRaw(lessonId, null)).resolves.toBeDefined();
    });

    it('has a size backstop of 200000 characters', async () => {
      const lessonId = await newLesson('content-size');
      const sized = (chars: number) => JSON.stringify({ x: 'a'.repeat(chars) });
      await expect(
        insertRaw(lessonId, sized(199_000), 1),
      ).resolves.toBeDefined();
      await expect(
        insertRaw(lessonId, sized(200_000), 2),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('cannot store a NUL character, which is why the application rejects it first', async () => {
      const lessonId = await newLesson('content-nul');
      await expect(
        transactions.run((manager) =>
          blocks.insert(
            {
              lessonId,
              type: 'RICH_TEXT',
              sharedContent: { text: 'a\u0000b' },
              position: 1,
            },
            manager,
          ),
        ),
      ).rejects.toBeDefined();
    });
  });

  describe('ordering', () => {
    it('rejects a duplicate position within a lesson with a ConflictError', async () => {
      const lessonId = await newLesson('dup');
      await newBlock(lessonId, 'first', 1);
      await expect(newBlock(lessonId, 'second', 1)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(await blocks.countByLesson(lessonId)).toBe(1);
    });

    it('allows the same position in different lessons', async () => {
      const one = await newLesson('iso-1');
      const two = await newLesson('iso-2');
      await newBlock(one, 'x', 1);
      await expect(newBlock(two, 'y', 1)).resolves.toMatchObject({
        position: 1,
      });
    });

    it('enforces unique (lesson_id, position) in the database itself', async () => {
      const lessonId = await newLesson('dbunique');
      await newBlock(lessonId, 'x', 1);
      await expect(
        dataSource.query(
          `INSERT INTO "lesson_blocks" ("lesson_id","type","position") VALUES ($1,'RICH_TEXT',1)`,
          [lessonId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects positions below 1', async () => {
      const lessonId = await newLesson('pos0');
      for (const position of [0, -1]) {
        await expect(
          dataSource.query(
            `INSERT INTO "lesson_blocks" ("lesson_id","type","position") VALUES ($1,'RICH_TEXT',$2)`,
            [lessonId, position],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('opens a gap with a single shift without tripping the unique constraint', async () => {
      const lessonId = await newLesson('shift');
      await newBlock(lessonId, 'a', 1);
      await newBlock(lessonId, 'b', 2);
      await newBlock(lessonId, 'c', 3);

      await transactions.run((manager) =>
        blocks.shiftFrom(lessonId, 2, 1, manager),
      );
      expect(await layout(lessonId)).toEqual([
        [1, 'a'],
        [3, 'b'],
        [4, 'c'],
      ]);

      await newBlock(lessonId, 'x', 2);
      expect(await layout(lessonId)).toEqual([
        [1, 'a'],
        [2, 'x'],
        [3, 'b'],
        [4, 'c'],
      ]);
    });

    it('closes a gap with a single shift', async () => {
      const lessonId = await newLesson('close');
      const a = await newBlock(lessonId, 'a', 1);
      await newBlock(lessonId, 'b', 2);
      await newBlock(lessonId, 'c', 3);
      await transactions.run(async (manager) => {
        await blocks.delete(a.id, manager);
        await blocks.shiftFrom(lessonId, 2, -1, manager);
      });
      expect(await layout(lessonId)).toEqual([
        [1, 'b'],
        [2, 'c'],
      ]);
    });

    it('reorders, including a swap, in one statement, keeping ids stable', async () => {
      const lessonId = await newLesson('reorder');
      const a = await newBlock(lessonId, 'a', 1);
      const b = await newBlock(lessonId, 'b', 2);
      const c = await newBlock(lessonId, 'c', 3);

      await transactions.run((manager) =>
        blocks.applyPositions(lessonId, [c.id, a.id, b.id], [1, 2, 3], manager),
      );
      expect(await layout(lessonId)).toEqual([
        [1, 'c'],
        [2, 'a'],
        [3, 'b'],
      ]);
      expect((await blocks.listByLesson(lessonId)).map((x) => x.id)).toEqual([
        c.id,
        a.id,
        b.id,
      ]);

      await transactions.run((manager) =>
        blocks.applyPositions(lessonId, [a.id, c.id], [1, 2], manager),
      );
      expect(await layout(lessonId)).toEqual([
        [1, 'a'],
        [2, 'c'],
        [3, 'b'],
      ]);
    });

    it('never moves blocks of another lesson when reordering', async () => {
      const one = await newLesson('scope-1');
      const two = await newLesson('scope-2');
      await newBlock(one, 'a', 1);
      const foreign = await newBlock(two, 'f', 1);
      await transactions.run((manager) =>
        blocks.applyPositions(one, [foreign.id], [7], manager),
      );
      expect((await blocks.findById(foreign.id))?.position).toBe(1);
    });

    it('rolls back everything when a later step fails', async () => {
      const lessonId = await newLesson('rollback');
      await newBlock(lessonId, 'a', 1);
      await expect(
        transactions.run(async (manager) => {
          await blocks.shiftFrom(lessonId, 1, 1, manager);
          await blocks.insert(
            {
              lessonId,
              type: 'RICH_TEXT',
              sharedContent: doc('x'),
              position: 1,
            },
            manager,
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await layout(lessonId)).toEqual([[1, 'a']]);
    });
  });
});
