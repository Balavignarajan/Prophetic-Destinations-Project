import type { Role } from './role.js';

export const ADMIN_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

/** An admin account as the identity module sees it (includes the password hash; never leaves the module). */
export interface AdminAccount {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: AdminStatus;
}

/** Who is making the current request. This is the only admin shape other modules see. */
export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: Role;
}

export function canAuthenticate(
  account: Pick<AdminAccount, 'status'>,
): boolean {
  return account.status === 'ACTIVE';
}

export function toAuthenticatedAdmin(
  account: AdminAccount,
): AuthenticatedAdmin {
  return { id: account.id, email: account.email, role: account.role };
}
