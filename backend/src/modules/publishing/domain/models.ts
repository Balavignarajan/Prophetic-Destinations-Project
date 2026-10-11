import type {
  ContentStatus,
  LearningLevel,
} from '../../../shared-kernel/index.js';
import type { Role } from '../../identity/index.js';
import type {
  CatalogLevelContent,
  PublishedModuleEntry,
} from './catalog-snapshot.js';
import type { WorkflowAction } from './workflow.js';

/** One recorded workflow transition of a lesson. History is append-only. */
export interface WorkflowEvent {
  id: string;
  /** Strictly increasing in the order events were recorded. */
  seq: number;
  lessonId: string;
  action: WorkflowAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  /** The actor's role at the time of the action. */
  actorRole: Role;
  note: string | null;
  /** The lesson's content revision when the transition happened (the revision that was reviewed). */
  contentRevision: number;
  /** The publication a PUBLISH created or an UNPUBLISH ended; null for review actions. */
  publicationId: string | null;
  createdAt: Date;
}

export type PublicationEndReason = 'SUPERSEDED' | 'UNPUBLISHED';

/** What is recorded about one level's snapshot (the content itself is read separately). */
export interface PublicationLevelSummary {
  level: LearningLevel;
  /** sha256 (hex) of the canonical serialization of the snapshot. */
  contentHash: string;
  /** Size of that serialization in UTF-8 bytes. */
  contentBytes: number;
}

/** One published version of a lesson. Active while `endedAt` is null. History is retained indefinitely. */
export interface Publication {
  id: string;
  lessonId: string;
  /** Per-lesson, starting at 1, never reused. */
  version: number;
  moduleId: string;
  /** The lesson's content revision that was published. */
  sourceContentRevision: number;
  snapshotSchemaVersion: number;
  publishedAt: Date;
  publishedBy: string;
  endedAt: Date | null;
  endedBy: string | null;
  endedReason: PublicationEndReason | null;
  levels: PublicationLevelSummary[];
}

/** The stored, self-contained snapshot of one level of one publication. */
export interface LevelSnapshot extends PublicationLevelSummary {
  publicationId: string;
  lessonId: string;
  version: number;
  content: Record<string, unknown>;
}

/**
 * What identifies the snapshot a learner would get right now for one level of one lesson:
 * the lesson's active publication and that level's stored snapshot hash. No content.
 */
export interface ActiveSnapshotInfo {
  lessonId: string;
  level: LearningLevel;
  publicationId: string;
  publicationVersion: number;
  /** sha256 (hex) of the stored snapshot's canonical serialization. */
  contentHash: string;
}

// ---- catalog (course/module) publishing ----

/** What created a catalog version. */
export type CatalogCause =
  'COURSE_PUBLISH' | 'MODULE_PUBLISH' | 'MODULE_UNPUBLISH';

/**
 * One immutable catalog version of a course. Active while `endedAt` is null. History is retained
 * indefinitely. `modules` are the modules this version lists, with their published title/description.
 */
export interface CatalogPublication {
  id: string;
  courseId: string;
  /** Per course, starting at 1, never reused. */
  version: number;
  cause: CatalogCause;
  snapshotSchemaVersion: number;
  courseTitle: string;
  courseDescription: string | null;
  /** courses.version when this version was created (audit). */
  sourceCourseVersion: number;
  publishedAt: Date;
  publishedBy: string;
  endedAt: Date | null;
  endedBy: string | null;
  endedReason: PublicationEndReason | null;
  modules: PublishedModuleEntry[];
  levels: PublicationLevelSummary[];
}

/** The stored catalog snapshot of one level of one catalog version. */
export interface CatalogLevelSnapshot extends PublicationLevelSummary {
  publicationId: string;
  courseId: string;
  version: number;
  content: CatalogLevelContent;
}

/** One recorded transition of a course or (when `moduleId` is set) of one of its modules. Append-only. */
export interface CatalogWorkflowEvent {
  id: string;
  seq: number;
  courseId: string;
  moduleId: string | null;
  action: WorkflowAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  actorRole: Role;
  note: string | null;
  /** The course's / module's own version at the time. */
  subjectVersion: number;
  /** The catalog version this action created (publish; module actions) or ended (course unpublish). */
  publicationId: string | null;
  createdAt: Date;
}
