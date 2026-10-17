import {
  getCourse,
  getLesson,
  getNavigation,
  isCourseListResponse,
  isCourseResponse,
  isLessonResponse,
  isNavigationResponse,
  listCourses,
} from '@/api/learner-api';
import type { CourseListResponse, CourseResponse, LessonResponse, NavigationResponse } from '@/api/types';
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
