import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import {
  FakeBlockLevels,
  FakeBlocks,
  FakeLessons,
  rich,
} from '../../../../test/support/block-fakes.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import type { LessonBlockLevelRepository } from '../persistence/lesson-block-level.repository.js';
import type { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import type { LessonRepository } from '../persistence/lesson.repository.js';
import { LessonsFacade } from './lessons.facade.js';

const manager = {} as EntityManager;

/** RICH_TEXT marked as supporting variants (the real registry does not, yet). */
class VariantRegistry extends BlockTypeRegistry {
  override get(type: Parameters<BlockTypeRegistry['get']>[0]) {
    const definition = super.get(type);
    return definition && { ...definition, variants: 'SUPPORTED' as const };
  }
}

/** A registry that knows no block type at all. */
class EmptyRegistry extends BlockTypeRegistry {
  override get() {
    return undefined;
  }
}

function build(
  registry: BlockTypeRegistry = new BlockTypeRegistry(),
  levels: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
) {
  const fakeLessons = new FakeLessons();
  const blocks = new FakeBlocks();
  const blockLevels = new FakeBlockLevels(fakeLessons, blocks);
  const lessonId = randomUUID();
  fakeLessons.add(lessonId, levels);

  const state = { status: 'APPROVED', contentRevision: 7 };
  const lessons = {
    findById: async (id: string) =>
      id === lessonId
        ? {
            id,
            moduleId: 'module-1',
            title: 'The title',
            shortTitle: null,
            subtitle: 'A subtitle',
            introduction: 'Intro',
            estimatedMinutes: 20,
            coverMediaId: null,
            levels: fakeLessons.levelsOf.get(id) ?? [],
            position: 1,
            version: 3,
            ...state,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null,
    findByIdForUpdate: async (id: string) => lessons.findById(id),
    compareAndSetStatus: async (_id: string, from: string, to: string) => {
      if (state.status !== from) return false;
      state.status = to;
      return true;
    },
  } as unknown as LessonRepository;

  const facade = new LessonsFacade(
    lessons,
    blocks as unknown as LessonBlockRepository,
    blockLevels as unknown as LessonBlockLevelRepository,
    registry,
  );
  return { facade, blocks, blockLevels, fakeLessons, lessonId, state };
}

async function addBlock(
  ctx: ReturnType<typeof build>,
  position: number,
  shared: Record<string, unknown> | null,
  visibleAt: LearningLevel[],
  variants: Partial<Record<LearningLevel, Record<string, unknown>>> = {},
) {
  const block = await ctx.blocks.insert({
    lessonId: ctx.lessonId,
    type: 'RICH_TEXT',
    sharedContent: shared,
    position,
  });
  for (const level of visibleAt) {
    await ctx.blockLevels.upsert(
      block.id,
      ctx.lessonId,
      level,
      variants[level] ?? null,
    );
  }
  return block;
}

describe('lockForWorkflow / findWorkflowState', () => {
  it('returns only plain workflow data', async () => {
    const { facade, lessonId } = build();
    const state = await facade.lockForWorkflow(lessonId, manager);
    expect(state).toEqual({
      id: lessonId,
      moduleId: 'module-1',
      status: 'APPROVED',
      contentRevision: 7,
      availableLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    });
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
  });

  it('reports an unknown lesson: 404 when locking, null when reading', async () => {
    const { facade } = build();
    await expect(
      facade.lockForWorkflow(randomUUID(), manager),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await facade.findWorkflowState(randomUUID())).toBeNull();
  });

  it('reads the state without needing a transaction', async () => {
    const { facade, lessonId } = build();
    expect((await facade.findWorkflowState(lessonId))?.status).toBe('APPROVED');
  });
});

describe('compareAndSetStatus', () => {
  it('changes the status only from the expected one', async () => {
    const { facade, lessonId, state } = build();
    expect(
      await facade.compareAndSetStatus(
        lessonId,
        'APPROVED',
        'PUBLISHED',
        manager,
      ),
    ).toBe(true);
    expect(state.status).toBe('PUBLISHED');
    expect(
      await facade.compareAndSetStatus(
        lessonId,
        'APPROVED',
        'PUBLISHED',
        manager,
      ),
    ).toBe(false);
    expect(state.status).toBe('PUBLISHED');
  });

  it('is not an authoring change: the content revision stays', async () => {
    const { facade, lessonId, state } = build();
    await facade.compareAndSetStatus(
      lessonId,
      'APPROVED',
      'PUBLISHED',
      manager,
    );
    expect(state.contentRevision).toBe(7);
  });
});

describe('assembleForPublication', () => {
  it('returns the lesson fields, revision and one resolved entry per available level, in canonical order', async () => {
    const ctx = build(new BlockTypeRegistry(), ['ADVANCED', 'BEGINNER']);
    await addBlock(ctx, 1, rich('shared'), ['BEGINNER', 'ADVANCED']);

    const assembled = await ctx.facade.assembleForPublication(
      ctx.lessonId,
      manager,
    );
    expect(assembled).toMatchObject({
      lessonId: ctx.lessonId,
      moduleId: 'module-1',
      status: 'APPROVED',
      contentRevision: 7,
      availableLevels: ['ADVANCED', 'BEGINNER'],
      lesson: {
        id: ctx.lessonId,
        title: 'The title',
        subtitle: 'A subtitle',
        introduction: 'Intro',
        estimatedMinutes: 20,
        coverMediaId: null,
      },
    });
    expect(assembled.levels.map((l) => l.level)).toEqual([
      'ADVANCED',
      'BEGINNER',
    ]);
    expect(assembled.levels.every((l) => l.resolution.available)).toBe(true);
  });

  it('is plain, serializable data (no entities, no class instances, no repositories)', async () => {
    const ctx = build();
    await addBlock(ctx, 1, rich('x'), ['BEGINNER']);
    const assembled = await ctx.facade.assembleForPublication(
      ctx.lessonId,
      manager,
    );
    expect(JSON.parse(JSON.stringify(assembled))).toEqual(assembled);
  });

  it("resolves each level separately: no level receives another level's variant", async () => {
    const ctx = build(new VariantRegistry());
    await addBlock(ctx, 1, null, ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], {
      BEGINNER: rich('SENTINEL-BEGINNER'),
      INTERMEDIATE: rich('SENTINEL-INTERMEDIATE'),
      ADVANCED: rich('SENTINEL-ADVANCED'),
    });

    const assembled = await ctx.facade.assembleForPublication(
      ctx.lessonId,
      manager,
    );
    for (const entry of assembled.levels) {
      const text = JSON.stringify(entry);
      expect(text).toContain(`SENTINEL-${entry.level}`);
      for (const other of assembled.levels.filter(
        (l) => l.level !== entry.level,
      )) {
        expect(text).not.toContain(`SENTINEL-${other.level}`);
      }
    }
  });

  it('keeps unresolved blocks as resolver diagnostics and does not double-report them as block problems', async () => {
    const ctx = build();
    const empty = await addBlock(ctx, 1, null, ['BEGINNER']); // visible, no content at all
    await addBlock(ctx, 2, rich('fine'), ['BEGINNER']);

    const [beginner] = (
      await ctx.facade.assembleForPublication(ctx.lessonId, manager)
    ).levels;
    expect(beginner.resolution.diagnostics).toEqual([
      {
        code: 'BLOCK_NO_CONTENT',
        blockId: empty.id,
        message: expect.any(String),
      },
    ]);
    expect(beginner.blockProblems).toEqual([]);
  });

  it('reports incomplete and invalid block content, per level', async () => {
    const ctx = build();
    const incomplete = await addBlock(ctx, 1, rich('   '), ['BEGINNER']); // valid shape, no real text
    const invalid = await addBlock(ctx, 2, { html: '<p>x</p>' }, ['BEGINNER']);
    await addBlock(ctx, 3, rich('good'), ['BEGINNER']);

    const [beginner] = (
      await ctx.facade.assembleForPublication(ctx.lessonId, manager)
    ).levels;
    expect(beginner.blockProblems.map((p) => [p.blockId, p.code])).toEqual([
      [incomplete.id, 'BLOCK_CONTENT_INCOMPLETE'],
      [invalid.id, 'BLOCK_CONTENT_INVALID'],
    ]);
    expect(beginner.blockProblems[1].problems.length).toBeGreaterThan(0);
  });

  it('reports a block whose type the registry does not provide', async () => {
    const ctx = build(new EmptyRegistry());
    const block = await addBlock(ctx, 1, rich('x'), ['BEGINNER']);
    const [beginner] = (
      await ctx.facade.assembleForPublication(ctx.lessonId, manager)
    ).levels;
    expect(beginner.blockProblems).toEqual([
      {
        blockId: block.id,
        code: 'BLOCK_TYPE_NOT_AVAILABLE',
        problems: [expect.any(Object)],
      },
    ]);
  });

  it('with the real registry, a stored RICH_TEXT variant is a resolver diagnostic (variants stay unsupported)', async () => {
    const ctx = build();
    const block = await addBlock(ctx, 1, rich('shared'), ['BEGINNER'], {
      BEGINNER: rich('stored variant'),
    });
    const [beginner] = (
      await ctx.facade.assembleForPublication(ctx.lessonId, manager)
    ).levels;
    expect(beginner.resolution.diagnostics.map((d) => d.code)).toEqual([
      'BLOCK_VARIANT_NOT_ALLOWED',
    ]);
    expect(JSON.stringify(beginner)).not.toContain('stored variant');
    expect(beginner.resolution.blocks[0].blockId).toBe(block.id);
  });

  it('a lesson without levels has no level entries', async () => {
    const ctx = build(new BlockTypeRegistry(), []);
    const assembled = await ctx.facade.assembleForPublication(
      ctx.lessonId,
      manager,
    );
    expect(assembled.availableLevels).toEqual([]);
    expect(assembled.levels).toEqual([]);
  });

  it('reports an unknown lesson as NotFoundError', async () => {
    const { facade } = build();
    await expect(
      facade.assembleForPublication(randomUUID(), manager),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
