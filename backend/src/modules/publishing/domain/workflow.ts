import type { ContentStatus } from '../../../shared-kernel/index.js';

/**
 * Editorial workflow of a lesson's working copy. Publishing owns these rules; the
 * lessons module only stores the status. ARCHIVED is deliberately not part of the
 * workflow yet.
 *
 *   DRAFT -> READY_FOR_REVIEW -> APPROVED -> PUBLISHED
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
 * UNPUBLISH depends on whether a publication is active, not only on the status:
 * a PUBLISHED lesson becomes APPROVED, and a lesson whose working copy was edited
 * after publishing and is still DRAFT stays DRAFT while its active publication
 * ends. What UNPUBLISH should do when the edited working copy is already
 * READY_FOR_REVIEW or APPROVED is deliberately NOT decided yet (to be settled when
 * the complete 3F-c workflow is reviewed), so it is refused for now.
 */
export function planTransition(
  action: WorkflowAction,
  status: ContentStatus,
  hasActivePublication: boolean,
): TransitionPlan {
  if (action === 'UNPUBLISH') {
    if (!hasActivePublication) {
      return { allowed: false, reason: 'NOT_PUBLISHED', allowedFrom: [] };
    }
    if (status === 'PUBLISHED') {
      return { allowed: true, from: 'PUBLISHED', to: 'APPROVED' };
    }
    if (status === 'DRAFT') {
      return { allowed: true, from: 'DRAFT', to: 'DRAFT' };
    }
    // READY_FOR_REVIEW / APPROVED with an active publication: undecided, so not allowed yet.
    return {
      allowed: false,
      reason: 'WRONG_STATUS',
      allowedFrom: ['PUBLISHED', 'DRAFT'],
    };
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
