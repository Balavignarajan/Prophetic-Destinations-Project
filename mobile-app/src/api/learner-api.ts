import type { LearningLevel } from '@/learning/levels';

import { apiGet } from './client';
import { ResponseShapeError } from './errors';
import type {
  CourseListResponse,
  CourseResponse,
  LessonResponse,
  NavigationResponse,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Shape checks for the public responses. Used on every network response AND on every cache read, so a malformed or outdated
 * entry is treated exactly like a malformed answer: it is never shown and never stored.
 */
export const isCourseListResponse = (body: unknown): body is CourseListResponse =>
  isRecord(body) && Array.isArray(body.courses);

export const isCourseResponse = (body: unknown): body is CourseResponse =>
  isRecord(body) && Array.isArray(body.modules) && typeof body.title === 'string';

export const isLessonResponse = (body: unknown): body is LessonResponse => {
  const snapshot = isRecord(body) ? body.snapshot : null;
  return (
    isRecord(snapshot) &&
    isRecord(snapshot.lesson) &&
    typeof snapshot.lesson.title === 'string' &&
    Array.isArray(snapshot.blocks)
  );
};

export const isNavigationResponse = (body: unknown): body is NavigationResponse =>
  isRecord(body) && typeof body.courseId === 'string';

/** GET /courses?level= — the published courses that have something to show at this level. */
export async function listCourses(level: LearningLevel, signal?: AbortSignal): Promise<CourseListResponse> {
  const body = await apiGet<unknown>('/courses', { level }, signal);
  if (!isCourseListResponse(body)) throw new ResponseShapeError('the course list');
  return body;
}

/** GET /courses/:courseId?level= — 404 (ApiError.isNotFound) if it is not published or has nothing at this level. */
export async function getCourse(courseId: string, level: LearningLevel, signal?: AbortSignal): Promise<CourseResponse> {
  const body = await apiGet<unknown>(`/courses/${encodeURIComponent(courseId)}`, { level }, signal);
  if (!isCourseResponse(body)) throw new ResponseShapeError('the course');
  return body;
}

/** GET /lessons/:lessonId?level= — the published snapshot. 404 if it is not currently deliverable at this level. */
export async function getLesson(lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<LessonResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}`, { level }, signal);
  if (!isLessonResponse(body)) throw new ResponseShapeError('the lesson');
  return body;
}

/** GET /lessons/:lessonId/navigation?level= — the neighbouring lessons of the same course, or null at an end. */
export async function getNavigation(lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<NavigationResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}/navigation`, { level }, signal);
  if (!isNavigationResponse(body)) throw new ResponseShapeError('the lesson navigation');
  return body;
}
