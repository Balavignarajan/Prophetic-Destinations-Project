/**
 * Every block identifier the system accepts: the Developer Feature & Workflow Guide's 19 component types plus HISTORICAL_EVIDENCE.
 *
 * HISTORICAL_EVIDENCE comes from the feature workbook (BLK-020 / CMS-018, P0, Confirmed there) and is NOT in the guide's list of 19. The two
 * documents disagree about which component list governs (open decision D1 in LESSON_COMPONENT_CATALOGUE_PLAN.md), and no product owner has
 * resolved it. It was added anyway, with migration AddHistoricalEvidenceBlockType1791750000000, as a development choice that is subject to
 * that decision. CONTINUE_EXPLORING (BLK-022) and the other workbook-only components have no identifier. Do not add types that no document
 * lists.
 *
 * Listing a type here only makes its identifier valid (API validation and the database CHECK). Whether a type can actually be used is decided
 * by the BlockTypeRegistry: it currently registers twenty-four (RICH_TEXT, IMAGE, SUMMARY, QUIZ, INTERACTIVE_IMAGE, TIMELINE, SCRIPTURE_PASSAGE,
 * HISTORICAL_EVIDENCE, SECTION_INTRO, CALLOUT, SCRIPTURE_CONNECTION, MAP, EXPLORE_DEEPER, WORD_STUDY, SYMBOL_STUDY, PROPHECY_EQUIVALENCE, PROPHECY_COMPARISON, PROPHECY_CALCULATION, REFLECTION_STUDY_ACTIVITY, GUIDED_DISCOVERY_QUESTION, CONTINUE_EXPLORING, NARRATIVE_SCENE, MEDIA_ANIMATION, INTERACTIVE_3D_MODEL). The admin catalog (admin-website/lib/block-catalog.ts) and the mobile renderer list must match it.
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
  // Workbook BLK-020 / CMS-018 (open decision D1). Added with migration AddHistoricalEvidenceBlockType1791750000000.
  'HISTORICAL_EVIDENCE',
  // Workbook BLK-019 "Guided Discovery Question" (open decision D1). PROPOSED identifier. Added with migration AddGuidedDiscoveryBlockType1791800000000.
  'GUIDED_DISCOVERY_QUESTION',
  // Workbook BLK-022 "Continue Exploring" (open decision D1). PROPOSED identifier. Added with migration AddContinueExploringBlockType1791810000000.
  'CONTINUE_EXPLORING',
  // Workbook BLK-016 "Media / Animation Asset" (open decision D1). PROPOSED identifier. Added with migration AddMediaAnimationBlockType1791820000000.
  'MEDIA_ANIMATION',
  // Interactive 3D Model (open decision D1; no document lists it). PROPOSED identifier. Added with migration AddInteractive3dModelBlockType1791940000000.
  'INTERACTIVE_3D_MODEL',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export function isBlockType(value: unknown): value is BlockType {
  return BLOCK_TYPES.includes(value as BlockType);
}
