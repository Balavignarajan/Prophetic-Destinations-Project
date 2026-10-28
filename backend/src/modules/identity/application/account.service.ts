import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import {
  type AccountEvent,
  type ManagedAccount,
  isActiveAdmin,
  leavesNoActiveAdmin,
} from '../domain/account-management.js';
import {
  type AdminAccount,
  type AuthenticatedAdmin,
  toAuthenticatedAdmin,
} from '../domain/admin-account.js';
import { isValidEmail, normalizeEmail } from '../domain/email.js';
import { checkPasswordPolicy } from '../domain/password-policy.js';
import { type Role, isRole } from '../domain/role.js';
import {
  AccountEventRepository,
  type NewAccountEvent,
} from '../persistence/account-event.repository.js';
import { AdminRepository } from '../persistence/admin.repository.js';
import { RefreshTokenRepository } from '../persistence/refresh-token.repository.js';
import { PasswordHasher } from './password-hasher.js';

export interface NewManagedAccount {
  email: string;
  role: Role;
  /** A temporary password chosen by the ADMIN; the account must change it at first sign-in. */
  temporaryPassword: string;
}

/** The accounts an operation works on, locked, together with who is acting. */
interface Locked {
  actor: AdminAccount;
  target: AdminAccount;
  activeAdmins: AdminAccount[];
  manager: EntityManager;
}

const NOT_ALLOWED = 'You do not have permission to do this';

