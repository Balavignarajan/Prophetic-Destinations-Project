import { Role } from '../../identity/index.js';

/**
 * Role policy for curriculum endpoints. The requirements do not define a
 * per-action matrix, so this is the simplest safe policy (an assumption to confirm):
 *   read:          ADMIN, EDITOR, REVIEWER (reviewers must see what they review)
 *   write:         ADMIN, EDITOR
 *   delete course: ADMIN only (top-level and destructive)
 */
export const READ_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];
export const WRITE_ROLES = [Role.ADMIN, Role.EDITOR];
export const DELETE_COURSE_ROLES = [Role.ADMIN];
