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
  moduleCount: number;
  lessonCount: number;
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
  moduleCount: number;
  lessonCount: number;
  modules: CatalogModule[];
}

/** GET /lessons/:lessonId/navigation?level= */
export interface NavigationLesson {
  lessonId: string;
  moduleId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
}
export interface NavigationResponse {
  lessonId: string;
  level: LearningLevel;
  courseId: string;
  moduleId: string;
  catalogVersion: number;
  previous: NavigationLesson | null;
  next: NavigationLesson | null;
}

/** GET /lessons/:lessonId?level= — the envelope; `snapshot` is the immutable published payload of that level. */
export interface LessonSnapshotBlock {
  blockId: string;
  /** `RICH_TEXT` and `IMAGE` are enabled by the backend today. */
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
    moduleId: string;
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
