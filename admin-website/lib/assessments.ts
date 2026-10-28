import { api } from './api';
import type { ApiErrorPayload } from './types';

/**
 * Typed access to the Phase 1 assessment backend (`/admin/assessments`, see backend/docs/assessments.md; the DTOs and rules in
 * backend/src/modules/assessments are the source of truth) and the pure helpers of the editor. Every page uses these functions, so request logic exists once.
 * The limits below are copied from backend/src/modules/assessments/domain/assessment-rules.ts (ASSESSMENT_LIMITS); the server remains the final judge.
 */
export type AssessmentStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export const LEVELS: readonly Level[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
export const LEVEL_LABEL: Record<Level, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

export const LIMITS = {
  titleMax: 200,
  descriptionMax: 2000,
  questionsMax: 50,
  promptMax: 1000,
  optionsMin: 2,
  optionsMax: 6,
  optionTextMax: 300,
  pointsMax: 100,
  resultMessageMax: 500,
} as const;

export type TieBreak = 'LOWER_LEVEL' | 'HIGHER_LEVEL';
export type LevelPoints = Record<Level, number>;

export interface ScoringConfig {
  strategy: 'LEVEL_POINTS';
  tieBreak: TieBreak;
  requireAllQuestions: boolean;
  resultMessages?: Partial<Record<Level, string>>;
}

export type AssessmentAction = 'SUBMIT_FOR_REVIEW' | 'REQUEST_CHANGES' | 'APPROVE' | 'PUBLISH' | 'UNPUBLISH';

export interface AssessmentSummary {
  id: string;
  title: string;
  status: AssessmentStatus;
  /** Edit version of the working copy (the concurrency token). */
  version: number;
  questionCount: number;
  scoringConfigured: boolean;
  activePublishedVersion: number | null;
  latestPublishedVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Publication {
  id: string;
  assessmentId: string;
  version: number;
  contentHash: string;
  publishedBy: string;
  publishedAt: string;
  active: boolean;
  endedAt: string | null;
  endedReason: 'SUPERSEDED' | 'UNPUBLISHED' | null;
}

export interface AssessmentDetail {
  id: string;
  title: string;
  description: string | null;
  status: AssessmentStatus;
  version: number;
  scoringConfig: ScoringConfig | null;
  questions: { id: string; position: number; type: 'SINGLE_CHOICE'; prompt: string; options: { id: string; position: number; text: string; scores: LevelPoints }[] }[];
  activePublication: Publication | null;
  latestPublishedVersion: number | null;
  allowedActions: AssessmentAction[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEvent {
  id: string;
  action: AssessmentAction;
  fromStatus: AssessmentStatus;
  toStatus: AssessmentStatus;
  actorAdminId: string;
  actorRole: string;
  note: string | null;
  assessmentVersion: number;
  publicationId: string | null;
  createdAt: string;
}

export interface Problem {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationReport {
  valid: boolean;
  problems: Problem[];
  warnings: Problem[];
}

export interface TransitionResponse {
  assessmentId: string;
  fromStatus: AssessmentStatus;
  status: AssessmentStatus;
  version: number;
  event: WorkflowEvent;
  publication: Publication | null;
  supersededPublication: Publication | null;
}

/** The body of POST / PUT (a save REPLACES the whole content). */
export interface SavePayload {
  title: string;
  description: string | null;
  /** Always sent explicitly: an object, or null only when the editor intentionally cleared the scoring configuration. */
  scoringConfig: ScoringConfig | null;
  questions: { id?: string; type: 'SINGLE_CHOICE'; prompt: string; options: { id?: string; text: string; scores: LevelPoints }[] }[];
  /** The working-copy version the editor saw (PUT only). */
  version?: number;
}

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const assessmentsApi = {
  list: (params: { limit?: number; offset?: number; status?: AssessmentStatus } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.status) q.set('status', params.status);
    return api.request<{ items: AssessmentSummary[]; total: number; limit: number; offset: number }>(`/admin/assessments${q.toString() ? `?${q.toString()}` : ''}`);
  },
  get: (id: string) => api.request<AssessmentDetail>(`/admin/assessments/${id}`),
  create: (body: SavePayload) => api.request<AssessmentDetail>('/admin/assessments', { method: 'POST', ...json(body) }),
  update: (id: string, body: SavePayload) => api.request<AssessmentDetail>(`/admin/assessments/${id}`, { method: 'PUT', ...json(body) }),
  /** Dedicated reorder endpoints (the editor itself saves order with the replace-all save; these are the same contract for callers that reorder alone). */
  reorderQuestions: (id: string, questionIds: string[], previousQuestionIds: string[], version?: number) =>
    api.request<AssessmentDetail>(`/admin/assessments/${id}/questions/order`, { method: 'PUT', ...json({ questionIds, previousQuestionIds, ...(version ? { version } : {}) }) }),
  reorderOptions: (id: string, questionId: string, optionIds: string[], previousOptionIds: string[], version?: number) =>
    api.request<AssessmentDetail>(`/admin/assessments/${id}/questions/${questionId}/options/order`, { method: 'PUT', ...json({ optionIds, previousOptionIds, ...(version ? { version } : {}) }) }),
  validate: (id: string) => api.request<ValidationReport>(`/admin/assessments/${id}/validation`),
  publications: (id: string) => api.request<{ items: Publication[] }>(`/admin/assessments/${id}/publications`),
  events: (id: string, limit = 50) => api.request<{ items: WorkflowEvent[]; total: number }>(`/admin/assessments/${id}/workflow/events?limit=${limit}`),
  /** `endpoint` names are the backend's: submit, request-changes, approve, publish, unpublish. */
  perform: (id: string, action: AssessmentAction, body: { note?: string; expectedVersion?: number }) =>
    api.request<TransitionResponse>(`/admin/assessments/${id}/workflow/${ACTION_ENDPOINT[action]}`, { method: 'POST', ...json(body) }),
};

export const ACTION_ENDPOINT: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'submit',
  REQUEST_CHANGES: 'request-changes',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
};

export const ACTION_LABEL: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'Submit for review',
  REQUEST_CHANGES: 'Request changes',
  APPROVE: 'Approve',
  PUBLISH: 'Publish',
  UNPUBLISH: 'Unpublish',
};

/** Who may do each action, in words. Copied from ACTION_ROLES in backend/src/modules/assessments/domain/assessment-workflow.ts; the server still decides and returns `allowedActions` for the signed-in role. */
export const ACTION_WHO: Record<AssessmentAction, string> = {
  SUBMIT_FOR_REVIEW: 'Admin or Editor',
  REQUEST_CHANGES: 'Reviewer or Admin',
  APPROVE: 'Reviewer or Admin',
  PUBLISH: 'Admin only',
  UNPUBLISH: 'Admin only',
};

export const STATUS_LABEL: Record<AssessmentStatus, string> = { DRAFT: 'Draft', READY_FOR_REVIEW: 'Ready for Review', APPROVED: 'Approved', PUBLISHED: 'Published' };

// ------------------------------------------------------------------------------------------------------------------------------------ errors

type ApiLikeError = { message?: string; status?: number; payload?: ApiErrorPayload };

/** The problems the backend listed in an error: save-time `details.problems[]`, or publish-time `details.report.problems[]`. Empty when there are none. */
export function problemsFromError(err: unknown): Problem[] {
  const details = (err as ApiLikeError)?.payload?.details as { problems?: unknown; report?: { problems?: unknown } } | undefined;
  const list = details?.problems ?? details?.report?.problems;
  return Array.isArray(list) ? (list as Problem[]).filter((p) => p && typeof p.message === 'string') : [];
}

export const isConflict = (err: unknown) => (err as ApiLikeError)?.status === 409;
export const isForbidden = (err: unknown) => (err as ApiLikeError)?.status === 403;
export const isNotFound = (err: unknown) => (err as ApiLikeError)?.status === 404;

/** A message for an API failure that keeps the server's own words (never a blanket "something went wrong" when the server said what is wrong). */
export function describeError(err: unknown, fallback: string): string {
  const e = err as ApiLikeError;
  if (e?.status === 403) return 'Your role is not allowed to do this.';
  if (e?.status === 404) return 'This assessment no longer exists. Return to the list.';
  if (e?.status === 409) return e.payload?.message ?? 'The assessment changed since you loaded it.';
  if (e?.status === undefined && e?.message) return `${e.message}. Check your connection and try again.`;
  return e?.payload?.message ?? e?.message ?? fallback;
}

// ------------------------------------------------------------------------------------------------------------------------------------ editor model

/** Editor state keeps points as text so an empty or half-typed cell is visible and never silently becomes a number. `key` is a stable React key. */
export interface EditorOption {
  key: string;
  id?: string;
  text: string;
  scores: Record<Level, string>;
}
export interface EditorQuestion {
  key: string;
  id?: string;
  prompt: string;
  options: EditorOption[];
}
export interface EditorScoring {
  enabled: boolean;
  /** '' = not chosen yet (no default is applied: that is a product decision). */
  tieBreak: TieBreak | '';
  requireAll: 'yes' | 'no' | '';
  messages: Record<Level, string>;
}
export interface EditorState {
  title: string;
  description: string;
  scoring: EditorScoring;
  questions: EditorQuestion[];
}

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const blankOption = (): EditorOption => ({ key: newKey(), text: '', scores: { BEGINNER: '', INTERMEDIATE: '', ADVANCED: '' } });
export const blankQuestion = (): EditorQuestion => ({ key: newKey(), prompt: '', options: [blankOption(), blankOption()] });

export const emptyEditor = (): EditorState => ({
  title: '',
  description: '',
  scoring: { enabled: false, tieBreak: '', requireAll: '', messages: { BEGINNER: '', INTERMEDIATE: '', ADVANCED: '' } },
  questions: [],
});

/** The saved assessment as editor state (ids kept so a save keeps them). */
export function toEditor(detail: AssessmentDetail): EditorState {
  const c = detail.scoringConfig;
  return {
    title: detail.title,
    description: detail.description ?? '',
    scoring: {
      enabled: c !== null,
      tieBreak: c?.tieBreak ?? '',
      requireAll: c ? (c.requireAllQuestions ? 'yes' : 'no') : '',
      messages: { BEGINNER: c?.resultMessages?.BEGINNER ?? '', INTERMEDIATE: c?.resultMessages?.INTERMEDIATE ?? '', ADVANCED: c?.resultMessages?.ADVANCED ?? '' },
    },
    questions: detail.questions.map((q) => ({
      key: q.id,
      id: q.id,
      prompt: q.prompt,
      options: q.options.map((o) => ({ key: o.id, id: o.id, text: o.text, scores: { BEGINNER: String(o.scores.BEGINNER), INTERMEDIATE: String(o.scores.INTERMEDIATE), ADVANCED: String(o.scores.ADVANCED) } })),
    })),
  };
}

const POINTS = /^\d{1,3}$/;

/** What is wrong with the editor state, by the same rules as the server (which still decides). `path` uses the server's paths so problems can be matched. */
export function checkEditor(state: EditorState): Problem[] {
  const out: Problem[] = [];
  const title = state.title.trim();
  if (!title) out.push({ code: 'TITLE_REQUIRED', message: 'The title is required', path: 'title' });
  if (title.length > LIMITS.titleMax) out.push({ code: 'TITLE_TOO_LONG', message: `The title can be at most ${LIMITS.titleMax} characters`, path: 'title' });
  if (state.description.trim().length > LIMITS.descriptionMax) out.push({ code: 'DESCRIPTION_TOO_LONG', message: `The instructions can be at most ${LIMITS.descriptionMax} characters`, path: 'description' });
  if (state.questions.length > LIMITS.questionsMax) out.push({ code: 'TOO_MANY_QUESTIONS', message: `At most ${LIMITS.questionsMax} questions`, path: 'questions' });
  if (state.scoring.enabled) {
    if (!state.scoring.tieBreak) out.push({ code: 'SCORING_TIE_BREAK_INVALID', message: 'Choose how ties are resolved', path: 'scoringConfig.tieBreak' });
    if (!state.scoring.requireAll) out.push({ code: 'SCORING_REQUIRE_ALL_INVALID', message: 'Choose whether every question must be answered', path: 'scoringConfig.requireAllQuestions' });
    for (const level of LEVELS) {
      if (state.scoring.messages[level].trim().length > LIMITS.resultMessageMax) out.push({ code: 'SCORING_MESSAGE_INVALID', message: `The ${LEVEL_LABEL[level]} message can be at most ${LIMITS.resultMessageMax} characters`, path: `scoringConfig.resultMessages.${level}` });
    }
  }
  state.questions.forEach((q, qi) => {
    const qp = `questions[${qi}]`;
    if (!q.prompt.trim()) out.push({ code: 'PROMPT_REQUIRED', message: `Question ${qi + 1}: the question text is required`, path: `${qp}.prompt` });
    if (q.prompt.trim().length > LIMITS.promptMax) out.push({ code: 'PROMPT_TOO_LONG', message: `Question ${qi + 1}: at most ${LIMITS.promptMax} characters`, path: `${qp}.prompt` });
    if (q.options.length > LIMITS.optionsMax) out.push({ code: 'TOO_MANY_OPTIONS', message: `Question ${qi + 1}: at most ${LIMITS.optionsMax} answers`, path: `${qp}.options` });
    q.options.forEach((o, oi) => {
      const op = `${qp}.options[${oi}]`;
      if (!o.text.trim()) out.push({ code: 'OPTION_TEXT_REQUIRED', message: `Question ${qi + 1}, answer ${oi + 1}: the answer text is required`, path: `${op}.text` });
      if (o.text.trim().length > LIMITS.optionTextMax) out.push({ code: 'OPTION_TEXT_TOO_LONG', message: `Question ${qi + 1}, answer ${oi + 1}: at most ${LIMITS.optionTextMax} characters`, path: `${op}.text` });
      for (const level of LEVELS) {
        const raw = o.scores[level].trim();
        if (!POINTS.test(raw) || Number(raw) > LIMITS.pointsMax) {
          out.push({ code: raw === '' ? 'SCORE_MISSING' : 'POINTS_INVALID', message: `Question ${qi + 1}, answer ${oi + 1}: ${LEVEL_LABEL[level]} points must be a whole number from 0 to ${LIMITS.pointsMax}`, path: `${op}.scores.${level}` });
        }
      }
    });
  });
  return out;
}

/** The save body. `scoringConfig` is ALWAYS present (an object, or null only if scoring is switched off in the editor). */
export function toPayload(state: EditorState, version?: number): SavePayload {
  const s = state.scoring;
  const messages: Partial<Record<Level, string>> = {};
  for (const level of LEVELS) if (s.messages[level].trim()) messages[level] = s.messages[level].trim();
  const scoringConfig: ScoringConfig | null = s.enabled
    ? { strategy: 'LEVEL_POINTS', tieBreak: s.tieBreak as TieBreak, requireAllQuestions: s.requireAll === 'yes', ...(Object.keys(messages).length > 0 ? { resultMessages: messages } : {}) }
    : null;
  return {
    title: state.title.trim(),
    description: state.description.trim() === '' ? null : state.description.trim(),
    scoringConfig,
    questions: state.questions.map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      type: 'SINGLE_CHOICE' as const,
      prompt: q.prompt.trim(),
      options: q.options.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        text: o.text.trim(),
        scores: { BEGINNER: Number(o.scores.BEGINNER), INTERMEDIATE: Number(o.scores.INTERMEDIATE), ADVANCED: Number(o.scores.ADVANCED) },
      })),
    })),
    ...(version !== undefined ? { version } : {}),
  };
}

