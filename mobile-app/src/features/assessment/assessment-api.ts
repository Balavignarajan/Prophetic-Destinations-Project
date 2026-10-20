import { apiGet, apiPost } from '@/api/client';
import { ApiError, ResponseShapeError } from '@/api/errors';
import { LEARNING_LEVELS, isLearningLevel } from '@/learning/levels';

import type { PublicAssessment, PublicOption, PublicQuestion, SubmissionResult, SubmittedAnswer } from './assessment-types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

const isOption = (value: unknown): value is PublicOption => isRecord(value) && typeof value.id === 'string' && isInt(value.position) && typeof value.text === 'string';

const isQuestion = (value: unknown): value is PublicQuestion =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  isInt(value.position) &&
  value.type === 'SINGLE_CHOICE' &&
  typeof value.prompt === 'string' &&
  Array.isArray(value.options) &&
  value.options.length >= 1 &&
  value.options.every(isOption);

/**
 * Shape check of the active assessment. A question type this build does not know fails the whole check on purpose: showing part of an
 * assessment, or a question it cannot answer, would produce a wrong recommendation, so the app says an update is needed instead.
 */
export const isPublicAssessment = (body: unknown): body is PublicAssessment =>
  isRecord(body) &&
  typeof body.assessmentId === 'string' &&
  isInt(body.version) &&
  typeof body.title === 'string' &&
  (body.instructions === null || typeof body.instructions === 'string') &&
  typeof body.requireAllQuestions === 'boolean' &&
  Array.isArray(body.questions) &&
  body.questions.length >= 1 &&
  body.questions.every(isQuestion);

export const isSubmissionResult = (body: unknown): body is SubmissionResult => {
  if (!isRecord(body)) return false;
  const scores = body.scores;
  const active = body.activePublication;
  return (
    typeof body.assessmentId === 'string' &&
    isInt(body.version) &&
    isLearningLevel(body.recommendedLevel) &&
    isRecord(scores) &&
    LEARNING_LEVELS.every((level) => typeof scores[level] === 'number') &&
    Array.isArray(body.tiedLevels) &&
    body.tiedLevels.every(isLearningLevel) &&
    isInt(body.answered) &&
    isInt(body.total) &&
    (body.message === null || typeof body.message === 'string') &&
    typeof body.current === 'boolean' &&
    (active === null || (isRecord(active) && typeof active.assessmentId === 'string' && isInt(active.version)))
  );
};

/** The backend's own order is position order; sorting here makes the app correct even if that ever changes. Returns a new object. */
export function sortAssessment(assessment: PublicAssessment): PublicAssessment {
  return {
    ...assessment,
    questions: [...assessment.questions].sort((a, b) => a.position - b.position).map((q) => ({ ...q, options: [...q.options].sort((a, b) => a.position - b.position) })),
  };
}

/** GET /assessments/active — the published assessment, or `ApiError` 404 (`details.reason === 'ASSESSMENT_UNAVAILABLE'`) when none is published. */
export async function getActiveAssessment(signal?: AbortSignal): Promise<PublicAssessment> {
  const body = await apiGet<unknown>('/assessments/active', undefined, signal);
  if (!isPublicAssessment(body)) throw new ResponseShapeError('the assessment');
  return sortAssessment(body);
}

/**
 * POST /assessments/:assessmentId/submissions — the backend scores the answers against the exact published `version` and recommends a level. Nothing is
 * stored on the server. Never retried automatically.
 */
export async function submitAssessment(assessmentId: string, version: number, answers: SubmittedAnswer[], signal?: AbortSignal): Promise<SubmissionResult> {
  const body = await apiPost<unknown>(`/assessments/${encodeURIComponent(assessmentId)}/submissions`, { version, answers }, signal);
  if (!isSubmissionResult(body)) throw new ResponseShapeError('the result');
  return body;
}

/** No assessment is published (a normal state, not a failure): 404 with `details.reason` ASSESSMENT_UNAVAILABLE. */
export const isAssessmentUnavailable = (error: unknown): boolean => error instanceof ApiError && error.status === 404 && error.details?.reason === 'ASSESSMENT_UNAVAILABLE';

/** The version the answers were for is not known to the server (404 ASSESSMENT_VERSION_NOT_FOUND). */
export const isVersionNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404 && error.details?.reason === 'ASSESSMENT_VERSION_NOT_FOUND';

/** The backend refused the answers themselves (422): `details.code` is INVALID_ANSWER, DUPLICATE_ANSWER, NO_ANSWERS or MISSING_ANSWERS. */
export function answerProblemCode(error: unknown): 'INVALID_ANSWER' | 'DUPLICATE_ANSWER' | 'NO_ANSWERS' | 'MISSING_ANSWERS' | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const code = error.details?.code;
  return code === 'INVALID_ANSWER' || code === 'DUPLICATE_ANSWER' || code === 'NO_ANSWERS' || code === 'MISSING_ANSWERS' ? code : null;
}
