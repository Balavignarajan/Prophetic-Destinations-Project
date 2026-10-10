import { BusinessRuleError } from '../../../../shared-kernel/index.js';
import type { BlockTypeDefinition } from './registry.js';

/** Sanity limit on blocks per lesson (also the most a reorder request may list). */
export const MAX_BLOCKS_PER_LESSON = 500;

export type BlockContent = Record<string, unknown>;

/**
 * Validates content against its block type. `null`/`undefined` mean "no content
 * yet" and are always acceptable on a draft. Throws with the list of problems.
 */
export function checkBlockContent(
  definition: BlockTypeDefinition,
  content: BlockContent | null | undefined,
): BlockContent | null {
  if (content === null || content === undefined) return null;
  const problems = definition.validateShape(content);
  if (problems.length > 0) {
    throw new BusinessRuleError('Block content is not valid', { problems });
  }
  return content;
}
