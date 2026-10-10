import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  LEARNING_LEVELS,
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type { CurriculumFacade } from '../../curriculum/index.js';
import type { Lesson } from '../domain/models.js';
import type { LessonBlockLevelRepository } from '../persistence/lesson-block-level.repository.js';
import type { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import type { LessonRepository } from '../persistence/lesson.repository.js';
import { LessonService } from './lesson.service.js';

// In-memory stand-ins. The real SQL is covered by the integration tests.
class FakeLessons {
  rows = new Map<string, Lesson>();
  /** how often the lesson row was written / locked, to prove a no-op writes nothing */
  updateCalls = 0;
  levelWrites = 0;
  locks = 0;

  async insert(input: {
    moduleId: string;
    title: string;
    shortTitle: string | null;
    subtitle: string | null;
    introduction: string | null;
    estimatedMinutes: number | null;
    position: number;
  }) {
    const taken = [...this.rows.values()].some(
      (l) => l.moduleId === input.moduleId && l.position === input.position,
    );
    if (taken)
      throw new ConflictError('Another lesson already has this position');
    const now = new Date();
    const lesson: Lesson = {
      id: randomUUID(),
      ...input,
      coverMediaId: null,
      levels: [],
      status: 'DRAFT',
      version: 1,
      contentRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(lesson.id, lesson);
    return { ...lesson };
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  findByIdForUpdate(id: string) {
    this.locks += 1;
    return this.findById(id);
  }
  async reload(id: string) {
    return { ...this.rows.get(id)! };
  }
  async listByModule(moduleId: string) {
    return [...this.rows.values()]
      .filter((l) => l.moduleId === moduleId)
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ ...l }));
  }
  async countByModule(moduleId: string) {
    return (await this.listByModule(moduleId)).length;
  }
  async update(id: string, changes: Partial<Lesson>) {
    this.updateCalls += 1;
    const row = this.rows.get(id)!;
    Object.assign(row, changes, {
      version: row.version + 1,
      contentRevision: row.contentRevision + 1,
    });
    return { ...row };
  }
  async replaceLevels(id: string, levels: readonly LearningLevel[]) {
    this.levelWrites += 1;
    this.rows.get(id)!.levels = LEARNING_LEVELS.filter((l) =>
      levels.includes(l),
    );
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async shiftFrom(moduleId: string, from: number, delta: number) {
    for (const l of this.rows.values()) {
      if (l.moduleId === moduleId && l.position >= from) l.position += delta;
    }
  }
  async applyPositions(moduleId: string, ids: string[], positions: number[]) {
    ids.forEach((id, i) => {
      const l = this.rows.get(id);
      if (l && l.moduleId === moduleId) l.position = positions[i];
    });
  }
  layout(moduleId: string) {
    return [...this.rows.values()]
      .filter((l) => l.moduleId === moduleId)
      .sort((a, b) => a.position - b.position)
      .map((l) => [l.position, l.title] as const);
  }
}

class FakeBlocks {
  counts = new Map<string, number>();
  async countByLesson(lessonId: string) {
    return this.counts.get(lessonId) ?? 0;
  }
}

class FakeBlockLevels {
  visible: { blockId: string; level: string }[] = [];
  async findVisibleAt(_lessonId: string, levels: readonly string[]) {
    return this.visible.filter((row) => levels.includes(row.level));
  }
}

class FakeCurriculum {
  modules = new Map<string, { id: string; courseId: string }>();
  locked: string[] = [];
  add(courseId: string) {
    const module = { id: randomUUID(), courseId };
    this.modules.set(module.id, module);
    return module;
  }
  async findModule(id: string) {
    return this.modules.get(id) ?? null;
  }
  async lockModule(id: string) {
    const module = this.modules.get(id);
    if (!module) throw new NotFoundError('Module not found');
    this.locked.push(id);
    return module;
  }
}

function build() {
  const lessons = new FakeLessons();
  const blocks = new FakeBlocks();
  const blockLevels = new FakeBlockLevels();
  const curriculum = new FakeCurriculum();
  const transactions = {
    run: (work: (m: EntityManager) => unknown) => work({} as EntityManager),
  } as unknown as TransactionRunner;
  const service = new LessonService(
    lessons as unknown as LessonRepository,
    blocks as unknown as LessonBlockRepository,
    blockLevels as unknown as LessonBlockLevelRepository,
    curriculum as unknown as CurriculumFacade,
    transactions,
  );
  const courseId = randomUUID();
  const module = curriculum.add(courseId);
  return {
    lessons,
    blocks,
    blockLevels,
    curriculum,
    service,
    courseId,
    module,
  };
}

async function moduleWith(titles: string[]) {
  const ctx = build();
  for (const title of titles) {
    await ctx.service.create(ctx.courseId, ctx.module.id, { title });
  }
  return ctx;
}

describe('create', () => {
  it('creates a draft lesson with normalized fields and no levels by default', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: '  Intro  ',
      shortTitle: '  ',
      subtitle: ' Sub ',
      introduction: 'One.\r\n\r\nTwo.',
      estimatedMinutes: 20,
    });
    expect(lesson).toMatchObject({
      moduleId: module.id,
      title: 'Intro',
      shortTitle: null,
      subtitle: 'Sub',
      introduction: 'One.\n\nTwo.',
      estimatedMinutes: 20,
      coverMediaId: null,
      levels: [],
      position: 1,
      status: 'DRAFT',
      version: 1,
    });
  });

  it('stores the requested levels in canonical order', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'L',
      levels: ['ADVANCED', 'BEGINNER'],
    });
    expect(lesson.levels).toEqual(['BEGINNER', 'ADVANCED']);
  });

  it('rejects invalid input without writing anything', async () => {
    const { service, courseId, module, lessons } = build();
    for (const input of [
      { title: ' ' },
      { title: 'x'.repeat(201) },
      { title: 'ok', shortTitle: 'x'.repeat(101) },
      { title: 'ok', estimatedMinutes: 0 },
      { title: 'ok', levels: ['BEGINNER', 'BEGINNER'] },
      { title: 'ok', levels: ['EXPERT'] },
      { title: 'ok', coverMediaId: randomUUID() },
    ]) {
      await expect(
        service.create(courseId, module.id, input),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    }
    expect(lessons.rows.size).toBe(0);
  });

  it('appends in order starting at 1, and locks the module', async () => {
    const { lessons, curriculum, module } = await moduleWith(['A', 'B', 'C']);
    expect(lessons.layout(module.id)).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
    expect(curriculum.locked).toHaveLength(3);
  });

  it('inserts at a position and pushes later lessons down', async () => {
    const { service, lessons, courseId, module } = await moduleWith([
      'A',
      'B',
      'C',
    ]);
    await service.create(courseId, module.id, { title: 'X', position: 2 });
    await service.create(courseId, module.id, { title: 'First', position: 1 });
    expect(lessons.layout(module.id)).toEqual([
      [1, 'First'],
      [2, 'A'],
      [3, 'X'],
      [4, 'B'],
      [5, 'C'],
    ]);
  });

  it('rejects an out-of-range position and writes nothing', async () => {
    const { service, lessons, courseId, module } = await moduleWith(['A', 'B']);
    await expect(
      service.create(courseId, module.id, { title: 'X', position: 4 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(lessons.layout(module.id)).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
  });

  it('requires an existing module that belongs to the course in the URL', async () => {
    const { service, courseId } = build();
    await expect(
      service.create(courseId, randomUUID(), { title: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const { service: s2, module } = build();
    await expect(
      s2.create(randomUUID(), module.id, { title: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps modules independent', async () => {
    const { service, curriculum, lessons, courseId, module } = await moduleWith(
      ['A'],
    );
    const other = curriculum.add(courseId);
    await service.create(courseId, other.id, { title: 'Z' });
    expect(lessons.layout(module.id)).toEqual([[1, 'A']]);
    expect(lessons.layout(other.id)).toEqual([[1, 'Z']]);
  });
});

describe('read', () => {
  it('lists lessons in position order', async () => {
    const { service, courseId, module } = await moduleWith(['A', 'B']);
    const items = await service.list(courseId, module.id);
    expect(items.map((l) => l.title)).toEqual(['A', 'B']);
  });

  it('reports unknown lessons and modules as NotFoundError', async () => {
    const { service, courseId } = build();
    await expect(service.get(randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.list(courseId, randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.list(randomUUID(), randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not list a module under the wrong course', async () => {
    const { service, module } = await moduleWith(['A']);
    await expect(service.list(randomUUID(), module.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('update', () => {
  it('changes only what was sent, bumps the version', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      subtitle: 'keep',
    });
    const updated = await service.update(lesson.id, { title: ' B ' });
    expect(updated).toMatchObject({ title: 'B', subtitle: 'keep', version: 2 });
  });

  it('clears optional fields with null', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      shortTitle: 's',
      estimatedMinutes: 5,
    });
    const updated = await service.update(lesson.id, {
      shortTitle: null,
      estimatedMinutes: null,
    });
    expect(updated).toMatchObject({ shortTitle: null, estimatedMinutes: null });
  });

  it('does not store a cover until Media exists', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    await expect(
      service.update(lesson.id, { coverMediaId: randomUUID() }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('puts an edited lesson back to DRAFT', async () => {
    const { service, lessons, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    lessons.rows.get(lesson.id)!.status = 'APPROVED';
    expect((await service.update(lesson.id, { title: 'B' })).status).toBe(
      'DRAFT',
    );
  });

  it('refuses a stale edit with a conflict', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    await service.update(lesson.id, { title: 'B' });
    await expect(
      service.update(lesson.id, { title: 'C', version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.update(lesson.id, { title: 'C', version: 2 }),
    ).resolves.toMatchObject({ title: 'C' });
  });

  it('rejects an empty update and an unknown lesson', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    await expect(service.update(lesson.id, {})).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(
      service.update(randomUUID(), { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('content revision', () => {
  it('starts at 1', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    expect(lesson.contentRevision).toBe(1);
  });

  it('moves once for an effective metadata change, whatever number of fields changed', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    const updated = await service.update(lesson.id, {
      title: 'B',
      subtitle: 'S',
      estimatedMinutes: 10,
    });
    expect(updated.contentRevision).toBe(2);
  });

  it('does not move for a write that changes nothing', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      subtitle: 'S',
    });
    const same = await service.update(lesson.id, {
      title: ' A ',
      subtitle: 'S',
    });
    expect(same.contentRevision).toBe(1);
    expect(same.version).toBe(1);
  });

  it('clearing an already-empty field changes nothing', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    expect(
      (await service.update(lesson.id, { shortTitle: null })).contentRevision,
    ).toBe(1);
  });

  it('moves once when the level set changes, not when it is set to what it already is', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      levels: ['BEGINNER'],
    });
    expect(
      (await service.setLevels(lesson.id, ['BEGINNER'])).contentRevision,
    ).toBe(1);
    expect(
      (await service.setLevels(lesson.id, ['ADVANCED', 'BEGINNER']))
        .contentRevision,
    ).toBe(2);
    expect((await service.setLevels(lesson.id, [])).contentRevision).toBe(3);
  });

  it('does not move when lessons are reordered or created beside it', async () => {
    const { service, courseId, module } = await moduleWith(['A', 'B']);
    const [a, b] = await service.list(courseId, module.id);
    await service.reorder(courseId, module.id, [b.id, a.id]);
    await service.create(courseId, module.id, { title: 'C', position: 1 });
    const after = await service.list(courseId, module.id);
    expect(after.every((lesson) => lesson.contentRevision === 1)).toBe(true);
  });
});

describe('level availability', () => {
  it('replaces the whole set, in canonical order', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      levels: ['BEGINNER', 'INTERMEDIATE'],
    });
    const updated = await service.setLevels(lesson.id, [
      'ADVANCED',
      'INTERMEDIATE',
    ]);
    expect(updated.levels).toEqual(['INTERMEDIATE', 'ADVANCED']);
  });

  it('can clear all levels', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      levels: ['BEGINNER'],
    });
    expect((await service.setLevels(lesson.id, [])).levels).toEqual([]);
  });

  it('counts as an edit: version bumps and the lesson goes back to DRAFT', async () => {
    const { service, lessons, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    lessons.rows.get(lesson.id)!.status = 'APPROVED';
    const updated = await service.setLevels(lesson.id, ['BEGINNER']);
    expect(updated).toMatchObject({ status: 'DRAFT', version: 2 });
  });

  it('refuses to remove a level that blocks are visible at (409), naming them, and changes nothing', async () => {
    const { service, blockLevels, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      levels: ['BEGINNER', 'ADVANCED'],
    });
    blockLevels.visible.push({ blockId: 'block-1', level: 'ADVANCED' });

    const error = await service
      .setLevels(lesson.id, ['BEGINNER'])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toEqual({
      levels: ['ADVANCED'],
      blocks: [{ blockId: 'block-1', level: 'ADVANCED' }],
    });
    const after = await service.get(lesson.id);
    expect(after.levels).toEqual(['BEGINNER', 'ADVANCED']);
    expect(after.version).toBe(1);
  });

  it('removes a level nobody uses, and never blocks adding levels', async () => {
    const { service, blockLevels, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      levels: ['BEGINNER', 'ADVANCED'],
    });
    blockLevels.visible.push({ blockId: 'block-1', level: 'BEGINNER' });

    expect((await service.setLevels(lesson.id, ['BEGINNER'])).levels).toEqual([
      'BEGINNER',
    ]);
    expect(
      (
        await service.setLevels(lesson.id, [
          'BEGINNER',
          'INTERMEDIATE',
          'ADVANCED',
        ])
      ).levels,
    ).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
  });

  it('rejects unknown levels and duplicates without changing anything', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, {
      title: 'A',
      levels: ['BEGINNER'],
    });
    await expect(
      service.setLevels(lesson.id, ['EXPERT']),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      service.setLevels(lesson.id, ['ADVANCED', 'ADVANCED']),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect((await service.get(lesson.id)).levels).toEqual(['BEGINNER']);
  });

  it('refuses a stale version and an unknown lesson', async () => {
    const { service, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    await service.setLevels(lesson.id, ['BEGINNER']);
    await expect(
      service.setLevels(lesson.id, ['ADVANCED'], 1),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(service.setLevels(randomUUID(), [])).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('delete', () => {
  it('removes the lesson and closes the gap', async () => {
    const { service, lessons, courseId, module } = await moduleWith([
      'A',
      'B',
      'C',
    ]);
    const [, b] = await service.list(courseId, module.id);
    await service.delete(b.id);
    expect(lessons.layout(module.id)).toEqual([
      [1, 'A'],
      [2, 'C'],
    ]);
  });

  it('locks the module before the lesson', async () => {
    const { service, curriculum, courseId, module } = await moduleWith(['A']);
    const [a] = await service.list(courseId, module.id);
    curriculum.locked.length = 0;
    await service.delete(a.id);
    expect(curriculum.locked).toEqual([module.id]);
  });

  it('reports an unknown lesson as NotFoundError', async () => {
    const { service } = build();
    await expect(service.delete(randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('reorder', () => {
  it('applies the order deterministically', async () => {
    const { service, lessons, courseId, module } = await moduleWith([
      'A',
      'B',
      'C',
    ]);
    const [a, b, c] = await service.list(courseId, module.id);

    const result = await service.reorder(courseId, module.id, [
      c.id,
      a.id,
      b.id,
    ]);
    expect(result.map((l) => [l.position, l.title])).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'B'],
    ]);
    const again = await service.reorder(courseId, module.id, [
      c.id,
      a.id,
      b.id,
    ]);
    expect(again.map((l) => l.title)).toEqual(['C', 'A', 'B']);
    expect(lessons.layout(module.id)).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'B'],
    ]);
  });

  it('rejects incomplete, duplicated and foreign orders and changes nothing', async () => {
    const { service, lessons, curriculum, courseId, module } = await moduleWith(
      ['A', 'B'],
    );
    const [a, b] = await service.list(courseId, module.id);
    const other = curriculum.add(courseId);
    const foreign = await service.create(courseId, other.id, { title: 'F' });

    for (const ids of [
      [a.id],
      [a.id, a.id],
      [a.id, b.id, foreign.id],
      [b.id, foreign.id],
    ]) {
      await expect(
        service.reorder(courseId, module.id, ids),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    }
    expect(lessons.layout(module.id)).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
  });

  it('requires the module to belong to the course', async () => {
    const { service, module } = await moduleWith(['A']);
    await expect(
      service.reorder(randomUUID(), module.id, []),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('a request that changes nothing', () => {
  const NON_DRAFT = ['READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'] as const;

  async function lessonIn(status: (typeof NON_DRAFT)[number]) {
    const ctx = build();
    const lesson = await ctx.service.create(ctx.courseId, ctx.module.id, {
      title: 'Title',
      shortTitle: 'Short',
      subtitle: 'Sub',
      introduction: 'Intro',
      estimatedMinutes: 15,
      levels: ['BEGINNER', 'ADVANCED'],
    });
    ctx.lessons.rows.get(lesson.id)!.status = status;
    return {
      ...ctx,
      lesson,
      written: () => ctx.lessons.updateCalls + ctx.lessons.levelWrites,
    };
  }

  it.each(NON_DRAFT)(
    'metadata identical to what is stored leaves a %s lesson untouched',
    async (status) => {
      const { service, lessons, lesson, written } = await lessonIn(status);
      const writesBefore = written();

      const result = await service.update(lesson.id, {
        title: '  Title  ', // trimmed, so identical
        shortTitle: 'Short',
        subtitle: 'Sub',
        introduction: 'Intro',
        estimatedMinutes: 15,
      });

      expect(result).toMatchObject({ status, version: 1, contentRevision: 1 });
      expect(lessons.rows.get(lesson.id)).toMatchObject({
        status,
        version: 1,
        contentRevision: 1,
      });
      expect(written()).toBe(writesBefore);
    },
  );

  it.each(NON_DRAFT)(
    're-sending the same levels leaves a %s lesson untouched',
    async (status) => {
      const { service, lessons, lesson, written } = await lessonIn(status);
      const writesBefore = written();

      const result = await service.setLevels(lesson.id, [
        'ADVANCED',
        'BEGINNER',
      ]); // same set, other order

      expect(result).toMatchObject({ status, version: 1, contentRevision: 1 });
      expect(lessons.rows.get(lesson.id)?.status).toBe(status);
      expect(written()).toBe(writesBefore);
    },
  );

  it.each(NON_DRAFT)(
    'a genuine change to a %s lesson still bumps both versions and resets it to DRAFT',
    async (status) => {
      const { service, lesson } = await lessonIn(status);

      const renamed = await service.update(lesson.id, { title: 'Different' });
      expect(renamed).toMatchObject({
        status: 'DRAFT',
        version: 2,
        contentRevision: 2,
      });
    },
  );

  it.each(NON_DRAFT)(
    'a genuinely different level set on a %s lesson resets it to DRAFT',
    async (status) => {
      const { service, lesson } = await lessonIn(status);

      const changed = await service.setLevels(lesson.id, ['BEGINNER']);
      expect(changed).toMatchObject({
        status: 'DRAFT',
        version: 2,
        contentRevision: 2,
      });
    },
  );

  it('still takes the lesson lock and still checks the expected version', async () => {
    const { service, lessons, lesson } = await lessonIn('APPROVED');
    const locksBefore = lessons.locks;

    await service.update(lesson.id, { title: 'Title' });
    await service.setLevels(lesson.id, ['BEGINNER', 'ADVANCED']);
    expect(lessons.locks).toBe(locksBefore + 2);

    // a stale version is refused even though the request would change nothing
    await expect(
      service.update(lesson.id, { title: 'Title', version: 99 }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.setLevels(lesson.id, ['BEGINNER', 'ADVANCED'], 99),
    ).rejects.toBeInstanceOf(ConflictError);
    // the current version is accepted
    await expect(
      service.update(lesson.id, { title: 'Title', version: 1 }),
    ).resolves.toMatchObject({ version: 1 });
  });

  it('clearing a field that is already empty, or sending only the ignored cover, changes nothing', async () => {
    const { service, lessons, courseId, module } = build();
    const lesson = await service.create(courseId, module.id, { title: 'A' });
    lessons.rows.get(lesson.id)!.status = 'APPROVED';

    await service.update(lesson.id, { shortTitle: null, introduction: '   ' });
    await service.update(lesson.id, { coverMediaId: null });
    expect(lessons.rows.get(lesson.id)).toMatchObject({
      status: 'APPROVED',
      version: 1,
      contentRevision: 1,
    });
  });
});
