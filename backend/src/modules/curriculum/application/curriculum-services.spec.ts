import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type { Course, CourseModule } from '../domain/models.js';
import type { CourseModuleRepository } from '../persistence/course-module.repository.js';
import type { CourseRepository } from '../persistence/course.repository.js';
import { CourseService } from './course.service.js';
import { ModuleService } from './module.service.js';

// In-memory repositories. The real SQL is covered by the integration tests.
class FakeCourses {
  rows = new Map<string, Course>();
  async create(input: { title: string; description: string | null }) {
    const now = new Date();
    const course: Course = {
      id: randomUUID(),
      ...input,
      status: 'DRAFT',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(course.id, course);
    return { ...course };
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  findByIdForUpdate(id: string) {
    return this.findById(id);
  }
  async list(limit: number, offset: number) {
    const all = [...this.rows.values()];
    return { items: all.slice(offset, offset + limit), total: all.length };
  }
  async update(id: string, changes: Partial<Course>) {
    const row = this.rows.get(id)!;
    Object.assign(row, changes, { version: row.version + 1 });
    return { ...row };
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

class FakeModules {
  rows = new Map<string, CourseModule>();
  async insert(input: {
    courseId: string;
    title: string;
    description: string | null;
    position: number;
  }) {
    const taken = [...this.rows.values()].some(
      (m) => m.courseId === input.courseId && m.position === input.position,
    );
    if (taken)
      throw new ConflictError('Another module already has this position');
    const now = new Date();
    const module: CourseModule = {
      id: randomUUID(),
      ...input,
      status: 'DRAFT',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(module.id, module);
    return { ...module };
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  findByIdForUpdate(id: string) {
    return this.findById(id);
  }
  async listByCourse(courseId: string) {
    return [...this.rows.values()]
      .filter((m) => m.courseId === courseId)
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ ...m }));
  }
  async countByCourse(courseId: string) {
    return (await this.listByCourse(courseId)).length;
  }
  async update(id: string, changes: Partial<CourseModule>) {
    const row = this.rows.get(id)!;
    Object.assign(row, changes, { version: row.version + 1 });
    return { ...row };
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async shiftFrom(courseId: string, from: number, delta: number) {
    for (const m of this.rows.values()) {
      if (m.courseId === courseId && m.position >= from) m.position += delta;
    }
  }
  async applyPositions(courseId: string, ids: string[], positions: number[]) {
    ids.forEach((id, i) => {
      const m = this.rows.get(id);
      if (m && m.courseId === courseId) m.position = positions[i];
    });
  }
  /** (position, title) pairs of a course, in order. */
  layout(courseId: string) {
    return [...this.rows.values()]
      .filter((m) => m.courseId === courseId)
      .sort((a, b) => a.position - b.position)
      .map((m) => [m.position, m.title] as const);
  }
}

function build() {
  const courses = new FakeCourses();
  const modules = new FakeModules();
  const transactions = {
    run: (work: (m: EntityManager) => unknown) => work({} as EntityManager),
  } as unknown as TransactionRunner;
  const courseRepo = courses as unknown as CourseRepository;
  const moduleRepo = modules as unknown as CourseModuleRepository;
  return {
    courses,
    modules,
    courseService: new CourseService(courseRepo, moduleRepo, transactions),
    moduleService: new ModuleService(courseRepo, moduleRepo, transactions),
  };
}

describe('CourseService', () => {
  it('creates a draft course with a trimmed title and normalized description', async () => {
    const { courseService } = build();
    const course = await courseService.create({
      title: '  Foundations ',
      description: '   ',
    });
    expect(course).toMatchObject({
      title: 'Foundations',
      description: null,
      status: 'DRAFT',
      version: 1,
    });
  });

  it('rejects a blank title', async () => {
    const { courseService } = build();
    await expect(courseService.create({ title: '  ' })).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it('reports a missing course as NotFoundError', async () => {
    const { courseService } = build();
    await expect(courseService.get(randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      courseService.update(randomUUID(), { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(courseService.delete(randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('updates only what was sent and bumps the version', async () => {
    const { courseService } = build();
    const course = await courseService.create({ title: 'A', description: 'd' });
    const updated = await courseService.update(course.id, { title: 'B' });
    expect(updated).toMatchObject({ title: 'B', description: 'd', version: 2 });
  });

  it('clears the description when null is sent', async () => {
    const { courseService } = build();
    const course = await courseService.create({ title: 'A', description: 'd' });
    expect(
      (await courseService.update(course.id, { description: null }))
        .description,
    ).toBeNull();
  });

  it('puts an edited course back to DRAFT', async () => {
    const { courseService, courses } = build();
    const course = await courseService.create({ title: 'A' });
    courses.rows.get(course.id)!.status = 'APPROVED';
    expect((await courseService.update(course.id, { title: 'B' })).status).toBe(
      'DRAFT',
    );
  });

  it('refuses a stale edit', async () => {
    const { courseService } = build();
    const course = await courseService.create({ title: 'A' });
    await courseService.update(course.id, { title: 'B' });
    await expect(
      courseService.update(course.id, { title: 'C', version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      courseService.update(course.id, { title: 'C', version: 2 }),
    ).resolves.toMatchObject({ title: 'C' });
  });

  it('rejects an empty update', async () => {
    const { courseService } = build();
    const course = await courseService.create({ title: 'A' });
    await expect(courseService.update(course.id, {})).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it('deletes an empty course', async () => {
    const { courseService } = build();
    const course = await courseService.create({ title: 'A' });
    await courseService.delete(course.id);
    await expect(courseService.get(course.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses to delete a course that has modules, and keeps everything', async () => {
    const { courseService, moduleService } = build();
    const course = await courseService.create({ title: 'A' });
    await moduleService.create(course.id, { title: 'M1' });
    await moduleService.create(course.id, { title: 'M2' });

    const error = await courseService
      .delete(course.id)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toEqual({ moduleCount: 2 });
    expect(await courseService.get(course.id)).toBeTruthy();
    expect(await moduleService.list(course.id)).toHaveLength(2);
  });

  it('allows deleting the course once its modules are gone', async () => {
    const { courseService, moduleService } = build();
    const course = await courseService.create({ title: 'A' });
    const module = await moduleService.create(course.id, { title: 'M1' });
    await moduleService.delete(course.id, module.id);
    await expect(courseService.delete(course.id)).resolves.toBeUndefined();
  });
});

describe('ModuleService', () => {
  async function courseWith(titles: string[]) {
    const ctx = build();
    const course = await ctx.courseService.create({ title: 'Course' });
    for (const title of titles)
      await ctx.moduleService.create(course.id, { title });
    return { ...ctx, course };
  }

  it('appends modules in order starting at position 1', async () => {
    const { modules, course } = await courseWith(['A', 'B', 'C']);
    expect(modules.layout(course.id)).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
  });

  it('belongs to the course it was created in', async () => {
    const { moduleService, course } = await courseWith([]);
    const module = await moduleService.create(course.id, { title: 'A' });
    expect(module.courseId).toBe(course.id);
    expect(module.status).toBe('DRAFT');
  });

  it('requires an existing course', async () => {
    const { moduleService } = build();
    await expect(
      moduleService.create(randomUUID(), { title: 'A' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(moduleService.list(randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('inserts at a position and pushes later modules down', async () => {
    const { moduleService, modules, course } = await courseWith([
      'A',
      'B',
      'C',
    ]);
    await moduleService.create(course.id, { title: 'X', position: 2 });
    expect(modules.layout(course.id)).toEqual([
      [1, 'A'],
      [2, 'X'],
      [3, 'B'],
      [4, 'C'],
    ]);
    await moduleService.create(course.id, { title: 'First', position: 1 });
    expect(modules.layout(course.id)[0]).toEqual([1, 'First']);
  });

  it('rejects a position beyond the end and writes nothing', async () => {
    const { moduleService, modules, course } = await courseWith(['A', 'B']);
    await expect(
      moduleService.create(course.id, { title: 'X', position: 5 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(modules.layout(course.id)).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
  });

  it('keeps courses independent of each other', async () => {
    const { courseService, moduleService, modules, course } = await courseWith([
      'A',
    ]);
    const other = await courseService.create({ title: 'Other' });
    await moduleService.create(other.id, { title: 'Z' });
    expect(modules.layout(course.id)).toEqual([[1, 'A']]);
    expect(modules.layout(other.id)).toEqual([[1, 'Z']]);
  });

  it('closes the gap when a module is deleted', async () => {
    const { moduleService, modules, course } = await courseWith([
      'A',
      'B',
      'C',
    ]);
    const [, b] = await moduleService.list(course.id);
    await moduleService.delete(course.id, b.id);
    expect(modules.layout(course.id)).toEqual([
      [1, 'A'],
      [2, 'C'],
    ]);
  });

  it('cannot reach a module through another course', async () => {
    const { courseService, moduleService, course } = await courseWith(['A']);
    const other = await courseService.create({ title: 'Other' });
    const [module] = await moduleService.list(course.id);

    await expect(moduleService.get(other.id, module.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      moduleService.update(other.id, module.id, { title: 'Hijack' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      moduleService.delete(other.id, module.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates title and description, bumps the version and keeps the position', async () => {
    const { moduleService, course } = await courseWith(['A', 'B']);
    const [, b] = await moduleService.list(course.id);
    const updated = await moduleService.update(course.id, b.id, {
      title: ' B2 ',
    });
    expect(updated).toMatchObject({ title: 'B2', position: 2, version: 2 });
  });

  it('refuses a stale module edit', async () => {
    const { moduleService, course } = await courseWith(['A']);
    const [a] = await moduleService.list(course.id);
    await moduleService.update(course.id, a.id, { title: 'A2' });
    await expect(
      moduleService.update(course.id, a.id, { title: 'A3', version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reorders deterministically', async () => {
    const { moduleService, modules, course } = await courseWith([
      'A',
      'B',
      'C',
    ]);
    const [a, b, c] = await moduleService.list(course.id);

    const result = await moduleService.reorder(course.id, [c.id, a.id, b.id]);
    expect(result.map((m) => [m.position, m.title])).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'B'],
    ]);
    expect(modules.layout(course.id)).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'B'],
    ]);

    // the same request again gives the same result
    const again = await moduleService.reorder(course.id, [c.id, a.id, b.id]);
    expect(again.map((m) => m.title)).toEqual(['C', 'A', 'B']);
  });

  it('rejects an incomplete, duplicated or foreign reorder and changes nothing', async () => {
    const { courseService, moduleService, modules, course } = await courseWith([
      'A',
      'B',
    ]);
    const [a, b] = await moduleService.list(course.id);
    const other = await courseService.create({ title: 'Other' });
    const foreign = await moduleService.create(other.id, { title: 'F' });

    for (const ids of [
      [a.id],
      [a.id, a.id],
      [a.id, b.id, foreign.id],
      [b.id, foreign.id],
    ]) {
      await expect(
        moduleService.reorder(course.id, ids),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    }
    expect(modules.layout(course.id)).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
  });

  it('accepts an empty reorder for a course without modules', async () => {
    const { moduleService, course } = await courseWith([]);
    expect(await moduleService.reorder(course.id, [])).toEqual([]);
  });
});
