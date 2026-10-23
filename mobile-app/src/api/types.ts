import type { LearningLevel } from '@/learning/levels';

/**
 * Response models of the backend's PUBLIC learner API, written from its actual contracts
 * (backend/src/modules/delivery/api/dto and backend/src/modules/publishing/domain/snapshot-payload.ts).
 * Only fields the backend documents are modelled; nothing here is assumed.
 */

/** The Bible books that have a dedicated entry on Home (backend COURSE_BOOKS). */
export type CourseBook = 'DANIEL' | 'REVELATION';

/** GET /courses?level= */
export interface CourseListItem {
  courseId: string;
  catalogVersion: number;
  title: string;
  description: string | null;
  /** Published cover image id. Optional: older cached responses (and courses without a cover) do not have it. */
  coverMediaId?: string | null;
  /**
   * The course's CMS-managed Bible book: the course the Daniel / Revelation Home entry opens. null = an ordinary course. Optional: responses saved before it existed
   * do not have it (which is different from null, "no book").
   */
  book?: CourseBook | null;
  moduleCount: number;
  lessonCount: number;
  /** The ids of the lessons counted in `lessonCount`, in the published order. Optional: responses saved before it existed do not have it. */
  lessonIds?: string[];
}
export interface CourseListResponse {
  level: LearningLevel;
  courses: CourseListItem[];
}

/** GET /courses/:courseId?level= — only eligible lessons, and modules that still have one, in the published order. */
export interface CatalogLesson {
  lessonId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
  /** Published cover image id. Optional: older cached responses (and lessons without a cover) do not have it. */
  coverMediaId?: string | null;
  previousLessonId: string | null;
  nextLessonId: string | null;
}
export interface CatalogModule {
  moduleId: string;
  title: string;
  description: string | null;
  lessons: CatalogLesson[];
}
export interface CourseResponse {
  courseId: string;
  level: LearningLevel;
  catalogVersion: number;
  title: string;
  description: string | null;
  coverMediaId?: string | null;
  book?: CourseBook | null;
  moduleCount: number;
  lessonCount: number;
  modules: CatalogModule[];
  /** Optional-module compatibility: published lessons placed directly in a course. */
  directLessons?: CatalogLesson[];
}

/** GET /lessons/:lessonId/navigation?level= */
export interface NavigationLesson {
  lessonId: string;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
}
export interface NavigationResponse {
  lessonId: string;
  level: LearningLevel;
  courseId: string;
  moduleId: string | null;
  catalogVersion: number;
  previous: NavigationLesson | null;
  next: NavigationLesson | null;
}

/** GET /lessons/:lessonId/related?level= — only related lessons that are deliverable at this level right now, in the author's order. */
export interface RelatedLessonItem {
  lessonId: string;
  /** The author's custom link label. Absent in responses saved before labels existed, and null when there is none: then `title` is shown. */
  label?: string | null;
  courseId: string | null;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
  coverMediaId: string | null;
}
/** GET /lessons/:lessonId/explore/:blockId?level= — the targets of ONE Continue Exploring block that can be opened now (possibly none), bound to the source publication. */
export interface ExploreResponse {
  lessonId: string;
  blockId: string;
  level: LearningLevel;
  publicationVersion: number;
  contentHash: string;
  lessons: RelatedLessonItem[];
}
export interface RelatedResponse {
  lessonId: string;
  level: LearningLevel;
  /** The publication of the SOURCE lesson this list belongs to (same values as the lesson response). */
  publicationVersion: number;
  contentHash: string;
  lessons: RelatedLessonItem[];
}

/** GET /lessons/:lessonId?level= — the envelope; `snapshot` is the immutable published payload of that level. */
export interface LessonSnapshotBlock {
  blockId: string;
  /** `RICH_TEXT`, `IMAGE` and `SUMMARY` are enabled by the backend today. */
  type: string;
  ordinal: number;
  source: 'VARIANT' | 'SHARED';
  content: Record<string, unknown>;
}
export interface LessonSnapshot {
  schemaVersion: number;
  level: LearningLevel;
  lesson: {
    id: string;
    courseId?: string;
    moduleId: string | null;
    title: string;
    shortTitle: string | null;
    subtitle: string | null;
    /** Plain text; paragraphs are separated by a blank line. */
    introduction: string | null;
    estimatedMinutes: number | null;
    coverMediaId: string | null;
  };
  blocks: LessonSnapshotBlock[];
}
export interface LessonResponse {
  lessonId: string;
  level: LearningLevel;
  publicationVersion: number;
  contentHash: string;
  snapshot: LessonSnapshot;
}