/** Stable text of the editor state, to tell whether anything changed. */
export const editorSignature = (state: EditorState): string => JSON.stringify(toPayload(state, undefined)) + JSON.stringify(state.scoring) + JSON.stringify(state.questions.map((q) => q.options.map((o) => o.scores)));

/** Maps a server/client problem path to the id of the element that shows it, so a problem can be linked to its field. */
export function fieldIdForPath(path: string | undefined): string | null {
  if (!path) return null;
  if (path === 'title') return 'as-title';
  if (path === 'description') return 'as-description';
  // The Scoring tab names its fields, so a scoring problem leads to the field itself (the section is the fallback).
  if (path === 'scoringConfig.tieBreak') return 'as-tiebreak';
  if (path === 'scoringConfig.requireAllQuestions') return 'as-requireall-yes';
  if (path.startsWith('scoringConfig.resultMessages.')) return `as-msg-${path.slice('scoringConfig.resultMessages.'.length)}`;
  if (path.startsWith('scoringConfig')) return 'as-scoring';
  const q = path.match(/^questions\[(\d+)\](?:\.options\[(\d+)\])?(?:\.(\w+))?/);
  if (!q) return path === 'questions' ? 'as-questions' : null;
  const [, qi, oi, field] = q;
  if (oi !== undefined) return field === 'scores' ? `as-q${qi}-o${oi}-points` : `as-q${qi}-o${oi}-text`;
  return field === 'prompt' ? `as-q${qi}-prompt` : `as-q${qi}`;
}

export const formatWhen = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
