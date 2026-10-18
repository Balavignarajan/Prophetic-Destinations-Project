/**
 * Request bodies for the review/publish workflow, built to the BACKEND's contract (the backend validates with
 * `forbidNonWhitelisted`, so any other property is rejected with 400 VALIDATION_FAILED):
 *
 *  - lesson transitions    `TransitionDto`:        { note?, expectedContentRevision? }
 *                          `RequestChangesDto`:    { note (required), expectedContentRevision? }
 *  - course/module         `CatalogTransitionDto`: { note?, expectedVersion? }
 *                          `CatalogRequestChangesDto`: { note (required), expectedVersion? }
 *
 * `expectedContentRevision` / `expectedVersion` are optional stale-edit guards: if the content moved since the screen was
 * loaded the backend answers 409 instead of acting on something the editor has not seen. A lesson's guard is the
 * `contentRevision` of its workflow state (NOT `lesson.version`, which counts a different thing); a course's or module's is the
 * `version` of its workflow state. This file must not import anything at runtime so it can be unit-tested with plain Node.
 */
export type WorkflowAction = 'SUBMIT_FOR_REVIEW' | 'REQUEST_CHANGES' | 'APPROVE' | 'PUBLISH' | 'UNPUBLISH';

export const WORKFLOW_ENDPOINT: Record<WorkflowAction, string> = {
  SUBMIT_FOR_REVIEW: 'submit',
  REQUEST_CHANGES: 'request-changes',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
};

export type LessonTransitionBody = { note?: string; expectedContentRevision?: number };
export type CatalogTransitionBody = { note?: string; expectedVersion?: number };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** Body for POST /admin/lessons/:lessonId/workflow/<action>. */
export function lessonTransitionBody(
  action: WorkflowAction,
  state: { contentRevision?: number } | null | undefined,
  note?: string,
): LessonTransitionBody {
  const body: LessonTransitionBody = {};
  if (action === 'REQUEST_CHANGES') body.note = (note ?? '').trim();
  if (isCount(state?.contentRevision)) body.expectedContentRevision = state.contentRevision;
  return body;
}

/** Body for POST /admin/courses/:courseId/workflow/<action> and .../modules/:moduleId/workflow/<action>. */
export function catalogTransitionBody(
  action: WorkflowAction,
  state: { version?: number } | null | undefined,
  note?: string,
): CatalogTransitionBody {
  const body: CatalogTransitionBody = {};
  if (action === 'REQUEST_CHANGES') body.note = (note ?? '').trim();
  if (isCount(state?.version)) body.expectedVersion = state.version;
  return body;
}
