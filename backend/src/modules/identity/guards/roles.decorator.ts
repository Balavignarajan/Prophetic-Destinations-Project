import { SetMetadata } from '@nestjs/common';
import type { Role } from '../domain/role.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles, e.g. @Roles(Role.ADMIN, Role.EDITOR).
 * Without it, any authenticated admin may call the route.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
