import type { Role } from './role.js';

/**
 * ACTIVE / DISABLED are the two states of a staff account that exists. DELETED is final: the account was permanently
 * erased (its e-mail address and credentials are gone) and only an anonymous record with the same id remains, so the
 * history that points at it (who published, who edited, the audit trails) stays intact. A DELETED account can never
 * authenticate, is not a staff account any more, and can never change state again (the database refuses it).
 */
export const ADMIN_STATUSES = ['ACTIVE', 'DISABLED', 'DELETED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

/** The states an account has while it is still a staff account; the account-management API only ever shows these. */
export type ManagedStatus = Exclude<AdminStatus, 'DELETED'>;

/** An admin account as the identity module sees it (includes the password hash; never leaves the module). */
export interface AdminAccount {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: AdminStatus;
  /** True after an ADMIN set a temporary password or forced a reset: the account may only change its password. */
  mustChangePassword: boolean;
}

/** Who is making the current request. This is the only admin shape other modules see. */
export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: Role;
  /**
   * Present (true) only while the account must change its password first. The identity guard then refuses every
   * route except the ones that allow it. Other modules never need to look at this.
   */
  passwordChangeRequired?: true;
}

export function canAuthenticate(
  account: Pick<AdminAccount, 'status'>,
): boolean {
  return account.status === 'ACTIVE';
}

export function toAuthenticatedAdmin(
  account: AdminAccount,
): AuthenticatedAdmin {
  return {
    id: account.id,
    email: account.email,
    role: account.role,
    ...(account.mustChangePassword
      ? { passwordChangeRequired: true as const }
      : {}),
  };
}
