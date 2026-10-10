import { Role } from '../../identity/index.js';
import type { WorkflowAction } from './workflow.js';

/**
 * Who may perform each workflow action (approved role matrix). Roles are the
 * fixed ones from the identity module; ADMIN is not an implicit superuser, so
 * every role that may act is listed.
 */
export const ACTION_ROLES: Record<WorkflowAction, readonly Role[]> = {
  SUBMIT_FOR_REVIEW: [Role.ADMIN, Role.EDITOR],
  REQUEST_CHANGES: [Role.ADMIN, Role.REVIEWER],
  APPROVE: [Role.ADMIN, Role.REVIEWER],
  PUBLISH: [Role.ADMIN],
  UNPUBLISH: [Role.ADMIN],
};

/** Reading workflow information (readiness, events, publication history) is open to all three roles. */
export const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.EDITOR,
  Role.REVIEWER,
];

export function canPerform(action: WorkflowAction, role: Role): boolean {
  return ACTION_ROLES[action].includes(role);
}
