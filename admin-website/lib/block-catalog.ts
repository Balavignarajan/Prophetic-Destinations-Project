/**
 * The admin's ONE definition of which content types exist today, what authors call them, and what the editor can do with them. The "Add
 * content" picker and the review panel read it; nothing derives "can this be created?" from anything else. In particular it is NOT derived from
 * `BLOCK_VARIANT_SUPPORT` (block-capabilities.ts), which answers a different question (may this type have per-level variants?). Adding or
 * removing a type here never changes variant support, and the other way round.
 *
 * Each entry's `type` is the backend block type (backend/src/modules/lessons/domain/blocks/registry.ts); it is an internal key and is never
 * shown to authors. `actions.create` / `actions.edit` say that a create flow / edit flow is wired in `app/lessons/[lessonId]/page.tsx`
 * (`openEditorFor` and `editBlock`). Do not mark a type here until both exist.
 *
 * KNOWN DUPLICATION (no shared package exists, and none is created): the list of implemented types also lives in
 *   1. backend/src/modules/lessons/domain/blocks/registry.ts      (what the API accepts and validates),
 *   2. this file                                                    (what authors can add and edit),
 *   3. mobile-app/src/screens/lesson-screen.tsx `SUPPORTED_BLOCKS`  (what the learner app renders; other types get a notice),
 *   4. admin-website/lib/block-capabilities.ts                      (variant support only; per-type rows mirror the registry).
 * A new block type must be added to all four.
 * No imports: usable anywhere.
 */
export type BlockGroup = 'Text and sources' | 'Images and timelines' | 'Check understanding';

export interface BlockCatalogEntry {
  /** Internal backend block type. Never shown. */
  type: string;
  name: string;
  description: string;
  group: BlockGroup;
  /** 'passage': the block's whole purpose is choosing a Bible passage, which needs the Bible text. */
  scripture?: 'passage';
  actions: { create: boolean; edit: boolean };
  /** A small picture shown beside the name in the Add content picker; only blocks that have one set it. */
  icon?: 'cube';
}

const BOTH = { create: true, edit: true } as const;

