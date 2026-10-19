/**
 * What the backend currently lets each block type do, mirrored from backend/src/modules/lessons/domain/blocks/registry.ts
 * (`variants`). The backend is the source of truth and enforces it (PUT /blocks/:id/levels/:level with content answers 422
 * "<type> blocks do not support level variants" unless the type is SUPPORTED); this only stops the admin offering an action that
 * cannot succeed. RICH_TEXT is UNCONFIRMED: the product guide has not settled whether rich text may have per-level variants, and
 * the backend treats UNCONFIRMED as "no". Per-level VISIBILITY (show or hide a block at a level, using the shared content) is
 * always allowed and is not affected. If the owners approve variants, change the backend registry first, then this table.
 * No runtime imports: unit-tested with plain Node.
 */
export type VariantSupport = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNCONFIRMED';

export const BLOCK_VARIANT_SUPPORT: Record<string, VariantSupport> = {
  RICH_TEXT: 'UNCONFIRMED',
};

/** True only when the backend confirms level-specific content for this block type; unknown types are treated as unsupported. */
export function supportsLevelVariants(blockType: string): boolean {
  return BLOCK_VARIANT_SUPPORT[blockType] === 'SUPPORTED';
}
