import type { SceneImageKey } from './assets';

/**
 * The presentation model of the Daniel 2 lesson. Scene components render THESE types and know nothing about where the
 * content came from (see source.ts). Text fields are plain strings so approved wording can be edited without touching a
 * component.
 */

export type SceneId =
  | 'intro'
  | 'dream'
  | 'image'
  | 'head-gold'
  | 'chest-silver'
  | 'belly-bronze'
  | 'legs-iron'
  | 'feet-iron-clay'
  | 'stone'
  | 'stone-meaning'
  | 'timeline'
  | 'evidence'
  | 'quiz'
  | 'summary';

export type StatueSectionId = 'head' | 'chest' | 'belly' | 'legs' | 'feet';
export type MaterialKey = 'gold' | 'silver' | 'bronze' | 'iron' | 'ironClay' | 'stone';

/**
 * How firmly the text of Daniel 2 itself supports an identification:
 * - stated:       the passage names it (Daniel 2:38, "you are the head of gold").
 * - traditional:  the passage does not name it; it is the long-standing traditional reading, often supported by other passages.
 * - disputed:     readers differ on what it refers to.
 */
export type Identification = 'stated' | 'traditional' | 'disputed';

/**
 * A Scripture reference. `text` is the verse wording and stays null until a Bible translation that the project is licensed to
 * show has been approved; no wording is bundled or written from memory. The UI shows the reference and says so when it is null.
 */
export type ScriptureRef = {
  reference: string;
  text: string | null;
  /** Required whenever `text` is given, e.g. the translation's name and licence line. */
  attribution?: string;
};

export type StatueSectionInfo = {
  id: StatueSectionId;
  /** Plain description of the part of the image, e.g. "Head". */
  name: string;
  /** The material the passage names for it, e.g. "Gold". */
  material: string;
  materialKey: MaterialKey;
  /** The verse(s) that describe this part of the image. */
  reference: ScriptureRef;
};

type SceneBase = { id: SceneId; title: string; eyebrow: string };

export interface IntroScene extends SceneBase {
  kind: 'intro';
  subtitle: string;
  paragraphs: string[];
  image: SceneImageKey;
}

export interface NarrativeScene extends SceneBase {
  kind: 'narrative';
  paragraphs: string[];
  references: ScriptureRef[];
  /** A short, clearly labelled interpretive remark, if any. */
  interpretationNote?: string;
  image: SceneImageKey;
}

export interface StatueScene extends SceneBase {
  kind: 'statue';
  prompt: string;
  paragraphs: string[];
  references: ScriptureRef[];
  revealHeading: string;
  /** Shown only after the learner chooses to reveal the interpretation. */
  revealNote: string;
}

export interface KingdomScene extends SceneBase {
  kind: 'kingdom';
  sectionId: StatueSectionId;
  /** The kingdom this part is read as, e.g. "Babylon". */
  kingdom: string;
  identification: Identification;
  identificationNote: string;
  /** Approximate period, or null when the configured content gives none. */
  period: string | null;
  /** A plain summary of what the passage describes. A summary, not a quotation. */
  scriptureSummary: string;
  references: ScriptureRef[];
  explanation: string;
  historicalContext: string;
  historicalApplication: string | null;
}

export interface StoneScene extends SceneBase {
  kind: 'stone';
  mode: 'impact' | 'meaning';
  image: SceneImageKey;
  scriptureSummary: string;
  references: ScriptureRef[];
  interpretation: string[];
  /** Where readers differ, if they do. */
  perspectivesNote: string | null;
}

export interface TimelineScene extends SceneBase {
  kind: 'timeline';
  intro: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  identification: Identification;
  bible: ScriptureRef[];
  interpretation: string;
  historicalContext: string;
  historicalApplication: string | null;
}

export interface EvidenceScene extends SceneBase {
  kind: 'evidence';
  intro: string;
  items: EvidenceItem[];
}

export interface QuizScene extends SceneBase {
  kind: 'quiz';
  intro: string;
}

export interface SummaryScene extends SceneBase {
  kind: 'summary';
  points: { sceneId: SceneId; heading: string; text: string }[];
  closing: string;
}

export type Scene =
  | IntroScene
  | NarrativeScene
  | StatueScene
  | KingdomScene
  | StoneScene
  | TimelineScene
  | EvidenceScene
  | QuizScene
  | SummaryScene;

export type TimelineEntry = {
  id: string;
  phase: string;
  materialKey: MaterialKey;
  material: string;
  /** Approximate dates, or null when the configured content gives none. */
  dateRange: string | null;
  identification: Identification;
  references: ScriptureRef[];
  summary: string;
  /** The scene that explains this entry. */
  sceneId: SceneId;
};

export type QuizOption = { id: string; text: string };
export type QuizQuestion = {
  id: string;
  prompt: string;
  options: QuizOption[];
  /** The key. Components read it only after the learner has submitted that question. */
  correctOptionId: string;
  explanation: string;
  /** The scene to revisit if the learner got it wrong. */
  reviewSceneId: SceneId;
};

/** Where the lesson's content comes from. `configured` is built-in content, NOT a published backend course. */
export type LessonSource = {
  kind: 'configured';
  status: 'pending-approval' | 'approved';
  label: string;
};

export interface Daniel2Lesson {
  id: 'daniel-2';
  title: string;
  subtitle: string;
  source: LessonSource;
  statueSections: StatueSectionInfo[];
  scenes: Scene[];
  timeline: TimelineEntry[];
  quiz: QuizQuestion[];
}
