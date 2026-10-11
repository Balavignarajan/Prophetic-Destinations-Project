import { Role } from '../../identity/index.js';

/** Same convention as lessons and blocks: everyone reads; ADMIN and EDITOR change; REVIEWERS never change. */
export const READ_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];
export const WRITE_ROLES = [Role.ADMIN, Role.EDITOR];
export const DELETE_ROLES = [Role.ADMIN, Role.EDITOR];
