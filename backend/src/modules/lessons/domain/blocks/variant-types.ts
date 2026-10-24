import type { BlockType } from './block-types.js';

/**
 * THE list of block types that may have level-specific content (a Beginner, Intermediate or Advanced version of the block next to its shared content).
 * The block type registry reads it, and nothing else decides: to approve a different selection, change this list (and the same list in
 * admin-website/lib/block-capabilities.ts, which only stops the admin offering what the backend would refuse). Types that are not listed keep working exactly
 * as before: visibility per level is always allowed, but a stored variant for them is refused (422) and a block that somehow has one cannot be resolved.
 *
 * PROVISIONAL (Batch 24): the requirements allow variants for "selected" block types without naming them, so these six were chosen for now. They are all
 * author-written text/structured content whose content contract is complete on its own, so a variant is simply another full content object of the same type,
 * validated by the same rules as the shared content. The client has not approved the selection yet.
 *
 * Deliberately NOT listed: quizzes (scoring and answers must not differ per level), interactive images, maps, timelines (they already have per-item level
 * flags), media/animation blocks, and every other type.
 */
export const VARIANT_BLOCK_TYPES = [
  'RICH_TEXT',
  'CALLOUT',
  'SCRIPTURE_CONNECTION',
  'WORD_STUDY',
  'SYMBOL_STUDY',
  'HISTORICAL_EVIDENCE',
] as const satisfies readonly BlockType[];

/** What the registry records for a type: SUPPORTED when it is in the list above, otherwise UNCONFIRMED (treated as "no variants"). */
export function variantSupportOf(type: BlockType): 'SUPPORTED' | 'UNCONFIRMED' {
  return (VARIANT_BLOCK_TYPES as readonly string[]).includes(type) ? 'SUPPORTED' : 'UNCONFIRMED';
}
