/**
 * What the backend currently lets each block type do, mirrored from backend/src/modules/lessons/domain/blocks/registry.ts
 * (`variants`). The backend is the source of truth and enforces it (PUT /blocks/:id/levels/:level with content answers 422
 * "<type> blocks do not support level variants" unless the type is SUPPORTED); this only stops the admin offering an action that
 * cannot succeed. RICH_TEXT is UNCONFIRMED: the product guide has not settled whether rich text may have per-level variants, and
 * the backend treats UNCONFIRMED as "no". Per-level VISIBILITY (show or hide a block at a level, using the shared content) is
 * always allowed and is not affected. If the owners approve variants, change the backend registry first, then this table.
 * No runtime imports: unit-tested with plain Node.
 */
/**
 * NOTE: this table answers ONE question only: may this type have per-level variants? It does not say which types exist or can be created
 * (see block-catalog.ts), and listing a type here with 'UNCONFIRMED' keeps variants disabled (only 'SUPPORTED' enables them).
 */
export type VariantSupport = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNCONFIRMED';

export const BLOCK_VARIANT_SUPPORT: Record<string, VariantSupport> = {
  RICH_TEXT: 'UNCONFIRMED',
  IMAGE: 'UNCONFIRMED',
  SUMMARY: 'UNCONFIRMED',
  QUIZ: 'UNCONFIRMED',
  INTERACTIVE_IMAGE: 'UNCONFIRMED',
  TIMELINE: 'UNCONFIRMED',
  SCRIPTURE_PASSAGE: 'UNCONFIRMED',
  HISTORICAL_EVIDENCE: 'UNCONFIRMED',
  SECTION_INTRO: 'UNCONFIRMED',
  CALLOUT: 'UNCONFIRMED',
  SCRIPTURE_CONNECTION: 'UNCONFIRMED',
  MAP: 'UNCONFIRMED',
  NARRATIVE_SCENE: 'UNCONFIRMED',
  MEDIA_ANIMATION: 'UNCONFIRMED',
  CONTINUE_EXPLORING: 'UNCONFIRMED',
  REFLECTION_STUDY_ACTIVITY: 'UNCONFIRMED',
  GUIDED_DISCOVERY_QUESTION: 'UNCONFIRMED',
  PROPHECY_EQUIVALENCE: 'UNCONFIRMED',
  PROPHECY_COMPARISON: 'UNCONFIRMED',
  PROPHECY_CALCULATION: 'UNCONFIRMED',
  WORD_STUDY: 'UNCONFIRMED',
  SYMBOL_STUDY: 'UNCONFIRMED',
  EXPLORE_DEEPER: 'UNCONFIRMED',
};

/** True only when the backend confirms level-specific content for this block type; unknown types are treated as unsupported. */
export function supportsLevelVariants(blockType: string): boolean {
  return BLOCK_VARIANT_SUPPORT[blockType] === 'SUPPORTED';
}
