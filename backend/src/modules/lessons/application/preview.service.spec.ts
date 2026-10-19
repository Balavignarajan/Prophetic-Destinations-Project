import type { MediaFacade } from '../../media/index.js';
import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../shared-kernel/index.js';
import {
  FakeBlockLevels,
  FakeBlocks,
  FakeLessons,
  inlineTransactions,
  rich,
} from '../../../../test/support/block-fakes.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import type { Lesson } from '../domain/models.js';
import type { LessonBlockLevelRepository } from '../persistence/lesson-block-level.repository.js';
import type { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import type { LessonRepository } from '../persistence/lesson.repository.js';
import { BlockLevelService } from './block-level.service.js';
import { BlockService } from './block.service.js';
import { PreviewService } from './preview.service.js';

class VariantRegistry extends BlockTypeRegistry {
  override get(type: Parameters<BlockTypeRegistry['get']>[0]) {
    const definition = super.get(type);
    return definition && { ...definition, variants: 'SUPPORTED' as const };
  }
  override require(type: Parameters<BlockTypeRegistry['require']>[0]) {
    return { ...super.require(type), variants: 'SUPPORTED' as const };
  }
}

function build() {
  const lessons = new FakeLessons();
  const blocks = new FakeBlocks();
  const levels = new FakeBlockLevels(lessons, blocks);
  const repos = [
    lessons as unknown as LessonRepository,
    blocks as unknown as LessonBlockRepository,
    levels as unknown as LessonBlockLevelRepository,
  ] as const;
  const registry = new VariantRegistry();
  const lessonId = randomUUID();
  lessons.add(lessonId, ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
  // The preview reads the lesson's own fields; the fake only has id/levels/version.
  const fullLessons = {
    findById: async (id: string) =>
      id === lessonId
        ? ({
            id,
            moduleId: 'm',
            title: 'T',
            levels: lessons.levelsOf.get(id),
            version: 1,
            status: 'DRAFT',
          } as unknown as Lesson)
        : null,
  } as unknown as LessonRepository;
  return {
    lessonId,
    blockService: new BlockService(
      ...repos,
      registry,
      inlineTransactions,
      { find: () => Promise.resolve(null) } as unknown as MediaFacade,
    ),
    levelService: new BlockLevelService(...repos, registry, inlineTransactions),
    preview: new PreviewService(fullLessons, repos[1], repos[2], registry),
  };
}

describe('PreviewService', () => {
  it('shows each level exactly as the resolver gives it, with the lesson summary', async () => {
    const { lessonId, blockService, levelService, preview } = build();
    const block = await blockService.create(lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich('shared'),
      levels: ['BEGINNER', 'INTERMEDIATE'],
    });
    await levelService.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('beginner'),
    });

    const beginner = await preview.preview(lessonId, 'BEGINNER');
    expect(beginner.lesson).toMatchObject({ id: lessonId, title: 'T' });
    expect(beginner.resolution.blocks[0]).toMatchObject({
      source: 'VARIANT',
      content: rich('beginner'),
    });

    const intermediate = await preview.preview(lessonId, 'INTERMEDIATE');
    expect(intermediate.resolution.blocks[0]).toMatchObject({
      source: 'SHARED',
      content: rich('shared'),
    });

    const advanced = await preview.preview(lessonId, 'ADVANCED');
    expect(advanced.resolution.diagnostics.map((d) => d.code)).toEqual([
      'NO_VISIBLE_BLOCKS',
    ]);
  });

  it('uses the registry: a stored variant for a type without variant support is flagged', async () => {
    const { lessonId, blockService, levelService, preview } = build();
    const block = await blockService.create(lessonId, {
      type: 'RICH_TEXT',
      sharedContent: rich('s'),
    });
    await levelService.setLevel(lessonId, block.id, 'BEGINNER', {
      content: rich('v'),
    });

    // same data, read through the real (variant-less) registry
    const repos = {
      blocks: (preview as unknown as { blocks: LessonBlockRepository }).blocks,
      levels: (preview as unknown as { levels: LessonBlockLevelRepository })
        .levels,
      lessons: (preview as unknown as { lessons: LessonRepository }).lessons,
    };
    const real = new PreviewService(
      repos.lessons,
      repos.blocks,
      repos.levels,
      new BlockTypeRegistry(),
    );
    const result = await real.preview(lessonId, 'BEGINNER');
    expect(result.resolution.blocks[0].unresolved?.code).toBe(
      'BLOCK_VARIANT_NOT_ALLOWED',
    );
  });

  it('reports an unknown lesson as NotFoundError', async () => {
    const { preview } = build();
    await expect(
      preview.preview(randomUUID(), 'BEGINNER'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
