import type { LearningLevel } from '@/learning/levels';

import { apiGet } from './client';
import { ResponseShapeError } from './errors';
import type {
  CourseListResponse,
  CourseResponse,
  LessonResponse,
  NavigationResponse,
  ExploreResponse,
  RelatedResponse,
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
  isRecord(body) && Array.isArray(body.modules) && (body.directLessons === undefined || Array.isArray(body.directLessons)) && typeof body.title === 'string';

export const isLessonResponse = (body: unknown): body is LessonResponse => {
  const snapshot = isRecord(body) ? body.snapshot : null;
  return (
    isRecord(snapshot) &&
    isRecord(snapshot.lesson) &&
    typeof snapshot.lesson.title === 'string' &&
    Array.isArray(snapshot.blocks)
  );
};

/**
 * The published version a lesson response names: its publication number and the hash of its content (the backend's own identity of a published lesson; republishing
 * identical content still gives a new publication number). Null when either is missing, which a real answer never is: such a response cannot be compared with a saved one.
 */
export const lessonVersion = (body: LessonResponse): string | null =>
  Number.isInteger(body.publicationVersion) && body.publicationVersion >= 1 && typeof body.contentHash === 'string' && body.contentHash.length > 0
    ? `${body.publicationVersion}:${body.contentHash}`
    : null;

/**
 * A lesson answer is only used (and only ever saved over a saved copy) when it is complete and is the lesson and level that were asked for. An answer without its
 * published version, or for another lesson or level, is treated like any other unusable answer: the saved copy, if there is one, stays the one that is shown and kept.
 */
export const isRequestedLesson = (body: LessonResponse, lessonId: string, level: LearningLevel): boolean =>
  typeof body.lessonId === 'string' && body.lessonId.toLowerCase() === lessonId.toLowerCase() && body.level === level && lessonVersion(body) !== null;

export const isNavigationResponse = (body: unknown): body is NavigationResponse =>
  isRecord(body) && typeof body.courseId === 'string';

// Requires the source publication identity: a saved list from before it existed fails this check, is discarded, and is never shown.
export const isRelatedResponse = (body: unknown): body is RelatedResponse =>
  isRecord(body) &&
  typeof body.contentHash === 'string' &&
  typeof body.publicationVersion === 'number' &&
  Array.isArray(body.lessons) &&
  body.lessons.every((item) => isRecord(item) && typeof item.lessonId === 'string' && typeof item.title === 'string');

// Same shape as the related list plus the block it belongs to; a saved list without the source publication identity is discarded.
export const isExploreResponse = (body: unknown): body is ExploreResponse => isRelatedResponse(body) && typeof (body as unknown as { blockId?: unknown }).blockId === 'string';

/** GET /lessons/:lessonId/explore/:blockId?level= — the targets of one Continue Exploring block that can be opened now (possibly none). */
export async function getExploring(lessonId: string, blockId: string, level: LearningLevel, signal?: AbortSignal): Promise<ExploreResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}/explore/${encodeURIComponent(blockId)}`, { level }, signal);
  if (!isExploreResponse(body)) throw new ResponseShapeError('the links');
  return body;
}

/** GET /lessons/:lessonId/related?level= — related lessons that can be opened now (possibly none). */
export async function getRelated(lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<RelatedResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}/related`, { level }, signal);
  if (!isRelatedResponse(body)) throw new ResponseShapeError('the related lessons');
  return body;
}

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
  if (!isLessonResponse(body) || !isRequestedLesson(body, lessonId, level)) throw new ResponseShapeError('the lesson');
  return body;
}

/** GET /lessons/:lessonId/navigation?level= — the neighbouring lessons of the same course, or null at an end. */
export async function getNavigation(lessonId: string, level: LearningLevel, signal?: AbortSignal): Promise<NavigationResponse> {
  const body = await apiGet<unknown>(`/lessons/${encodeURIComponent(lessonId)}/navigation`, { level }, signal);
  if (!isNavigationResponse(body)) throw new ResponseShapeError('the lesson navigation');
  return body;
}
