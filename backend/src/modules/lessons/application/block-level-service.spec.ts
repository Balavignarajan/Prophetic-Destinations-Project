import type { MediaFacade } from '../../media/index.js';
import { randomUUID } from 'node:crypto';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import {
  FakeBlockLevels,
  FakeBlocks,
  FakeLessons,
  inlineTransactions,
  rich,
} from '../../../../test/support/block-fakes.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import type { LessonBlockLevelRepository } from '../persistence/lesson-block-level.repository.js';
import type { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import type { LessonRepository } from '../persistence/lesson.repository.js';
import { BlockLevelService } from './block-level.service.js';
import { BlockService } from './block.service.js';

/** The real registry, except RICH_TEXT is marked as supporting variants (as a future content contract might). */
class VariantRegistry extends BlockTypeRegistry {
  override get(type: Parameters<BlockTypeRegistry['get']>[0]) {
    const definition = super.get(type);
    return definition && { ...definition, variants: 'SUPPORTED' as const };
  }
  override require(type: Parameters<BlockTypeRegistry['require']>[0]) {
    return { ...super.require(type), variants: 'SUPPORTED' as const };
  }
}

function build(registry: BlockTypeRegistry = new VariantRegistry()) {
  const lessons = new FakeLessons();
  const blocks = new FakeBlocks();
  const levels = new FakeBlockLevels(lessons, blocks);
  const asRepos = [
    lessons as unknown as LessonRepository,
    blocks as unknown as LessonBlockRepository,
    levels as unknown as LessonBlockLevelRepository,
  ] as const;
  const blockService = new BlockService(
    ...asRepos,
    registry,
    inlineTransactions,
    { find: () => Promise.resolve(null) } as unknown as MediaFacade,
  );
  const service = new BlockLevelService(
    ...asRepos,
    registry,
    inlineTransactions,
  );
  const lessonId = randomUUID();
  lessons.add(lessonId, ['BEGINNER', 'INTERMEDIATE']); // not ADVANCED
  return { lessons, blocks, levels, blockService, service, lessonId };
}

async function withBlock(registry?: BlockTypeRegistry) {
  const ctx = build(registry);
  const block = await ctx.blockService.create(ctx.lessonId, {
    type: 'RICH_TEXT',
    sharedContent: rich('shared'),
  });
  ctx.lessons.drafted.length = 0;
  return { ...ctx, block };
}

describe('making a block visible', () => {
  it('a new block is hidden everywhere', async () => {
    const { block } = await withBlock();
    expect(block.levels).toEqual([]);
  });

  it('shows it at a level using the shared content (content: null)', async () => {
    const { service, lessonId, block } = await withBlock();
    const result = await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: null,
    });
    expect(result.levels).toEqual([{ level: 'BEGINNER', content: null }]);
  });

  it('returns levels in canonical order whatever order they were added in', async () => {
    const { service, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'INTERMEDIATE', {
      content: null,
    });
    const result = await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: null,
    });
    expect(result.levels.map((l) => l.level)).toEqual([
      'BEGINNER',
      'INTERMEDIATE',
    ]);
  });

  it('refuses a level the lesson is not available at (422) and changes nothing', async () => {
    const { service, levels, lessons, lessonId, block } = await withBlock();
    await expect(
      service.setLevel(lessonId, block.id, 'ADVANCED', { content: null }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(levels.rows).toEqual([]);
    expect(lessons.drafted).toEqual([]);
  });

  it('is available at creation only for levels the lesson has', async () => {
    const { blockService, lessonId } = build();
    const created = await blockService.create(lessonId, {
      type: 'RICH_TEXT',
      levels: ['INTERMEDIATE', 'BEGINNER'],
    });
    expect(created.levels.map((l) => l.level)).toEqual([
      'BEGINNER',
      'INTERMEDIATE',
    ]);
    await expect(
      blockService.create(lessonId, {
        type: 'RICH_TEXT',
        levels: ['ADVANCED'],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('variants (full replacement)', () => {
  it('stores a variant for exactly one level and leaves the others alone', async () => {
    const { service, levels, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    const result = await service.setLevel(lessonId, block.id, 'INTERMEDIATE', {
      content: rich('intermediate'),
    });
    expect(result.levels).toEqual([
      { level: 'BEGINNER', content: null },
      { level: 'INTERMEDIATE', content: rich('intermediate') },
    ]);
    expect(levels.contentAt(block.id, 'BEGINNER')).toBeNull();
  });

  it('replaces the whole variant: nothing of the old one survives', async () => {
    const { service, levels, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('first'),
    });
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('second'),
    });
    expect(levels.contentAt(block.id, 'BEGINNER')).toEqual(rich('second'));
  });

  it('turns a variant back into "use shared content" with an explicit null', async () => {
    const { service, levels, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    expect(levels.contentAt(block.id, 'BEGINNER')).toBeNull();
  });

  it('validates the variant with the same rules as shared content (422, nothing stored)', async () => {
    const { service, levels, lessonId, block } = await withBlock();
    for (const content of [
      { html: '<p>x</p>' },
      { body: { type: 'doc', content: [{ type: 'image' }] } },
      {
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'x',
                  marks: [
                    { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]) {
      await expect(
        service.setLevel(lessonId, block.id, 'BEGINNER', { content }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    }
    expect(levels.rows).toEqual([]);
  });

  it('editing the shared content never touches variants', async () => {
    const { service, blockService, levels, lessonId, block } =
      await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('variant'),
    });
    await blockService.update(lessonId, block.id, {
      sharedContent: rich('new shared'),
    });
    expect(levels.contentAt(block.id, 'BEGINNER')).toEqual(rich('variant'));
  });
});

describe('the real registry: RICH_TEXT variants are unconfirmed, so unsupported', () => {
  it('rejects a variant (422) but still allows plain visibility', async () => {
    const { service, levels, lessonId, block } = await withBlock(
      new BlockTypeRegistry(),
    );
    const error = await service
      .setLevel(lessonId, block.id, 'BEGINNER', { content: rich('variant') })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).details).toEqual({
      type: 'RICH_TEXT',
      variants: 'UNCONFIRMED',
    });
    expect(levels.rows).toEqual([]);

    await expect(
      service.setLevel(lessonId, block.id, 'BEGINNER', { content: null }),
    ).resolves.toMatchObject({
      levels: [{ level: 'BEGINNER', content: null }],
    });
  });
});

describe('versions, no-ops and lesson status', () => {
  it('an effective change bumps the block version and puts the lesson back to DRAFT', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    const result = await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: null,
    });
    expect(result.version).toBe(block.version + 1);
    expect(lessons.drafted).toEqual([lessonId]);
  });

  it('writing what is already stored changes nothing: no version bump, no status reset', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    const before = (
      await service.setLevel(lessonId, block.id, 'INTERMEDIATE', {
        content: null,
      })
    ).version;
    lessons.drafted.length = 0;

    const sameVisibility = await service.setLevel(
      lessonId,
      block.id,
      'INTERMEDIATE',
      { content: null },
    );
    // same variant, keys in a different order
    const reordered = {
      body: { content: rich('v').body.content, type: 'doc' },
    };
    const sameVariant = await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: reordered,
    });

    expect(sameVisibility.version).toBe(before);
    expect(sameVariant.version).toBe(before);
    expect(lessons.drafted).toEqual([]);
  });

  it('a different array order or value is a real change', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    lessons.drafted.length = 0;
    const result = await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v2'),
    });
    expect(lessons.drafted).toEqual([lessonId]);
    expect(result.version).toBeGreaterThan(block.version + 1);
  });

  it('refuses a stale version, even for what would be a no-op', async () => {
    const { service, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    await expect(
      service.setLevel(lessonId, block.id, 'BEGINNER', {
        content: null,
        version: block.version,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.setLevel(lessonId, block.id, 'INTERMEDIATE', {
        content: null,
        version: block.version,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('never changes the lesson version (only status)', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    expect((await lessons.findById(lessonId))!.version).toBe(1);
  });

  it('locks the lesson before the block', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    lessons.locked.length = 0;
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    expect(lessons.locked).toEqual([lessonId]);
  });
});

describe('hiding a block at a level', () => {
  it('hides a block that has no variant at that level', async () => {
    const { service, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    const result = await service.removeLevel(
      lessonId,
      block.id,
      'BEGINNER',
      {},
    );
    expect(result.levels).toEqual([]);
  });

  it('refuses to throw a variant away without an explicit discard (409), and keeps everything', async () => {
    const { service, levels, lessons, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('precious'),
    });
    lessons.drafted.length = 0;

    const error = await service
      .removeLevel(lessonId, block.id, 'BEGINNER', {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toEqual({
      level: 'BEGINNER',
      hasVariant: true,
    });
    expect(levels.contentAt(block.id, 'BEGINNER')).toEqual(rich('precious'));
    expect(lessons.drafted).toEqual([]);
  });

  it('discards the variant when told to', async () => {
    const { service, levels, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    await service.removeLevel(lessonId, block.id, 'BEGINNER', {
      discardVariant: true,
    });
    expect(levels.contentAt(block.id, 'BEGINNER')).toBeUndefined();
  });

  it('hiding a block that is already hidden is a no-op', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    const result = await service.removeLevel(
      lessonId,
      block.id,
      'ADVANCED',
      {},
    );
    expect(result.version).toBe(block.version);
    expect(lessons.drafted).toEqual([]);
  });

  it('an effective hide bumps the version and resets the lesson', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    lessons.drafted.length = 0;
    const result = await service.removeLevel(
      lessonId,
      block.id,
      'BEGINNER',
      {},
    );
    expect(result.version).toBe(block.version + 2);
    expect(lessons.drafted).toEqual([lessonId]);
  });
});

describe('scoping', () => {
  it('cannot reach a block through another lesson, and unknown ids are 404', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    const other = randomUUID();
    lessons.add(other, ['BEGINNER']);
    await expect(
      service.setLevel(other, block.id, 'BEGINNER', { content: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.removeLevel(other, block.id, 'BEGINNER', {}),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.setLevel(lessonId, randomUUID(), 'BEGINNER', { content: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.setLevel(randomUUID(), block.id, 'BEGINNER', { content: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('level settings follow the block (BlockService)', () => {
  it('duplicate copies visibility and variants as independent rows', async () => {
    const { service, blockService, levels, lessonId, block } =
      await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('beginner variant'),
    });
    await service.setLevel(lessonId, block.id, 'INTERMEDIATE', {
      content: null,
    });

    const copy = await blockService.duplicate(lessonId, block.id);
    expect(copy.levels).toEqual([
      { level: 'BEGINNER', content: rich('beginner variant') },
      { level: 'INTERMEDIATE', content: null },
    ]);

    await service.setLevel(lessonId, copy.id, 'BEGINNER', {
      content: rich('changed copy'),
    });
    expect(levels.contentAt(block.id, 'BEGINNER')).toEqual(
      rich('beginner variant'),
    );
  });

  it("delete removes the block's level rows and leaves other blocks' rows alone", async () => {
    const { service, blockService, levels, lessonId, block } =
      await withBlock();
    const other = await blockService.create(lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich('o'),
      levels: ['BEGINNER'],
    });
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });

    await blockService.delete(lessonId, block.id);
    expect(levels.rows.map((r) => r.blockId)).toEqual([other.id]);
  });

  it('get and list include the levels in canonical order', async () => {
    const { service, blockService, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'INTERMEDIATE', {
      content: null,
    });
    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    expect(
      (await blockService.get(lessonId, block.id)).levels.map((l) => l.level),
    ).toEqual(['BEGINNER', 'INTERMEDIATE']);
    expect(
      (await blockService.list(lessonId))[0].levels.map((l) => l.level),
    ).toEqual(['BEGINNER', 'INTERMEDIATE']);
  });
});

describe('content revision', () => {
  it('moves exactly once for an effective visibility or variant change', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    const start = lessons.revision(lessonId);

    await service.setLevel(lessonId, block.id, 'BEGINNER', { content: null });
    expect(lessons.revision(lessonId)).toBe(start + 1);
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    expect(lessons.revision(lessonId)).toBe(start + 2);
    await service.removeLevel(lessonId, block.id, 'BEGINNER', {
      discardVariant: true,
    });
    expect(lessons.revision(lessonId)).toBe(start + 3);
  });

  it('does not move for no-op writes, for hiding what is already hidden, or for refused requests', async () => {
    const { service, lessons, lessonId, block } = await withBlock();
    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    const start = lessons.revision(lessonId);

    await service.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });
    await service.removeLevel(lessonId, block.id, 'ADVANCED', {});
    await service
      .removeLevel(lessonId, block.id, 'BEGINNER', {})
      .catch(() => undefined); // refused: has a variant
    await service
      .setLevel(lessonId, block.id, 'ADVANCED', { content: null })
      .catch(() => undefined); // lesson lacks ADVANCED
    expect(lessons.revision(lessonId)).toBe(start);
  });
});
