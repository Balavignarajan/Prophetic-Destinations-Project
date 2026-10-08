import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import { CurriculumModule } from '../curriculum.module.js';
import { CourseModuleRepository } from './course-module.repository.js';
import { CourseRepository } from './course.repository.js';

// Integration: real repositories against the development database (DATABASE_URL).
// Every course created here has a title starting with `int-<runId>` and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;

describe('curriculum persistence (integration)', () => {
  let dataSource: DataSource;
  let courses: CourseRepository;
  let modules: CourseModuleRepository;
  let transactions: TransactionRunner;
  let closeModule: () => Promise<void>;

  const cleanup = async () => {
    const like = `int-${runId}-%`;
    await dataSource.query(
      `DELETE FROM "course_modules" WHERE "course_id" IN (SELECT "id" FROM "courses" WHERE "title" LIKE $1)`,
      [like],
    );
    await dataSource.query(`DELETE FROM "courses" WHERE "title" LIKE $1`, [
      like,
    ]);
  };

  const newCourse = (name: string, description: string | null = null) =>
    courses.create({ title: title(name), description });

  const newModule = (courseId: string, name: string, position: number) =>
    transactions.run((manager) =>
      modules.insert(
        { courseId, title: title(name), description: null, position },
        manager,
      ),
    );

  const layout = async (courseId: string) =>
    (await modules.listByCourse(courseId)).map((m) => [
      m.position,
      m.title.split('-').pop(),
    ]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, CurriculumModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    courses = moduleRef.get(CourseRepository, { strict: false });
    modules = moduleRef.get(CourseModuleRepository, { strict: false });
    transactions = moduleRef.get(TransactionRunner, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('courses', () => {
    it('creates a draft course and reads it back as a plain domain object', async () => {
      const created = await newCourse('create', 'About');
      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        title: title('create'),
        description: 'About',
        status: 'DRAFT',
        version: 1,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await courses.findById(created.id)).toEqual(created);
    });

    it('returns null for an unknown course', async () => {
      expect(await courses.findById(randomUUID())).toBeNull();
    });

    it('updates fields, bumps the version and refreshes updated_at', async () => {
      const created = await newCourse('update', 'old');
      const updated = await transactions.run((manager) =>
        courses.update(
          created.id,
          { title: title('update-2'), description: null },
          manager,
        ),
      );
      expect(updated).toMatchObject({
        id: created.id,
        title: title('update-2'),
        description: null,
        version: 2,
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
      expect(updated.createdAt).toEqual(created.createdAt);
    });

    it('lists oldest first with a stable order, honouring limit and offset', async () => {
      const a = await newCourse('list-a');
      const b = await newCourse('list-b');
      const c = await newCourse('list-c');

      const all = await courses.list(1000, 0);
      const ours = all.items.filter((course) =>
        [a.id, b.id, c.id].includes(course.id),
      );
      expect(ours.map((course) => course.id)).toEqual([a.id, b.id, c.id]);
      expect(all.total).toBeGreaterThanOrEqual(3);

      const again = await courses.list(1000, 0);
      expect(again.items.map((course) => course.id)).toEqual(
        all.items.map((course) => course.id),
      );

      const page = await courses.list(2, 0);
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(all.total);
      const next = await courses.list(2, 2);
      expect(next.items[0]?.id).toBe(all.items[2]?.id);
    });

    it('deletes a course without modules', async () => {
      const created = await newCourse('delete');
      await courses.delete(created.id);
      expect(await courses.findById(created.id)).toBeNull();
    });

    it('treats deleting an unknown course as a no-op', async () => {
      await expect(courses.delete(randomUUID())).resolves.toBeUndefined();
    });

    it('locks the row for update inside a transaction', async () => {
      const created = await newCourse('lock');
      const locked = await transactions.run((manager) =>
        courses.findByIdForUpdate(created.id, manager),
      );
      expect(locked?.id).toBe(created.id);
    });

    it('rejects invalid data in the database itself', async () => {
      const insert = (name: string, status = 'DRAFT') =>
        dataSource.query(
          `INSERT INTO "courses" ("title", "status") VALUES ($1, $2)`,
          [name, status],
        );

      await expect(insert('   ')).rejects.toMatchObject({ code: '23514' });
      await expect(insert('')).rejects.toMatchObject({ code: '23514' });
      await expect(insert('x'.repeat(201))).rejects.toMatchObject({
        code: '22001',
      });
      await expect(insert(title('badstatus'), 'LIVE')).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        dataSource.query(`INSERT INTO "courses" ("title") VALUES (NULL)`),
      ).rejects.toMatchObject({ code: '23502' });
    });
  });

  describe('modules', () => {
    it('belongs to its course and starts as a draft', async () => {
      const course = await newCourse('m-basic');
      const created = await newModule(course.id, 'one', 1);
      expect(created).toEqual({
        id: expect.any(String),
        courseId: course.id,
        title: title('one'),
        description: null,
        status: 'DRAFT',
        position: 1,
        version: 1,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await modules.findById(created.id)).toEqual(created);
      expect(await modules.countByCourse(course.id)).toBe(1);
    });

    it('lists modules in position order regardless of insertion order', async () => {
      const course = await newCourse('m-order');
      await newModule(course.id, 'c', 3);
      await newModule(course.id, 'a', 1);
      await newModule(course.id, 'b', 2);
      expect(await layout(course.id)).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
    });

    it('rejects a module for a course that does not exist (foreign key)', async () => {
      await expect(newModule(randomUUID(), 'orphan', 1)).rejects.toMatchObject({
        driverError: { code: '23503' },
      });
    });

    it('rejects a duplicate position within a course with a ConflictError', async () => {
      const course = await newCourse('m-dup');
      await newModule(course.id, 'first', 1);
      await expect(newModule(course.id, 'second', 1)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(await modules.countByCourse(course.id)).toBe(1);
    });

    it('allows the same position in different courses', async () => {
      const one = await newCourse('m-iso-1');
      const two = await newCourse('m-iso-2');
      await newModule(one.id, 'x', 1);
      await expect(newModule(two.id, 'y', 1)).resolves.toMatchObject({
        position: 1,
      });
    });

    it('enforces unique (course_id, position) in the database, not just in code', async () => {
      const course = await newCourse('m-dbunique');
      await newModule(course.id, 'x', 1);
      await expect(
        dataSource.query(
          `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,1)`,
          [course.id, title('y')],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects invalid module data in the database itself', async () => {
      const course = await newCourse('m-invalid');
      const insert = (name: string, position: number, status = 'DRAFT') =>
        dataSource.query(
          `INSERT INTO "course_modules" ("course_id","title","position","status") VALUES ($1,$2,$3,$4)`,
          [course.id, name, position, status],
        );

      await expect(insert(title('p0'), 0)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert(title('neg'), -3)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert('  ', 1)).rejects.toMatchObject({ code: '23514' });
      await expect(insert(title('st'), 1, 'LIVE')).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('opens a gap with a single shift without tripping the unique constraint', async () => {
      const course = await newCourse('m-shift');
      await newModule(course.id, 'a', 1);
      await newModule(course.id, 'b', 2);
      await newModule(course.id, 'c', 3);

      await transactions.run((manager) =>
        modules.shiftFrom(course.id, 2, 1, manager),
      );
      expect(await layout(course.id)).toEqual([
        [1, 'a'],
        [3, 'b'],
        [4, 'c'],
      ]);

      await newModule(course.id, 'x', 2);
      expect(await layout(course.id)).toEqual([
        [1, 'a'],
        [2, 'x'],
        [3, 'b'],
        [4, 'c'],
      ]);
    });

    it('closes a gap with a single shift', async () => {
      const course = await newCourse('m-close');
      const a = await newModule(course.id, 'a', 1);
      await newModule(course.id, 'b', 2);
      await newModule(course.id, 'c', 3);

      await transactions.run(async (manager) => {
        await modules.delete(a.id, manager);
        await modules.shiftFrom(course.id, 2, -1, manager);
      });
      expect(await layout(course.id)).toEqual([
        [1, 'b'],
        [2, 'c'],
      ]);
    });

    it('reorders (including a swap) in one statement', async () => {
      const course = await newCourse('m-reorder');
      const a = await newModule(course.id, 'a', 1);
      const b = await newModule(course.id, 'b', 2);
      const c = await newModule(course.id, 'c', 3);

      await transactions.run((manager) =>
        modules.applyPositions(
          course.id,
          [c.id, a.id, b.id],
          [1, 2, 3],
          manager,
        ),
      );
      expect(await layout(course.id)).toEqual([
        [1, 'c'],
        [2, 'a'],
        [3, 'b'],
      ]);

      await transactions.run((manager) =>
        modules.applyPositions(course.id, [a.id, c.id], [1, 2], manager),
      ); // swap two
      expect(await layout(course.id)).toEqual([
        [1, 'a'],
        [2, 'c'],
        [3, 'b'],
      ]);
    });

    it('never moves modules of another course when reordering', async () => {
      const course = await newCourse('m-scope-1');
      const other = await newCourse('m-scope-2');
      await newModule(course.id, 'a', 1);
      const foreign = await newModule(other.id, 'f', 1);

      await transactions.run((manager) =>
        modules.applyPositions(course.id, [foreign.id], [7], manager),
      );
      expect((await modules.findById(foreign.id))?.position).toBe(1);
    });

    it('updates module text and bumps its version', async () => {
      const course = await newCourse('m-update');
      const created = await newModule(course.id, 'a', 1);
      const updated = await transactions.run((manager) =>
        modules.update(
          created.id,
          { title: title('a2'), description: 'd' },
          manager,
        ),
      );
      expect(updated).toMatchObject({
        title: title('a2'),
        description: 'd',
        version: 2,
        position: 1,
      });
    });

    it('rolls back the whole transaction when a later step fails', async () => {
      const course = await newCourse('m-rollback');
      await newModule(course.id, 'a', 1);
      await expect(
        transactions.run(async (manager) => {
          await modules.shiftFrom(course.id, 1, 1, manager);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await layout(course.id)).toEqual([[1, 'a']]);
    });
  });

  describe('course and module together', () => {
    it('refuses to delete a course that has modules (ON DELETE RESTRICT)', async () => {
      const course = await newCourse('rel-restrict');
      await newModule(course.id, 'a', 1);

      await expect(courses.delete(course.id)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(
        dataSource.query(`DELETE FROM "courses" WHERE "id" = $1`, [course.id]),
      ).rejects.toMatchObject({ code: '23001' });

      expect(await courses.findById(course.id)).not.toBeNull();
      expect(await modules.countByCourse(course.id)).toBe(1);
    });

    it('allows deleting the course after its modules are removed', async () => {
      const course = await newCourse('rel-after');
      const module = await newModule(course.id, 'a', 1);
      await transactions.run((manager) => modules.delete(module.id, manager));
      await courses.delete(course.id);
      expect(await courses.findById(course.id)).toBeNull();
    });
  });
});
