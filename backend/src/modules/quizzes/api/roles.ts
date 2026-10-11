import { Role } from '../../identity/index.js';

/** The conventions of lessons: everyone on staff reads, ADMIN and EDITOR write, only ADMIN publishes. */
export const READ_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];
export const WRITE_ROLES = [Role.ADMIN, Role.EDITOR];
export const PUBLISH_ROLES = [Role.ADMIN];
export const DELETE_ROLES = [Role.ADMIN, Role.EDITOR];
