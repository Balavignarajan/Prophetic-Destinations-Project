import type { LearningLevel } from '../../../../shared-kernel/index.js';

/** A lesson as listed in a course. `previousLessonId` / `nextLessonId` are the nearest eligible lessons, or null. */
export class CatalogLessonDto {
  lessonId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
  /** Published cover image id, or null. Fetch it with GET /lessons/:lessonId/media/:coverMediaId?level=. */
  coverMediaId: string | null;
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export class CatalogModuleDto {
  moduleId: string;
  title: string;
  description: string | null;
  lessons: CatalogLessonDto[];
}

/**
 * Response of `GET /api/v1/courses/:courseId?level=`: the published course at one level with its modules and
 * their eligible lessons in order. Only eligible lessons and the modules that still have one are present.
 */
export class CourseResponseDto {
  courseId: string;
  level: LearningLevel;
  /** Which catalog version of the course this is (per course, starting at 1). */
  catalogVersion: number;
  title: string;
  description: string | null;
  /** Published cover image id, or null. Fetch it with GET /courses/:courseId/media/:coverMediaId?level=. */
  coverMediaId: string | null;
  /** LEGACY, FROZEN (kept only for mobile builds released before Home Entries; see GET /home-entries for the current Home): 'DANIEL' | 'REVELATION', or null. */
  book: string | null;
  moduleCount: number;
  lessonCount: number;
  modules: CatalogModuleDto[];
  directLessons: CatalogLessonDto[];
}

export class CourseListItemDto {
  courseId: string;
  catalogVersion: number;
  title: string;
  description: string | null;
  /** Published cover image id, or null. Fetch it with GET /courses/:courseId/media/:coverMediaId?level=. */
  coverMediaId: string | null;
  /** LEGACY, FROZEN (kept only for mobile builds released before Home Entries; see GET /home-entries for the current Home): 'DANIEL' | 'REVELATION', or null. */
  book: string | null;
  moduleCount: number;
  lessonCount: number;
  /** The ids of the lessons counted in `lessonCount` (published and deliverable at this level), so a client can tell which of its saved results are for lessons that are available now. */
  lessonIds: string[];
}

/** Response of `GET /api/v1/courses?level=`. */
export class CourseListResponseDto {
  level: LearningLevel;
  courses: CourseListItemDto[];
}

export class NavigationLessonDto {
  lessonId: string;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
}

export class RelatedLessonDto {
  lessonId: string;
  /** The author's custom link label, or null: then show `title`. Only ever present for a lesson the learner can open at this level. */
  label: string | null;
  courseId: string | null;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
  /** Published cover; fetch it with GET /lessons/:lessonId/media/:coverMediaId?level= using THIS related lesson's id. */
  coverMediaId: string | null;
}

/** Response of `GET /api/v1/lessons/:lessonId/related?level=`: only related lessons that are deliverable at this level, in the author's order. */
export class RelatedResponseDto {
  lessonId: string;
  level: LearningLevel;
  /** Which publication of the SOURCE lesson this list belongs to (same values as the lesson response). A client must only show the list with that exact lesson version. */
  publicationVersion: number;
  contentHash: string;
  lessons: RelatedLessonDto[];
}

/**
 * Response of `GET /api/v1/lessons/:lessonId/explore/:blockId?level=`: the targets of ONE Continue Exploring block that a learner can open at this level,
 * in the author's order. Separate from the lesson-metadata related list. Bound to the exact source publication like the related list.
 */
export class ExploreResponseDto {
  lessonId: string;
  blockId: string;
  level: LearningLevel;
  publicationVersion: number;
  contentHash: string;
  lessons: RelatedLessonDto[];
}

/** Response of `GET /api/v1/lessons/:lessonId/navigation?level=`. */
export class NavigationResponseDto {
  lessonId: string;
  level: LearningLevel;
  courseId: string;
  moduleId: string | null;
  catalogVersion: number;
  previous: NavigationLessonDto | null;
  next: NavigationLessonDto | null;
}
