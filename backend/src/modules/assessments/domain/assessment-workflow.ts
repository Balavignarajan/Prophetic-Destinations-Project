import { BusinessRuleError, type ContentStatus } from '../../../shared-kernel/index.js';
import { Role } from '../../identity/index.js';

/**
 * The editorial workflow of an assessment, the same as for lessons, modules and courses:
 *
 *   DRAFT -> READY_FOR_REVIEW -> APPROVED -> PUBLISHED
 *
 * Editing the working copy always returns it to DRAFT (and never changes what learners get: that is the immutable publication). ARCHIVED is not part of
 * the workflow anywhere in the project, so there is no archive; withdrawing is UNPUBLISH. Roles are the project's: EDITOR submits, REVIEWER approves or
 * asks for changes, ADMIN does everything and alone publishes and unpublishes.
 *
 * An assessment can be published ONLY from APPROVED, for every role including ADMIN. The direct-publishing rule of docs/workflow-change-direct-admin-publishing.md
 * is documented for lessons, modules and courses only and is deliberately NOT extended to assessments: an ADMIN who wants to publish an assessment approves it first
 * (ADMIN may approve), so the audit trail always shows the approval.
 */
export const ASSESSMENT_ACTIONS = ['SUBMIT_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'UNPUBLISH'] as const;
export type AssessmentAction = (typeof ASSESSMENT_ACTIONS)[number];

export const ACTION_ROLES: Record<AssessmentAction, readonly Role[]> = {
  SUBMIT_FOR_REVIEW: [Role.ADMIN, Role.EDITOR],
  REQUEST_CHANGES: [Role.ADMIN, Role.REVIEWER],
  APPROVE: [Role.ADMIN, Role.REVIEWER],
  PUBLISH: [Role.ADMIN],
  UNPUBLISH: [Role.ADMIN],
};

export const canPerform = (action: AssessmentAction, role: Role): boolean => ACTION_ROLES[action].includes(role);

export type TransitionPlan =
  | { allowed: true; from: ContentStatus; to: ContentStatus }
  | { allowed: false; reason: 'WRONG_STATUS' | 'NOT_PUBLISHED'; allowedFrom: ContentStatus[] };

const FIXED: Record<Exclude<AssessmentAction, 'UNPUBLISH'>, { from: ContentStatus; to: ContentStatus }> = {
  SUBMIT_FOR_REVIEW: { from: 'DRAFT', to: 'READY_FOR_REVIEW' },
  REQUEST_CHANGES: { from: 'READY_FOR_REVIEW', to: 'DRAFT' },
  APPROVE: { from: 'READY_FOR_REVIEW', to: 'APPROVED' },
  PUBLISH: { from: 'APPROVED', to: 'PUBLISHED' },
};

/**
 * What an action does in the current state. UNPUBLISH depends on whether a publication is active: it ends it, a PUBLISHED working copy becomes APPROVED, and
 * a working copy that was edited after publishing keeps its status. A PUBLISHED working copy has nothing new to publish (editing returns it to DRAFT first, and it
 * must be approved again before it can be published again).
 */
export function planTransition(action: AssessmentAction, status: ContentStatus, hasActivePublication: boolean): TransitionPlan {
  if (action === 'UNPUBLISH') {
    if (!hasActivePublication) return { allowed: false, reason: 'NOT_PUBLISHED', allowedFrom: [] };
    return { allowed: true, from: status, to: status === 'PUBLISHED' ? 'APPROVED' : status };
  }
  const rule = FIXED[action];
  return status === rule.from ? { allowed: true, from: rule.from, to: rule.to } : { allowed: false, reason: 'WRONG_STATUS', allowedFrom: [rule.from] };
}

export const requiresNote = (action: AssessmentAction): boolean => action === 'REQUEST_CHANGES';

/** A workflow note is plain text; blank = none; required for requesting changes. */
export function normalizeNote(note: string | null | undefined, required: boolean): string | null {
  const text = (note ?? '').replace(/\r\n?/g, '\n').trim();
  if (text.length === 0) {
    if (required) throw new BusinessRuleError('A note is required: say what needs to change', { field: 'note' });
    return null;
  }
  if (text.includes('\u0000')) throw new BusinessRuleError('note contains an invalid character', { field: 'note' });
  if (text.length > 2000) throw new BusinessRuleError('note must be at most 2000 characters', { field: 'note', max: 2000 });
  return text;
}
