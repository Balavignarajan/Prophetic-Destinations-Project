import type { LearningLevel } from '@/learning/levels';

/**
 * Response models of the backend's PUBLIC learner API, written from its actual contracts
 * (backend/src/modules/delivery/api/dto and backend/src/modules/publishing/domain/snapshot-payload.ts).
 * Only fields the backend documents are modelled; nothing here is assumed.
 */

/** GET /courses?level= */
export interface CourseListItem {
  courseId: string;
  catalogVersion: number;
  title: string;
  description: string | null;
  /** Published cover image id. Optional: older cached responses (and courses without a cover) do not have it. */
  coverMediaId?: string | null;
  moduleCount: number;
  lessonCount: number;
  /** The ids of the lessons counted in `lessonCount`, in the published order. Optional: responses saved before it existed do not have it. */
  lessonIds?: string[];
}
export interface CourseListResponse {
  level: LearningLevel;
  courses: CourseListItem[];
}

/**
 * GET /home-entries?level= — the Home topics (Daniel, Bible History, ...) this learner can open at this level, in the administrators' order. The server has already left out every
 * entry that is disabled or has no course published with lessons at this level, so every item here has at least one course to list. Possibly empty.
 */
export interface HomeEntryItem {
  entryId: string;
  /** What the card says (set in the CMS). */
  title: string;
  description: string | null;
  sortOrder: number;
  /** The card's own picture, or null: then the cover of `coverCourseId` is used. */
  imageMediaId: string | null;
  /** How many courses can be opened in this entry at this level (at least 1), and the lessons in them. */
  courseCount: number;
  lessonCount: number;
  /** The published cover of the entry's first course that has one (the fallback picture), with that course's id; both null if none has. */
  coverCourseId: string | null;
  coverMediaId: string | null;
}
export interface HomeEntryListResponse {
  level: LearningLevel;
  entries: HomeEntryItem[];
}

/**
 * GET /home-entries/:entryId/courses?level= — the entry and the published courses that can be opened in it at this level, each exactly as in GET /courses?level= and in the
 * same order. Drafts never appear. 404 when the entry is unknown, disabled or has no course at this level.
 */
export interface HomeEntryCoursesResponse {
  level: LearningLevel;
  entry: HomeEntryItem;
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
