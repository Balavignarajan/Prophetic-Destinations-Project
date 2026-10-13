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

/** GET /courses?level= — the published courses that have something to show at this level. */
export async function listCourses(level: LearningLevel, signal?: AbortSignal): Promise<CourseListResponse> {
  const body = await apiGet<unknown>('/courses', { level }, signal);
  if (!isRecord(body) || !Array.isArray(body.courses)) throw new ResponseShapeError('the course list');
  return body as unknown as CourseListResponse;
}

/** GET /courses/:courseId?level= — 404 (ApiError.isNotFound) if it is not published or has nothing at this level. */
export async function getCourse(courseId: string, level: LearningLevel, signal?: AbortSignal): Promise<CourseResponse> {
  const body = await apiGet<unknown>(`/courses/${encodeURIComponent(courseId)}`, { level }, signal);
  if (!isRecord(body) || !Array.isArray(body.modules) || typeof body.title !== 'string') {
    throw new ResponseShapeError('the course');
  }
  return body as unknown as CourseResponse;
}

/** GET /lessons/:lessonId?level= — the published snapshot. 404 if it is not currently deliverable at this level. */
export async function getLesson(lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<LessonResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}`, { level }, signal);
  const snapshot = isRecord(body) ? body.snapshot : null;
  if (
    !isRecord(snapshot) ||
    !isRecord(snapshot.lesson) ||
    typeof snapshot.lesson.title !== 'string' ||
    !Array.isArray(snapshot.blocks)
  ) {
    throw new ResponseShapeError('the lesson');
  }
  return body as unknown as LessonResponse;
}

/** GET /lessons/:lessonId/navigation?level= — the neighbouring lessons of the same course, or null at an end. */
export async function getNavigation(lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<NavigationResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}/navigation`, { level }, signal);
  if (!isRecord(body) || typeof body.courseId !== 'string') throw new ResponseShapeError('the lesson navigation');
  return body as unknown as NavigationResponse;
}
