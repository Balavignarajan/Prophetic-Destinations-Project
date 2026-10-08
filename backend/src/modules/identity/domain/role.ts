/** The fixed admin roles. Roles live in code; there is no role management. */
export const Role = {
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  REVIEWER: 'REVIEWER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/**
 * Role check used by RolesGuard. Deliberately literal: a role passes only if it
 * is listed. ADMIN is not an implicit superuser; routes list every role they allow.
 */
export function isRoleAllowed(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
