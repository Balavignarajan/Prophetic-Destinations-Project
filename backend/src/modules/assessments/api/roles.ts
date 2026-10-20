import { Role } from '../../identity/index.js';
import { ACTION_ROLES } from '../domain/assessment-workflow.js';

/** The project's conventions: everyone on staff reads, ADMIN and EDITOR author, and the workflow roles are those of lessons (see assessment-workflow.ts). */
export const READ_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];
export const WRITE_ROLES = [Role.ADMIN, Role.EDITOR];
export { ACTION_ROLES };
