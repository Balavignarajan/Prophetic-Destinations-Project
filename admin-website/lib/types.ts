export type Role = 'ADMIN' | 'EDITOR' | 'REVIEWER';

export type LearningLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  details?: {
    reason?: string;
    [key: string]: unknown;
  };
  requestId?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  passwordChangeRequired?: boolean;
}

export interface AuthSessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  admin: AdminUser;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  /** Working cover image (media asset id), or null. */
  coverMediaId?: string | null;
  /** The Home Entry (learner Home topic) the course belongs to, or null/absent for an ordinary course. */
  homeEntryId?: string | null;
  /** 1-based place in the manual course order. */
  position?: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A course assigned to a Home Entry, as the Home Entries list shows it. */
export interface HomeEntryCourse {
  id: string;
  title: string;
  status: Course['status'];
}

/**
 * A topic on the learner Home screen (GET /admin/home-entries): its title and description, an optional card picture, whether it is shown and where. It holds NO course of its own:
 * courses join it from the course form, so it may have none ("No courses assigned"). Which topics a learner actually sees is decided when the app asks: enabled AND at least one
 * assigned course published with lessons at the learner's level.
 */
export interface HomeEntry {
  id: string;
  title: string;
  description: string | null;
  /** The card's own picture (media asset id), or null: then the app shows the cover of the first published course. */
  imageMediaId: string | null;
  /** 1-based place on Home. */
  position: number;
  isEnabled: boolean;
  /** The learning levels the administrators chose to show this entry at (all three unless a choice was made). Not a promise that learners see it: that also needs a published course at the level. */
  visibleLevels: LearningLevel[];
  version: number;
  /** How many courses are assigned (any status). */
  courseCount: number;
  /** The assigned courses in the course order. */
  courses: HomeEntryCourse[];
  createdAt: string;
  updatedAt: string;
}

export interface ModuleItem {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonSummary {
  id: string;
  /** null = a standalone library lesson (no course, no module; never published). */
  courseId: string | null;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  estimatedMinutes: number | null;
  /** Admin organisation tags (CMS-021); never shown to learners. Absent from a server that has not been updated, which counts as none. */
  tags?: string[];
  position: number;
  levels: LearningLevel[];
  coverMediaId: string | null;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  version: number;
  contentRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlockLevelVariant {
  level: LearningLevel;
  content: Record<string, unknown> | null;
}

export interface LessonBlock {
  id: string;
  lessonId: string;
  type: string;
  position: number;
  sharedContent: Record<string, unknown> | null;
  levels: BlockLevelVariant[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A reusable block in the library list (no content): GET /admin/reusable-blocks. */
export interface ReusableBlockSummary {
  id: string;
  name: string;
  description: string | null;
  type: string;
  levels: { level: LearningLevel; hasVariant: boolean }[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A reusable block with its content: GET /admin/reusable-blocks/:id. `levels[].content` is that level's own version, or null (uses the shared content). */
export interface ReusableBlock {
  id: string;
  name: string;
  description: string | null;
  type: string;
  sharedContent: Record<string, unknown> | null;
  levels: { level: LearningLevel; content: Record<string, unknown> | null }[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What an insertion did NOT carry over (POST /admin/reusable-blocks/:id/insert). */
export interface ReusableLeftOut {
  level: LearningLevel;
  hadVariant: boolean;
  reason: 'LESSON_NOT_AVAILABLE_AT_LEVEL' | 'VARIANTS_NOT_SUPPORTED';
}

export interface WorkflowState {
  subjectId: string;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  /** Lesson workflow state: content revision counter (use for expectedContentRevision). */
  contentRevision?: number;
  /** Course/module workflow state: catalog version (use for expectedVersion). */
  version?: number;
  /** Course/module workflow state: it is in the course's active catalog version. */
  published?: boolean;
  /** Lesson: the publication learners get now (null if none). Course/module: the active catalog version. */
  activePublication?: { version: number } | null;
  allowedActions: ('SUBMIT_FOR_REVIEW' | 'REQUEST_CHANGES' | 'APPROVE' | 'PUBLISH' | 'UNPUBLISH')[];
}

export interface WorkflowEvent {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  note: string | null;
  createdAt: string;
}

export interface ReadinessIssue {
  code: string;
  severity: 'BLOCKING';
  source: 'RULE' | 'RESOLVER' | 'SAFEGUARD';
  level?: LearningLevel;
  blockId?: string;
  message: string;
  problems?: { code: string; message: string; path?: string }[];
}

export interface LevelReadiness {
  level: LearningLevel;
  visibleBlocks: number;
  resolvedBlocks: number;
}

export interface ReadinessReport {
  lessonId: string;
  ready: boolean;
  contentRevision: number;
  issues: ReadinessIssue[];
  levels: LevelReadiness[];
}

export interface MediaAsset {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
  /** Optional Media Library details (absent in responses from before they existed). Alt text and source are DEFAULTS offered when the image is chosen. */
  title?: string | null;
  altText?: string | null;
  /** Default caption; offered only into an empty caption field of a content block that has one. */
  caption?: string | null;
  source?: string | null;
  /** Internal note for staff; never shown to learners and not proof of permission. */
  rightsNotes?: string | null;
  tags?: string[];
  /** Send back as `version` when changing the details (stale = refused). */
  version?: number;
}

export interface QuizOption {
  id: string;
  text: string;
  correct: boolean;
  /** Optional feedback for this option, shown to learners after they check their answer. null or absent = none. */
  feedback?: string | null;
}

/** A question's optional Scripture reference: the shared structured reference (one chapter, an explicit verse range), never Bible text. */
export interface QuizScriptureEntry {
  reference: { bookId: string; chapter: number; startVerse: number; endVerse: number };
}

export interface QuizQuestion {
  id: string;
  type: string;
  prompt: string;
  explanation: string | null;
  /** Levels the question is shown at; null or absent = every level (the default of questions created before this setting existed). */
  levels?: string[] | null;
  /** Optional Scripture reference(s) of the question (at most 3), shown with the feedback after the answer is checked. null or absent = none. */
  scripture?: QuizScriptureEntry[] | null;
  options: QuizOption[];
}

export interface AdminQuiz {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  questions: QuizQuestion[];
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface AccountItem {
  id: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AccountEvent {
  id: string;
  seq: number;
  subjectAdminId: string;
  actorAdminId: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

export interface ConsistencyIssue {
  code: string;
  lessonId: string;
  publicationId: string | null;
  level?: string;
}

export interface ConsistencyReport {
  consistent: boolean;
  limitPerCheck: number;
  snapshotsVerified: boolean;
  truncated: boolean;
  issues: ConsistencyIssue[];
}
