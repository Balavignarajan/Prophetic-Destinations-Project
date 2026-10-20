import { ADDABLE_BLOCKS, type BlockCatalogEntry, type BlockGroup } from './block-catalog';

/**
 * What the "Add content" picker offers. The list, names, descriptions and groups come from the explicit catalog (block-catalog.ts); this file
 * only adds search. Availability is NOT derived from the level-variant table. No imports beyond the catalog: usable anywhere.
 */
export type PickerGroup = BlockGroup;
export type PickerBlock = BlockCatalogEntry;

export const PICKER_GROUPS: PickerGroup[] = ['Text and sources', 'Images and timelines', 'Check understanding'];

/** The content types an author can add today. */
export const PICKER_BLOCKS: readonly PickerBlock[] = ADDABLE_BLOCKS;

/** Blocks whose name or description contains every word typed (case-insensitive); an empty query returns all. */
export function filterPickerBlocks(query: string): readonly PickerBlock[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return PICKER_BLOCKS;
  return PICKER_BLOCKS.filter((block) => {
    const haystack = `${block.name} ${block.description}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
