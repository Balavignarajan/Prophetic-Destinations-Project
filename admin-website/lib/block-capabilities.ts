/**
 * What the backend currently lets each block type do, mirrored from backend/src/modules/lessons/domain/blocks/variant-types.ts
 * (`VARIANT_BLOCK_TYPES`, which the registry reads for each definition's `variants`). The backend is the source of truth and enforces it
 * (PUT /blocks/:id/levels/:level with content answers 422 "<type> blocks do not support level variants" unless the type is SUPPORTED); this only stops the
 * admin offering an action that cannot succeed. Per-level VISIBILITY (show or hide a block at a level, using the shared content) is always allowed and is not
 * affected by this table.
 *
 * PROVISIONAL (Batch 24): the requirements allow variants for "selected" block types without naming them, so the six marked SUPPORTED below were chosen for now:
 * rich text, callout, Scripture connection, word study, symbol study and historical evidence. The client has not approved the selection. To change it, change the
 * backend list first, then this table (the SUPPORTED rows are the only thing to edit here).
 * No runtime imports: unit-tested with plain Node.
 */
/**
 * NOTE: this table answers ONE question only: may this type have per-level variants? It does not say which types exist or can be created
 * (see block-catalog.ts), and listing a type here with 'UNCONFIRMED' keeps variants disabled (only 'SUPPORTED' enables them).
 */
export type VariantSupport = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNCONFIRMED';

export const BLOCK_VARIANT_SUPPORT: Record<string, VariantSupport> = {
  RICH_TEXT: 'SUPPORTED',
  IMAGE: 'UNCONFIRMED',
  SUMMARY: 'UNCONFIRMED',
  QUIZ: 'UNCONFIRMED',
  INTERACTIVE_IMAGE: 'UNCONFIRMED',
  TIMELINE: 'UNCONFIRMED',
  SCRIPTURE_PASSAGE: 'UNCONFIRMED',
  HISTORICAL_EVIDENCE: 'SUPPORTED',
  SECTION_INTRO: 'UNCONFIRMED',
  CALLOUT: 'SUPPORTED',
  SCRIPTURE_CONNECTION: 'SUPPORTED',
  MAP: 'UNCONFIRMED',
  NARRATIVE_SCENE: 'UNCONFIRMED',
  MEDIA_ANIMATION: 'UNCONFIRMED',
  CONTINUE_EXPLORING: 'UNCONFIRMED',
  REFLECTION_STUDY_ACTIVITY: 'UNCONFIRMED',
  GUIDED_DISCOVERY_QUESTION: 'UNCONFIRMED',
  PROPHECY_EQUIVALENCE: 'UNCONFIRMED',
  PROPHECY_COMPARISON: 'UNCONFIRMED',
  PROPHECY_CALCULATION: 'UNCONFIRMED',
  WORD_STUDY: 'SUPPORTED',
  SYMBOL_STUDY: 'SUPPORTED',
  EXPLORE_DEEPER: 'UNCONFIRMED',
};

/** True only when the backend confirms level-specific content for this block type; unknown types are treated as unsupported. */
export function supportsLevelVariants(blockType: string): boolean {
  return BLOCK_VARIANT_SUPPORT[blockType] === 'SUPPORTED';
}
