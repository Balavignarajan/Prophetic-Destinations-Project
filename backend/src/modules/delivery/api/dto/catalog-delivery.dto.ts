import type { LearningLevel } from '../../../../shared-kernel/index.js';

/** A lesson as listed in a course. `previousLessonId` / `nextLessonId` are the nearest eligible lessons, or null. */
export class CatalogLessonDto {
  lessonId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
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
  moduleCount: number;
  lessonCount: number;
  modules: CatalogModuleDto[];
}

export class CourseListItemDto {
  courseId: string;
  catalogVersion: number;
  title: string;
  description: string | null;
  moduleCount: number;
  lessonCount: number;
}

/** Response of `GET /api/v1/courses?level=`. */
export class CourseListResponseDto {
  level: LearningLevel;
  courses: CourseListItemDto[];
}

export class NavigationLessonDto {
  lessonId: string;
  moduleId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
}

/** Response of `GET /api/v1/lessons/:lessonId/navigation?level=`. */
export class NavigationResponseDto {
  lessonId: string;
  level: LearningLevel;
  courseId: string;
  moduleId: string;
  catalogVersion: number;
  previous: NavigationLessonDto | null;
  next: NavigationLessonDto | null;
}
