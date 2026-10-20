import type { ContentStatus } from '../../../shared-kernel/index.js';

/**
 * Editorial workflow of a lesson's working copy. Publishing owns these rules; the
 * lessons module only stores the status. ARCHIVED is deliberately not part of the
 * workflow yet.
 *
 *   DRAFT -> READY_FOR_REVIEW -> APPROVED -> PUBLISHED
 *
 * That is the review path of EDITOR and REVIEWER. An ADMIN may also publish directly from DRAFT,
 * READY_FOR_REVIEW or APPROVED (project decision: see docs/workflow-change-direct-admin-publishing.md); the
 * event then records the status it really left, and no review step is invented.
 *
 * Editing content (done in the lessons module) always returns the working copy to
 * DRAFT; that is not a workflow action and is not handled here.
 */
export const WORKFLOW_ACTIONS = [
  'SUBMIT_FOR_REVIEW',
  'REQUEST_CHANGES',
  'APPROVE',
  'PUBLISH',
  'UNPUBLISH',
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export function isWorkflowAction(value: unknown): value is WorkflowAction {
  return WORKFLOW_ACTIONS.includes(value as WorkflowAction);
}

export type TransitionPlan =
  | { allowed: true; from: ContentStatus; to: ContentStatus }
  | {
      allowed: false;
      reason: 'WRONG_STATUS' | 'NOT_PUBLISHED';
      /** The statuses from which the action would be allowed (empty when it depends on something else). */
      allowedFrom: ContentStatus[];
    };

/** Where a direct (ADMIN) publish may start. */
const DIRECT_PUBLISH_FROM: ContentStatus[] = ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED'];

/** Actions that move the status between two fixed states. */
const FIXED_TRANSITIONS: Record<
  Exclude<WorkflowAction, 'UNPUBLISH'>,
  { from: ContentStatus; to: ContentStatus }
> = {
  SUBMIT_FOR_REVIEW: { from: 'DRAFT', to: 'READY_FOR_REVIEW' },
  REQUEST_CHANGES: { from: 'READY_FOR_REVIEW', to: 'DRAFT' },
  APPROVE: { from: 'READY_FOR_REVIEW', to: 'APPROVED' },
  PUBLISH: { from: 'APPROVED', to: 'PUBLISHED' },
};

/**
 * Decides what an action does to a lesson in its current state.
 *
 * UNPUBLISH depends on whether a publication is active, not only on the status.
 * It ends the active publication and changes the working copy's status only in one
 * case: a PUBLISHED lesson becomes APPROVED. A working copy that was edited after
 * publishing (DRAFT, READY_FOR_REVIEW or APPROVED) keeps its status, because
 * unpublishing is about what learners see, not about the review state of the edits.
 */
export function planTransition(
  action: WorkflowAction,
  status: ContentStatus,
  hasActivePublication: boolean,
  /** The actor may publish without review (ADMIN). Only PUBLISH is affected. */
  directPublish = false,
): TransitionPlan {
  if (action === 'UNPUBLISH') {
    if (!hasActivePublication) {
      return { allowed: false, reason: 'NOT_PUBLISHED', allowedFrom: [] };
    }
    return {
      allowed: true,
      from: status,
      to: status === 'PUBLISHED' ? 'APPROVED' : status,
    };
  }

  if (action === 'PUBLISH' && directPublish) {
    // A PUBLISHED working copy has nothing new to publish: editing returns it to DRAFT first.
    if (status === 'PUBLISHED') {
      return { allowed: false, reason: 'WRONG_STATUS', allowedFrom: DIRECT_PUBLISH_FROM };
    }
    return { allowed: true, from: status, to: 'PUBLISHED' };
  }

  const rule = FIXED_TRANSITIONS[action];
  if (status !== rule.from) {
    return { allowed: false, reason: 'WRONG_STATUS', allowedFrom: [rule.from] };
  }
  return { allowed: true, from: rule.from, to: rule.to };
}

/** The note policy: requesting changes must say what needs to change. */
export function requiresNote(action: WorkflowAction): boolean {
  return action === 'REQUEST_CHANGES';
}