export const IMPLEMENTED_BLOCKS: readonly BlockCatalogEntry[] = [
  { type: 'RICH_TEXT', name: 'Text', description: 'Paragraphs, lists and links for explaining a topic in your own words.', group: 'Text and sources', actions: BOTH },
  { type: 'SECTION_INTRO', name: 'Section heading', description: 'A heading that starts a new part of the lesson, with an optional subtitle and picture.', group: 'Text and sources', actions: BOTH },
  { type: 'CALLOUT', name: 'Callout', description: 'A short highlighted note such as Remember, Key idea or Prophecy principle, in your own words.', group: 'Text and sources', actions: BOTH },
  { type: 'SUMMARY', name: 'Summary', description: 'Rounds off a lesson with key ideas, and optionally key Scripture and prophecy and application takeaways.', group: 'Text and sources', actions: BOTH },
  { type: 'SCRIPTURE_PASSAGE', name: 'Scripture passage', description: 'A Bible passage chosen by book, chapter and verses, with optional commentary of your own.', group: 'Text and sources', scripture: 'passage', actions: BOTH },
  { type: 'SCRIPTURE_CONNECTION', name: 'Scripture connection', description: 'Related Bible passages in an order you choose, each with your own explanation of how they connect.', group: 'Text and sources', scripture: 'passage', actions: BOTH },
  { type: 'EXPLORE_DEEPER', name: 'Explore Deeper', description: 'An optional section with a title, an introduction and, if you like, text, Scripture, images and more inside it, that learners open when they want to study further.', group: 'Text and sources', actions: BOTH },
  { type: 'HISTORICAL_EVIDENCE', name: 'Historical evidence', description: 'A dated piece of evidence with your explanation, an optional quotation from the source, and where it comes from.', group: 'Text and sources', actions: BOTH },
  { type: 'IMAGE', name: 'Image', description: 'A picture with a description for people who cannot see it, an optional caption and its source.', group: 'Images and timelines', actions: BOTH },
  { type: 'INTERACTIVE_IMAGE', name: 'Interactive image', description: 'A picture with numbered markers. Learners tap a marker to read its explanation.', group: 'Images and timelines', actions: BOTH },
  { type: 'WORD_STUDY', name: 'Word study', description: 'An English word with its original-language word, transliteration and your own definition, tied to a verse.', group: 'Text and sources', scripture: 'passage', actions: BOTH },
  { type: 'SYMBOL_STUDY', name: 'Symbol study', description: 'A biblical symbol with its primary passage, its meaning and your explanation, and optional supporting passages and an illustration.', group: 'Text and sources', scripture: 'passage', actions: BOTH },
  { type: 'PROPHECY_EQUIVALENCE', name: 'Prophecy equivalence', description: 'Connects several expressions you list (for example different ways of stating a period) to one concept, each with an optional label and Bible passages.', group: 'Text and sources', actions: BOTH },
  { type: 'PROPHECY_COMPARISON', name: 'Prophecy comparison', description: 'Cards that set out the characteristics of two or more entities or passages side by side, in your own words.', group: 'Text and sources', actions: BOTH },
  { type: 'PROPHECY_CALCULATION', name: 'Prophecy calculation', description: 'Step-by-step rows you write yourself, each with a value, an operator or explanation and a result. The app only displays them; it does not calculate.', group: 'Text and sources', actions: BOTH },
  { type: 'REFLECTION_STUDY_ACTIVITY', name: 'Study activity', description: 'An instruction to Reflect, Compare, Find, Study, Read or apply, with optional Bible references. Learners read it; nothing is typed or saved.', group: 'Check understanding', actions: BOTH },
  { type: 'GUIDED_DISCOVERY_QUESTION', name: 'Guided question', description: 'One study question that points learners to a Bible passage and your explanation, shown directly in the lesson.', group: 'Check understanding', scripture: 'passage', actions: BOTH },
  { type: 'CONTINUE_EXPLORING', name: 'Continue exploring', description: 'Links to other lessons you choose for learners to read next, each with an optional label. Separate from the lesson\u2019s Related lessons list.', group: 'Text and sources', actions: BOTH },
  { type: 'NARRATIVE_SCENE', name: 'Narrative scene', description: 'A short story moment: an optional picture, a few lines of your own narrative and optional Bible passages. Shown still, without motion effects.', group: 'Images and timelines', actions: BOTH },
  { type: 'MEDIA_ANIMATION', name: 'Video or animation', description: 'An animated WebP, MP4 video, Lottie animation, or YouTube video with a poster, caption and description. Videos, Lottie and YouTube need an internet connection.', group: 'Images and timelines', actions: BOTH },
  { type: 'INTERACTIVE_3D_MODEL', name: 'Interactive 3D Model', description: 'A 3D model (GLB file) from your Media Library with an optional title, poster and description. Learners rotate and zoom it in the app, and you can place numbered hotspots on its surface that open an explanation and Scripture. Needs an internet connection.', group: 'Images and timelines', icon: 'cube', actions: BOTH },
  { type: 'MAP', name: 'Map or diagram', description: 'A static map or diagram from your Media Library, with an optional description and optional numbered markers that show an explanation.', group: 'Images and timelines', actions: BOTH },
  { type: 'TIMELINE', name: 'Timeline', description: 'Events in order, each with a date or period, a title and an explanation.', group: 'Images and timelines', actions: BOTH },
  { type: 'QUIZ', name: 'Quiz', description: 'Add one of your existing quizzes so learners can check what they have learned.', group: 'Check understanding', actions: BOTH },
];

/** The types an author can add today. */
export const ADDABLE_BLOCKS: readonly BlockCatalogEntry[] = IMPLEMENTED_BLOCKS.filter((block) => block.actions.create);

/** What authors call a type; a stored type this admin does not know is called a generic name, never its identifier. */
export function friendlyBlockName(type: string): string {
  return IMPLEMENTED_BLOCKS.find((block) => block.type === type)?.name ?? 'Content block';
}
