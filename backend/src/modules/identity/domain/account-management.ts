import type { AdminAccount, ManagedStatus } from './admin-account.js';
import type { Role } from './role.js';

/** An account as the management API shows it: no password hash, no tokens. Permanently deleted accounts are never shown. */
export interface ManagedAccount {
  id: string;
  email: string;
  role: Role;
  status: ManagedStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export const ACCOUNT_EVENT_ACTIONS = [
  'ACCOUNT_CREATED',
  'ROLE_CHANGED',
  'ACCOUNT_DISABLED',
  'ACCOUNT_ENABLED',
  'PASSWORD_RESET_REQUIRED',
  'PASSWORD_CHANGED',
  // The subject's e-mail address and credentials were permanently erased (from_value is the role it had). The event
  // carries no e-mail address, so it stays in the trail, pointing at the anonymous record, after the erasure.
  'ACCOUNT_DELETED',
] as const;
export type AccountEventAction = (typeof ACCOUNT_EVENT_ACTIONS)[number];

/** One recorded management action. It never carries a password, a hash or a token. */
export interface AccountEvent {
  id: string;
  seq: number;
  subjectAdminId: string;
  actorAdminId: string;
  action: AccountEventAction;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
}

export const isActiveAdmin = (
  account: Pick<AdminAccount, 'role' | 'status'>,
): boolean => account.role === 'ADMIN' && account.status === 'ACTIVE';

/**
 * Whether changing `target` to `after` would leave the system without an active ADMIN, given the accounts that are
 * active ADMINs right now (`activeAdmins`, which includes `target` if it is one).
 */
export function leavesNoActiveAdmin(
  target: Pick<AdminAccount, 'id' | 'role' | 'status'>,
  after: Pick<AdminAccount, 'role' | 'status'>,
  activeAdmins: readonly Pick<AdminAccount, 'id'>[],
): boolean {
  if (!isActiveAdmin(target) || isActiveAdmin(after)) return false;
  return activeAdmins.filter((admin) => admin.id !== target.id).length === 0;
}
