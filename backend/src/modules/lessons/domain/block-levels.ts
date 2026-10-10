import {
  BusinessRuleError,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import type { BlockTypeDefinition } from './blocks/registry.js';

/**
 * A block may only have a level variant if its type's content contract says so.
 * UNCONFIRMED counts as "no": nothing is assumed until the contract confirms it.
 * (Visibility, a level row without a variant, is always allowed.)
 */
export function checkVariantAllowed(definition: BlockTypeDefinition): void {
  if (definition.variants !== 'SUPPORTED') {
    throw new BusinessRuleError(
      `${definition.type} blocks do not support level variants`,
      { type: definition.type, variants: definition.variants },
    );
  }
}

/** A block can only be visible at a level its lesson is available at. */
export function checkLessonHasLevel(
  lessonLevels: readonly LearningLevel[],
  level: LearningLevel,
): void {
  if (!lessonLevels.includes(level)) {
    throw new BusinessRuleError(
      `The lesson is not available at the ${level} level`,
      { level, lessonLevels: [...lessonLevels] },
    );
  }
}
