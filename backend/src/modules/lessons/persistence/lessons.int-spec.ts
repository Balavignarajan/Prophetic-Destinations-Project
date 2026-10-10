import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import { LessonsModule } from '../lessons.module.js';
import { LessonRepository, type NewLesson } from './lesson.repository.js';

// Integration: the real repository against the development database (DATABASE_URL).
// Courses, modules and lessons created here use a per-run prefix and are deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;

describe('lessons persistence (integration)', () => {
  let dataSource: DataSource;
  let lessons: LessonRepository;
  let transactions: TransactionRunner;
  let closeModule: () => Promise<void>;

  const cleanup = async () => {
    const like = `int-${runId}-%`;
    await dataSource.query(
      `DELETE FROM "lesson_levels" WHERE "lesson_id" IN (
         SELECT l."id" FROM "lessons" l
           JOIN "course_modules" m ON m."id" = l."module_id"
           JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1)`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lessons" WHERE "module_id" IN (
         SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1)`,
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

  /** A fresh course with one module, created by plain SQL (curriculum's repositories are not ours to use). */
  const newModule = async (name: string): Promise<string> => {
    const [course] = await dataSource.query(
      `INSERT INTO "courses" ("title") VALUES ($1) RETURNING "id"`,
      [title(name)],
    );
    const [module] = await dataSource.query(
      `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,1) RETURNING "id"`,
      [course.id, title(`${name}-module`)],
    );
    return module.id;
  };

  const lessonInput = (
    moduleId: string,
    name: string,
    position: number,
  ): NewLesson => ({
    moduleId,
    title: title(name),
    shortTitle: null,
    subtitle: null,
    introduction: null,
    estimatedMinutes: null,
    position,
  });

  const newLesson = (moduleId: string, name: string, position: number) =>
    transactions.run((manager) =>
      lessons.insert(lessonInput(moduleId, name, position), manager),
    );

  const layout = async (moduleId: string) =>
    (await lessons.listByModule(moduleId)).map((l) => [
      l.position,
      l.title.split('-').pop(),
    ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, LessonsModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    lessons = moduleRef.get(LessonRepository, { strict: false });
    transactions = moduleRef.get(TransactionRunner, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('lessons', () => {
    it('creates a draft lesson with no levels and reads it back as a plain domain object', async () => {
      const moduleId = await newModule('basic');
      const created = await transactions.run((manager) =>
        lessons.insert(
          {
            moduleId,
            title: title('basic'),
            shortTitle: 'Short',
            subtitle: 'Sub',
            introduction: 'First paragraph.\n\nSecond paragraph.',
            estimatedMinutes: 25,
            position: 1,
          },
          manager,
        ),
      );

      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        moduleId,
        title: title('basic'),
        shortTitle: 'Short',
        subtitle: 'Sub',
        introduction: 'First paragraph.\n\nSecond paragraph.',
        coverMediaId: null,
        estimatedMinutes: 25,
        levels: [],
        position: 1,
        status: 'DRAFT',
        version: 1,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await lessons.findById(created.id)).toEqual(created);
    });

    it('returns null for an unknown lesson', async () => {
      expect(await lessons.findById(randomUUID())).toBeNull();
    });

    it('updates fields, bumps the version and refreshes updated_at', async () => {
      const moduleId = await newModule('update');
      const created = await newLesson(moduleId, 'update', 1);
      const updated = await transactions.run((manager) =>
        lessons.update(
          created.id,
          { title: title('update-2'), subtitle: 'new', estimatedMinutes: 10 },
          manager,
        ),
      );
      expect(updated).toMatchObject({
        title: title('update-2'),
        subtitle: 'new',
        estimatedMinutes: 10,
        version: 2,
        position: 1,
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
      expect(updated.createdAt).toEqual(created.createdAt);
    });

    it('locks the lesson row for update inside a transaction', async () => {
      const moduleId = await newModule('lock');
      const created = await newLesson(moduleId, 'lock', 1);
      const locked = await transactions.run((manager) =>
        lessons.findByIdForUpdate(created.id, manager),
      );
      expect(locked?.id).toBe(created.id);
    });

    it('deletes a lesson together with its level rows', async () => {
      const moduleId = await newModule('delete');
      const created = await newLesson(moduleId, 'delete', 1);
      await transactions.run(async (manager) => {
        await lessons.replaceLevels(
          created.id,
          ['BEGINNER', 'ADVANCED'],
          manager,
        );
        await lessons.delete(created.id, manager);
      });
      expect(await lessons.findById(created.id)).toBeNull();
      const rows = await dataSource.query(
        `SELECT 1 FROM "lesson_levels" WHERE "lesson_id" = $1`,
        [created.id],
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('module relationship', () => {
    it('requires an existing module (foreign key)', async () => {
      await expect(newLesson(randomUUID(), 'orphan', 1)).rejects.toMatchObject({
        driverError: { code: '23503' },
      });
    });

    it('lists lessons of one module only, in position order', async () => {
      const one = await newModule('list-1');
      const two = await newModule('list-2');
      await newLesson(one, 'c', 3);
      await newLesson(one, 'a', 1);
      await newLesson(one, 'b', 2);
      await newLesson(two, 'z', 1);

      expect(await layout(one)).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
      expect(await layout(two)).toEqual([[1, 'z']]);
      expect(await lessons.countByModule(one)).toBe(3);
    });

    it('refuses to delete a module that has lessons (ON DELETE RESTRICT)', async () => {
      const moduleId = await newModule('restrict');
      await newLesson(moduleId, 'a', 1);
      await expect(
        dataSource.query(`DELETE FROM "course_modules" WHERE "id" = $1`, [
          moduleId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });
      expect(await lessons.countByModule(moduleId)).toBe(1);
    });
  });

  describe('ordering', () => {
    it('rejects a duplicate position within a module with a ConflictError', async () => {
      const moduleId = await newModule('dup');
      await newLesson(moduleId, 'first', 1);
      await expect(newLesson(moduleId, 'second', 1)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(await lessons.countByModule(moduleId)).toBe(1);
    });

    it('allows the same position in different modules', async () => {
      const one = await newModule('iso-1');
      const two = await newModule('iso-2');
      await newLesson(one, 'x', 1);
      await expect(newLesson(two, 'y', 1)).resolves.toMatchObject({
        position: 1,
      });
    });

    it('enforces unique (module_id, position) in the database itself', async () => {
      const moduleId = await newModule('dbunique');
      await newLesson(moduleId, 'x', 1);
      await expect(
        dataSource.query(
          `INSERT INTO "lessons" ("module_id","title","position") VALUES ($1,$2,1)`,
          [moduleId, title('y')],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('opens a gap with a single shift without tripping the unique constraint', async () => {
      const moduleId = await newModule('shift');
      await newLesson(moduleId, 'a', 1);
      await newLesson(moduleId, 'b', 2);
      await newLesson(moduleId, 'c', 3);

      await transactions.run((manager) =>
        lessons.shiftFrom(moduleId, 2, 1, manager),
      );
      expect(await layout(moduleId)).toEqual([
        [1, 'a'],
        [3, 'b'],
        [4, 'c'],
      ]);

      await newLesson(moduleId, 'x', 2);
      expect(await layout(moduleId)).toEqual([
        [1, 'a'],
        [2, 'x'],
        [3, 'b'],
        [4, 'c'],
      ]);
    });

    it('closes a gap with a single shift', async () => {
      const moduleId = await newModule('close');
      const a = await newLesson(moduleId, 'a', 1);
      await newLesson(moduleId, 'b', 2);
      await newLesson(moduleId, 'c', 3);

      await transactions.run(async (manager) => {
        await lessons.delete(a.id, manager);
        await lessons.shiftFrom(moduleId, 2, -1, manager);
      });
      expect(await layout(moduleId)).toEqual([
        [1, 'b'],
        [2, 'c'],
      ]);
    });

    it('reorders, including a swap, in one statement', async () => {
      const moduleId = await newModule('reorder');
      const a = await newLesson(moduleId, 'a', 1);
      const b = await newLesson(moduleId, 'b', 2);
      const c = await newLesson(moduleId, 'c', 3);

      await transactions.run((manager) =>
        lessons.applyPositions(
          moduleId,
          [c.id, a.id, b.id],
          [1, 2, 3],
          manager,
        ),
      );
      expect(await layout(moduleId)).toEqual([
        [1, 'c'],
        [2, 'a'],
        [3, 'b'],
      ]);

      await transactions.run((manager) =>
        lessons.applyPositions(moduleId, [a.id, c.id], [1, 2], manager),
      );
      expect(await layout(moduleId)).toEqual([
        [1, 'a'],
        [2, 'c'],
        [3, 'b'],
      ]);
    });

    it('never moves lessons of another module when reordering', async () => {
      const one = await newModule('scope-1');
      const two = await newModule('scope-2');
      await newLesson(one, 'a', 1);
      const foreign = await newLesson(two, 'f', 1);

      await transactions.run((manager) =>
        lessons.applyPositions(one, [foreign.id], [7], manager),
      );
      expect((await lessons.findById(foreign.id))?.position).toBe(1);
    });

    it('rolls back everything when a later step fails', async () => {
      const moduleId = await newModule('rollback');
      await newLesson(moduleId, 'a', 1);
      await expect(
        transactions.run(async (manager) => {
          await lessons.shiftFrom(moduleId, 1, 1, manager);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await layout(moduleId)).toEqual([[1, 'a']]);
    });
  });

  describe('level availability', () => {
    it('stores levels and returns them in canonical order', async () => {
      const moduleId = await newModule('levels');
      const lesson = await newLesson(moduleId, 'l', 1);
      await transactions.run((manager) =>
        lessons.replaceLevels(lesson.id, ['ADVANCED', 'BEGINNER'], manager),
      );
      expect((await lessons.findById(lesson.id))?.levels).toEqual([
        'BEGINNER',
        'ADVANCED',
      ]);
    });

    it('replaces the set: removes, keeps and adds', async () => {
      const moduleId = await newModule('levels-replace');
      const lesson = await newLesson(moduleId, 'l', 1);
      await transactions.run(async (manager) => {
        await lessons.replaceLevels(
          lesson.id,
          ['BEGINNER', 'INTERMEDIATE'],
          manager,
        );
        await lessons.replaceLevels(
          lesson.id,
          ['INTERMEDIATE', 'ADVANCED'],
          manager,
        );
      });
      expect((await lessons.findById(lesson.id))?.levels).toEqual([
        'INTERMEDIATE',
        'ADVANCED',
      ]);

      await transactions.run((manager) =>
        lessons.replaceLevels(lesson.id, [], manager),
      );
      expect((await lessons.findById(lesson.id))?.levels).toEqual([]);
    });

    it('lists the levels of every lesson in a module in one call', async () => {
      const moduleId = await newModule('levels-list');
      const a = await newLesson(moduleId, 'a', 1);
      const b = await newLesson(moduleId, 'b', 2);
      await transactions.run(async (manager) => {
        await lessons.replaceLevels(a.id, ['BEGINNER'], manager);
        await lessons.replaceLevels(
          b.id,
          ['INTERMEDIATE', 'ADVANCED'],
          manager,
        );
      });
      expect(
        (await lessons.listByModule(moduleId)).map((l) => l.levels),
      ).toEqual([['BEGINNER'], ['INTERMEDIATE', 'ADVANCED']]);
    });

    it('enforces the three levels in the database', async () => {
      const moduleId = await newModule('levels-check');
      const lesson = await newLesson(moduleId, 'l', 1);
      for (const level of ['EXPERT', 'beginner', '']) {
        await expect(
          dataSource.query(
            `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,$2)`,
            [lesson.id, level],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('allows each level only once per lesson (primary key)', async () => {
      const moduleId = await newModule('levels-pk');
      const lesson = await newLesson(moduleId, 'l', 1);
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,'BEGINNER')`,
        [lesson.id],
      );
      await expect(
        dataSource.query(
          `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,'BEGINNER')`,
          [lesson.id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('requires an existing lesson (foreign key)', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,'BEGINNER')`,
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('refuses to delete a lesson that still has level rows if done directly (ON DELETE RESTRICT)', async () => {
      const moduleId = await newModule('levels-restrict');
      const lesson = await newLesson(moduleId, 'l', 1);
      await transactions.run((manager) =>
        lessons.replaceLevels(lesson.id, ['BEGINNER'], manager),
      );
      await expect(
        dataSource.query(`DELETE FROM "lessons" WHERE "id" = $1`, [lesson.id]),
      ).rejects.toMatchObject({ code: '23001' });
    });
  });

  describe('invalid data is rejected by the database itself', () => {
    const insert = async (overrides: Record<string, unknown>) => {
      const moduleId = await newModule(`check-${randomUUID().slice(0, 4)}`);
      const values: Record<string, unknown> = {
        module_id: moduleId,
        title: title('valid'),
        position: 1,
        ...overrides,
      };
      const columns = Object.keys(values);
      return dataSource.query(
        `INSERT INTO "lessons" (${columns.map((c) => `"${c}"`).join(',')})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`,
        Object.values(values),
      );
    };

    it('blank or over-long title', async () => {
      await expect(insert({ title: '   ' })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert({ title: 'x'.repeat(201) })).rejects.toMatchObject({
        code: '22001',
      });
    });

    it('blank or over-long short_title, subtitle and introduction', async () => {
      await expect(insert({ short_title: '  ' })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        insert({ short_title: 'x'.repeat(101) }),
      ).rejects.toMatchObject({ code: '22001' });
      await expect(insert({ subtitle: ' ' })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert({ subtitle: 'x'.repeat(301) })).rejects.toMatchObject(
        { code: '22001' },
      );
      await expect(insert({ introduction: ' \n ' })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        insert({ introduction: 'x'.repeat(5001) }),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('accepts values exactly at the limits', async () => {
      await expect(
        insert({
          title: 'x'.repeat(200),
          short_title: 'x'.repeat(100),
          subtitle: 'x'.repeat(300),
          introduction: 'x'.repeat(5000),
        }),
      ).resolves.toBeDefined();
    });

    it('non-positive estimated_minutes', async () => {
      await expect(insert({ estimated_minutes: 0 })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert({ estimated_minutes: -3 })).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('position below 1', async () => {
      await expect(insert({ position: 0 })).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('unknown status', async () => {
      await expect(insert({ status: 'LIVE' })).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('a missing title', async () => {
      await expect(insert({ title: null })).rejects.toMatchObject({
        code: '23502',
      });
    });
  });
});
