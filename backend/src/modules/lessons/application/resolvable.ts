import type { BlockTypeRegistry } from '../domain/blocks/registry.js';
import type {
  ResolvableBlock,
  ResolvableLesson,
} from '../domain/level-resolution.js';
import type {
  BlockLevelSetting,
  Lesson,
  LessonBlock,
} from '../domain/models.js';

/**
 * Turns the stored lesson, its blocks and their level rows into the plain input
 * of the pure resolver. Shared by preview and publication assembly, so both feed
 * the resolver exactly the same way.
 */
export function toResolvable(
  lesson: Pick<Lesson, 'levels'>,
  blocks: readonly LessonBlock[],
  rowsByBlock: ReadonlyMap<string, readonly BlockLevelSetting[]>,
  registry: BlockTypeRegistry,
): ResolvableLesson {
  return {
    availableLevels: lesson.levels,
    blocks: blocks.map((block): ResolvableBlock => ({
      id: block.id,
      type: block.type,
      position: block.position,
      sharedContent: block.sharedContent,
      variantSupport: registry.get(block.type)?.variants ?? 'NOT_SUPPORTED',
      levels: (rowsByBlock.get(block.id) ?? []).map((row) => ({
        level: row.level,
        variant: row.content,
      })),
    })),
  };
}
