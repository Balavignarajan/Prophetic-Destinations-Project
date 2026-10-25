import {
  getCourse,
  getHomeEntryCourses,
  getLesson,
  getNavigation,
  getExploring,
  getRelated,
  isCourseListResponse,
  isCourseResponse,
  isHomeEntryCoursesResponse,
  isHomeEntryListResponse,
  isLessonResponse,
  isNavigationResponse,
  isExploreResponse,
  isRelatedResponse,
  lessonVersion,
  listCourses,
  listHomeEntries,
} from '@/api/learner-api';
import type { CourseListResponse, CourseResponse, ExploreResponse, HomeEntryCoursesResponse, HomeEntryListResponse, LessonResponse, NavigationResponse, RelatedResponse } from '@/api/types';
import type { LearningLevel } from '@/learning/levels';

import { type Loaded, loadCached } from './cached-load';

/**
 * The learner API with the offline fallback applied. These are what the screens call; the plain functions in
 * src/api/learner-api.ts remain the raw network calls.
 */
export const loadCourseList = (level: LearningLevel, signal?: AbortSignal): Promise<Loaded<CourseListResponse>> =>
  loadCached({ kind: 'catalog', id: 'all', level, fetch: () => listCourses(level, signal), validate: isCourseListResponse, signal });

/**
 * The Home topics at this level, with the same saved-copy rules as the course list (kind 'home', its images saved with it): a live answer replaces the saved list, INCLUDING an empty
 * one (the administrators really did leave this level with no topics); a failed request, a timeout, a 5xx or an unusable answer never replaces or deletes a good saved list, so a bad
 * connection can never turn the Home into "no topics"; with no saved list the error is reported as it is.
 */
export const loadHomeEntries = (level: LearningLevel, signal?: AbortSignal): Promise<Loaded<HomeEntryListResponse>> =>
  loadCached({ kind: 'home', id: 'all', level, fetch: () => listHomeEntries(level, signal), validate: isHomeEntryListResponse, signal });

/**
 * The published courses in one Home topic at this level (kind 'topic', keyed by the entry's id and the level, covers saved with it). A 404 from the backend (the topic was deleted or
 * disabled, or has no published course at this level any more) deletes the saved list and is shown as "not available", never as a stale list; a network failure or a 5xx falls back
 * to the saved list and never overwrites it. Opening a course from it follows the course's own offline rules.
 */
export const loadHomeEntryCourses = (entryId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<HomeEntryCoursesResponse>> =>
  loadCached({ kind: 'topic', id: entryId, level, fetch: () => getHomeEntryCourses(entryId, level, signal), validate: isHomeEntryCoursesResponse, signal });

export const loadCourse = (courseId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<CourseResponse>> =>
  loadCached({ kind: 'course', id: courseId, level, fetch: () => getCourse(courseId, level, signal), validate: isCourseResponse, signal });

export const loadLesson = (lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<Loaded<LessonResponse>> =>
  loadCached({ kind: 'lesson', id: lessonId, level, fetch: () => getLesson(lessonId, level, signal), validate: isLessonResponse, version: lessonVersion, signal });

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