/**
 * Admin account management (ADMIN only; the HTTP layer enforces the role, and every write re-checks inside its
 * transaction that the actor is still an active ADMIN). Each operation is ONE transaction that
 *   1. locks the actor, the target and every active ADMIN (always in id order, see
 *      `AdminRepository.lockForManagement`), so concurrent operations queue up and cannot both remove the last ADMIN,
 *   2. checks the rules against the locked rows,
 *   3. changes the account, revokes sessions where required, and
 *   4. appends the audit event,
 * so the change, the revocation and the audit record commit or roll back together.
 *
 * Rules: an ADMIN cannot disable, delete or change the role of themselves (self-service is the password change only,
 * which removes the "demoted myself by mistake" and "locked myself out" cases); the last active ADMIN can never be
 * disabled, demoted or deleted; passwords and hashes are never returned, logged or written to the audit trail.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly admins: AdminRepository,
    private readonly tokens: RefreshTokenRepository,
    private readonly events: AccountEventRepository,
    private readonly passwords: PasswordHasher,
    private readonly transactions: TransactionRunner,
  ) {}

  list(limit: number, offset: number) {
    return this.admins.list(limit, offset);
  }

  async get(id: string): Promise<ManagedAccount> {
    const account = await this.admins.findManaged(id);
    if (!account) throw new NotFoundError('Account not found');
    return account;
  }

  async listEvents(
    id: string,
    limit: number,
    offset: number,
  ): Promise<{ items: AccountEvent[]; total: number }> {
    await this.get(id);
    return this.events.list(id, limit, offset);
  }

  async create(
    actor: AuthenticatedAdmin,
    input: NewManagedAccount,
  ): Promise<ManagedAccount> {
    const email = normalizeEmail(input.email);
    const problems = [
      ...(isValidEmail(email) ? [] : ['Email is not valid']),
      ...(isRole(input.role) ? [] : ['Role is not valid']),
      ...checkPasswordPolicy(input.temporaryPassword),
    ];
    if (problems.length > 0) {
      throw new BusinessRuleError('Admin account is not valid', problems);
    }
    const passwordHash = await this.passwords.hash(input.temporaryPassword);

    return this.transactions.run(async (manager) => {
      await this.requireActiveAdmin(actor.id, manager);
      const created = await this.admins.create(
        { email, role: input.role, passwordHash, mustChangePassword: true },
        manager,
      );
      await this.record(manager, {
        subjectAdminId: created.id,
        actorAdminId: actor.id,
        action: 'ACCOUNT_CREATED',
        toValue: created.role,
      });
      return this.managed(created.id, manager);
    });
  }

  async changeRole(
    actor: AuthenticatedAdmin,
    targetId: string,
    role: Role,
  ): Promise<ManagedAccount> {
    if (!isRole(role)) throw new BusinessRuleError('Role is not valid');
    return this.withLocks(actor, targetId, async (locked) => {
      this.refuseSelf(locked, 'change their own role');
      const { target, manager } = locked;
      if (target.role === role) return this.managed(target.id, manager);
      if (
        leavesNoActiveAdmin(
          target,
          { role, status: target.status },
          locked.activeAdmins,
        )
      ) {
        throw lastAdmin();
      }
      await this.admins.setRole(target.id, role, manager);
      await this.record(manager, {
        subjectAdminId: target.id,
        actorAdminId: locked.actor.id,
        action: 'ROLE_CHANGED',
        fromValue: target.role,
        toValue: role,
      });
      return this.managed(target.id, manager);
    });
  }

  async disable(
    actor: AuthenticatedAdmin,
    targetId: string,
  ): Promise<ManagedAccount> {
    return this.withLocks(actor, targetId, async (locked) => {
      this.refuseSelf(locked, 'disable their own account');
      const { target, manager } = locked;
      if (target.status === 'DISABLED') return this.managed(target.id, manager);
      if (
        leavesNoActiveAdmin(
          target,
          { role: target.role, status: 'DISABLED' },
          locked.activeAdmins,
        )
      ) {
        throw lastAdmin();
      }
      await this.admins.setStatus(target.id, 'DISABLED', manager);
      // Sessions end now; access tokens stop working at once because every request re-reads the account.
      await this.tokens.revokeAllForAdmin(
        target.id,
        'ACCOUNT_DISABLED',
        new Date(),
        manager,
      );
      await this.record(manager, {
        subjectAdminId: target.id,
        actorAdminId: locked.actor.id,
        action: 'ACCOUNT_DISABLED',
      });
      return this.managed(target.id, manager);
    });
  }

  async enable(
    actor: AuthenticatedAdmin,
    targetId: string,
  ): Promise<ManagedAccount> {
    return this.withLocks(actor, targetId, async (locked) => {
      const { target, manager } = locked;
      if (target.status === 'ACTIVE') return this.managed(target.id, manager);
      await this.admins.setStatus(target.id, 'ACTIVE', manager);
      await this.record(manager, {
        subjectAdminId: target.id,
        actorAdminId: locked.actor.id,
        action: 'ACCOUNT_ENABLED',
      });
      return this.managed(target.id, manager);
    });
  }

  /**
   * Forces a password reset: the password is replaced by `temporaryPassword` (mandatory, so the old one stops
   * working at once), every session of the account ends, and from now on the account can only change its password.
   * Not for your own account.
   */
  async requirePasswordReset(
    actor: AuthenticatedAdmin,
    targetId: string,
    temporaryPassword: string,
  ): Promise<ManagedAccount> {
    const problems = checkPasswordPolicy(temporaryPassword);
    if (problems.length > 0) {
      throw new BusinessRuleError('Password is not valid', problems);
    }
    const passwordHash = await this.passwords.hash(temporaryPassword);
    return this.withLocks(actor, targetId, async (locked) => {
      this.refuseSelf(locked, 'force a reset of their own password');
      const { target, manager } = locked;
      await this.admins.setPassword(target.id, passwordHash, true, manager);
      await this.tokens.revokeAllForAdmin(
        target.id,
        'PASSWORD_RESET',
        new Date(),
        manager,
      );
      await this.record(manager, {
        subjectAdminId: target.id,
        actorAdminId: locked.actor.id,
        action: 'PASSWORD_RESET_REQUIRED',
        toValue: 'TEMPORARY_PASSWORD_SET',
      });
      return this.managed(target.id, manager);
    });
  }

  /**
   * Permanently deletes a staff account (ADMIN only; not your own; never the last active ADMIN).
   *
   * WHAT "PERMANENT" MEANS HERE. The row of `admins` cannot simply be removed: lessons' publications, workflow events,
   * quizzes, assessments, media, reusable blocks and the account-management audit trail all point at the account with
   * RESTRICT foreign keys (and the audit tables are append-only), so a row delete would either fail or destroy history
   * that must stay valid. So the account is ERASED IN PLACE, in one transaction:
   *   - its e-mail address is replaced by an address derived from its id (it identifies nobody, and the real address
   *     is free to be used by a new account),
   *   - its password hash is replaced by the hash of a random secret that is never kept,
   *   - every session record is deleted (nothing that was ever a credential remains),
   *   - its status becomes DELETED (final: the database refuses any later change, it can never authenticate, and it
   *     is not listed, counted or found by the management API any more),
   *   - and an ACCOUNT_DELETED event (actor, subject id, the role it had, time; no e-mail address) is appended.
   * The anonymous record (id, role, creation date) stays, so everything that was authored, edited, approved or
   * published under it keeps a valid reference. Nothing authored by the account is deleted or changed.
   *
   * Concurrency: the same lock set as every other management write (actor, target and every active ADMIN, in id
   * order), so two deletions of the same account, a deletion racing a role change or a disable, and two admins
   * deleting each other all queue up and each sees the other's result; the "last active ADMIN" check cannot be
   * bypassed. A deleted target is "not found"; a deleted (or no longer active) actor is refused.
   */
  async deletePermanently(
    actor: AuthenticatedAdmin,
    targetId: string,
  ): Promise<{ id: string; deletedAt: Date }> {
    // The replacement credential is a hash of 32 random bytes that are never stored or logged: nobody can ever match it.
    const unusableHash = await this.passwords.hash(
      randomBytes(32).toString('hex'),
    );
    return this.withLocks(actor, targetId, async (locked) => {
      this.refuseSelf(locked, 'delete their own account');
      const { target, manager } = locked;
      if (
        leavesNoActiveAdmin(
          target,
          { role: target.role, status: 'DELETED' },
          locked.activeAdmins,
        )
      ) {
        throw lastAdmin();
      }
      const deletedAt = new Date();
      await this.tokens.deleteAllForAdmin(target.id, manager);
      await this.admins.erase(
        target.id,
        erasedEmail(target.id),
        unusableHash,
        deletedAt,
        manager,
      );
      await this.record(manager, {
        subjectAdminId: target.id,
        actorAdminId: locked.actor.id,
        action: 'ACCOUNT_DELETED',
        fromValue: target.role,
      });
      return { id: target.id, deletedAt };
    });
  }

  /**
   * An admin changes their own password. The current password must be right, the new one must satisfy the policy
   * and differ from it. Every existing session ends (the caller gets a fresh one from the controller), and the
   * must-change flag is cleared.
   */
  async changeOwnPassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthenticatedAdmin> {
    const problems = checkPasswordPolicy(newPassword);
    if (problems.length > 0) {
      throw new BusinessRuleError('Password is not valid', problems);
    }
    if (newPassword === currentPassword) {
      throw new BusinessRuleError(
        'The new password must be different from the current one',
      );
    }
    const newHash = await this.passwords.hash(newPassword);

    return this.transactions.run(async (manager) => {
      const rows = await this.admins.lockForManagement([adminId], manager);
      const own = rows.find((row) => row.id === adminId);
      if (!own || own.status !== 'ACTIVE')
        throw new ForbiddenError(NOT_ALLOWED);
      if (!(await this.passwords.verify(own.passwordHash, currentPassword))) {
        throw new BusinessRuleError('The current password is incorrect');
      }
      await this.admins.setPassword(own.id, newHash, false, manager);
      await this.tokens.revokeAllForAdmin(
        own.id,
        'PASSWORD_CHANGED',
        new Date(),
        manager,
      );
      await this.record(manager, {
        subjectAdminId: own.id,
        actorAdminId: own.id,
        action: 'PASSWORD_CHANGED',
      });
      return toAuthenticatedAdmin({ ...own, mustChangePassword: false });
    });
  }

  // ---- internals -------------------------------------------------------------------------------------------

  /** Runs `work` with the actor, the target and all active ADMINs locked, after checking the actor may act. */
  private withLocks<T>(
    actor: AuthenticatedAdmin,
    targetId: string,
    work: (locked: Locked) => Promise<T>,
  ): Promise<T> {
    return this.transactions.run(async (manager) => {
      const rows = await this.admins.lockForManagement(
        [actor.id, targetId],
        manager,
      );
      const current = rows.find((row) => row.id === actor.id);
      if (!current || !isActiveAdmin(current)) {
        throw new ForbiddenError(NOT_ALLOWED);
      }
      const target = rows.find((row) => row.id === targetId);
      // A permanently deleted account is gone as far as management is concerned (and the database would refuse any change to it).
      if (!target || target.status === 'DELETED') {
        throw new NotFoundError('Account not found');
      }
      return work({
        actor: current,
        target,
        activeAdmins: rows.filter(isActiveAdmin),
        manager,
      });
    });
  }

  private async requireActiveAdmin(
    actorId: string,
    manager: EntityManager,
  ): Promise<void> {
    const rows = await this.admins.lockForManagement([actorId], manager);
    const current = rows.find((row) => row.id === actorId);
    if (!current || !isActiveAdmin(current)) {
      throw new ForbiddenError(NOT_ALLOWED);
    }
  }

  private refuseSelf(locked: Locked, what: string): void {
    if (locked.actor.id === locked.target.id) {
      throw new ConflictError(
        `You cannot ${what}. Ask another ADMIN, or use the password change for your own password.`,
      );
    }
  }

  private async managed(
    id: string,
    manager: EntityManager,
  ): Promise<ManagedAccount> {
    const account = await this.admins.findManaged(id, manager);
    if (!account) throw new NotFoundError('Account not found');
    return account;
  }

  private async record(
    manager: EntityManager,
    event: NewAccountEvent,
  ): Promise<void> {
    await this.events.append(event, manager);
  }
}

/** The address an erased account keeps: derived from its id, so it is unique, identifies nobody, and can never be a real mailbox (".invalid" is reserved). */
const erasedEmail = (id: string): string =>
  `deleted-account-${id.toLowerCase()}@deleted.invalid`;

function lastAdmin(): ConflictError {
  return new ConflictError(
    'This is the last active ADMIN account. Make another account an active ADMIN first.',
    { reason: 'LAST_ACTIVE_ADMIN' },
  );
}
