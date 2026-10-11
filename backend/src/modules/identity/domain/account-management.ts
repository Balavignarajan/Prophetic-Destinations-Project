import type { AdminAccount, AdminStatus } from './admin-account.js';
import type { Role } from './role.js';

/** An account as the management API shows it: no password hash, no tokens. */
export interface ManagedAccount {
  id: string;
  email: string;
  role: Role;
  status: AdminStatus;
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
