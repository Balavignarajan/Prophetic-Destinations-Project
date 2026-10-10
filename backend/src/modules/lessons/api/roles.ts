import { Role } from '../../identity/index.js';

/**
 * Role policy for lesson endpoints. The guide defines the CMS actions but no
 * lesson-specific role matrix, so lessons follow the approved curriculum model:
 *
 *   read, preview:            ADMIN, EDITOR, REVIEWER
 *   create, update, reorder:  ADMIN, EDITOR
 *   delete a lesson or block: ADMIN, EDITOR (same as deleting a Module; only deleting a
 *                             Course is ADMIN-only)
 *
 * Status transitions are not available here at all: Publishing will own them.
 */
export const READ_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];
export const WRITE_ROLES = [Role.ADMIN, Role.EDITOR];
export const DELETE_LESSON_ROLES = [Role.ADMIN, Role.EDITOR];
/** Blocks follow the same rule as lessons. */
export const DELETE_BLOCK_ROLES = [Role.ADMIN, Role.EDITOR];
