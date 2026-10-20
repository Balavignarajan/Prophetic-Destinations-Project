import type { LearningLevel } from '@/learning/levels';

/**
 * The learner-facing assessment contract (backend/docs/assessments.md, the public API of the backend's assessments module):
 *
 *   GET  /assessments/active                     -> PublicAssessment
 *   POST /assessments/:assessmentId/submissions  -> SubmissionResult   (body: { version, answers: [{ questionId, optionId }] })
 *
 * Nothing here carries points or scoring configuration: the backend never sends them, and the app never scores. The level is whatever
 * the backend recommends.
 */
export interface PublicOption {
  id: string;
  position: number;
  text: string;
}

export interface PublicQuestion {
  id: string;
  position: number;
  /** Only single choice exists; anything else makes the assessment unusable by this build. */
  type: 'SINGLE_CHOICE';
  prompt: string;
  options: PublicOption[];
}

export interface PublicAssessment {
  assessmentId: string;
  /** The published version this app rendered. It is sent back with the answers so they are scored against exactly these questions. */
  version: number;
  title: string;
  instructions: string | null;
  /** true: every question must be answered; false: any non-empty subset may be. */
  requireAllQuestions: boolean;
  questions: PublicQuestion[];
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string;
}

export interface SubmissionResult {
  assessmentId: string;
  version: number;
  /** The backend's recommendation. The app never computes or adjusts it. */
  recommendedLevel: LearningLevel;
  /** Total points per level, from the backend's stored scoring. Not percentages. */
  scores: Record<LearningLevel, number>;
  /** The levels that shared the highest total (more than one: the backend's tie-break chose `recommendedLevel`). */
  tiedLevels: LearningLevel[];
  answered: number;
  total: number;
  /** Text written by the editors for the recommended level, or null. */
  message: string | null;
  /** true: the version answered is still the active one. false: it was replaced or withdrawn after this app loaded it. */
  current: boolean;
  /** What a retake would use now; null when no assessment is published. */
  activePublication: { assessmentId: string; version: number } | null;
}

/** What the device remembers of the last completed assessment. Device-local and non-sensitive; the answers are never stored. */
export interface StoredAssessmentResult {
  assessmentId: string;
  version: number;
  recommendedLevel: LearningLevel;
  completedAt: string;
}
