/**
 * The block types defined by the Developer Feature & Workflow Guide. This list
 * is fixed by the guide: do not add types that are not in it.
 *
 * Listing a type here only makes its identifier valid (API validation and the
 * database CHECK). Whether a type can actually be used is decided by the
 * BlockTypeRegistry, which today contains RICH_TEXT only.
 */
export const BLOCK_TYPES = [
  'RICH_TEXT',
  'SECTION_INTRO',
  'CALLOUT',
  'SCRIPTURE_PASSAGE',
  'SCRIPTURE_CONNECTION',
  'IMAGE',
  'INTERACTIVE_IMAGE',
  'SYMBOL_STUDY',
  'WORD_STUDY',
  'MAP',
  'TIMELINE',
  'PROPHECY_EQUIVALENCE',
  'PROPHECY_CALCULATION',
  'PROPHECY_COMPARISON',
  'NARRATIVE_SCENE',
  'EXPLORE_DEEPER',
  'REFLECTION_STUDY_ACTIVITY',
  'SUMMARY',
  'QUIZ',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export function isBlockType(value: unknown): value is BlockType {
  return BLOCK_TYPES.includes(value as BlockType);
}
