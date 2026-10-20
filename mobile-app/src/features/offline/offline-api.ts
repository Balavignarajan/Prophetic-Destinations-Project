import {
  getCourse,
  getLesson,
  getNavigation,
  getExploring,
  getRelated,
  isCourseListResponse,
  isCourseResponse,
  isLessonResponse,
  isNavigationResponse,
  isExploreResponse,
  isRelatedResponse,
  listCourses,
} from '@/api/learner-api';
import type { CourseListResponse, CourseResponse, ExploreResponse, LessonResponse, NavigationResponse, RelatedResponse } from '@/api/types';
import type { LearningLevel } from '@/learning/levels';

import { type Loaded, loadCached } from './cached-load';

/**
 * The learner API with the offline fallback applied. These are what the screens call; the plain functions in
 * src/api/learner-api.ts remain the raw network calls.
 */
export const loadCourseList = (level: LearningLevel, signal?: AbortSignal): Promise<Loaded<CourseListResponse>> =>
  loadCached({ kind: 'catalog', id: 'all', level, fetch: () => listCourses(level, signal), validate: isCourseListResponse, signal });

export const loadCourse = (courseId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<CourseResponse>> =>
  loadCached({ kind: 'course', id: courseId, level, fetch: () => getCourse(courseId, level, signal), validate: isCourseResponse, signal });

export const loadLesson = (lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<LessonResponse>> =>
  loadCached({ kind: 'lesson', id: lessonId, level, fetch: () => getLesson(lessonId, level, signal), validate: isLessonResponse, signal });

export const loadNavigation = (lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<NavigationResponse>> =>
  loadCached({ kind: 'navigation', id: lessonId, level, fetch: () => getNavigation(lessonId, level, signal), validate: isNavigationResponse, signal });

/** Related lessons use the same saved-copy cache as lesson navigation (no separate cache). The list carries titles only, not the lessons themselves. */
/**
 * A Continue Exploring block's link list uses the same saved-copy cache as the related list (kind 'related': no separate cache, no saved images, cleared
 * and expired with the other copies). The entry is keyed by lesson AND block, `<lessonId>~<blockId>`, so two blocks (or the metadata list) never share one.
 */
export const loadExploring = (lessonId: string, blockId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<ExploreResponse>> =>
  loadCached({ kind: 'related', id: `${lessonId}~${blockId}`, level, fetch: () => getExploring(lessonId, blockId, level, signal), validate: isExploreResponse, signal });

export const loadRelated = (lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<RelatedResponse>> =>
  loadCached({ kind: 'related', id: lessonId, level, fetch: () => getRelated(lessonId, level, signal), validate: isRelatedResponse, signal });
