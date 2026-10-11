import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/index.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { UnauthorizedError } from '../../../shared-kernel/index.js';
import { type AdminAccount, canAuthenticate } from '../domain/admin-account.js';
import {
  decideRefresh,
  generateRefreshToken,
  hashRefreshToken,
} from '../domain/refresh-token.js';
import { AdminRepository } from '../persistence/admin.repository.js';
import { RefreshTokenRepository } from '../persistence/refresh-token.repository.js';

export interface IssuedRefreshToken {
  /** The raw token. Returned once, to be sent to the client; only its hash is stored. */
  rawToken: string;
  expiresAt: Date;
}

export interface RotatedSession extends IssuedRefreshToken {
  admin: AdminAccount;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Refresh-token sessions: start, rotate (with replay detection) and end. */
@Injectable()
export class SessionService {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly admins: AdminRepository,
    private readonly transactions: TransactionRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Starts a new session (a new token family) for an admin who just authenticated.
   *
   * The account is re-read under a SHARE lock in the same transaction that creates the token, and the session is
   * refused if it is no longer active or (when `verified` is given) its password, or its must-change flag, is no
   * longer what the login just saw. Without this, a login that had already checked the password could create a session
   * AFTER a concurrent disable, forced reset or password change had revoked every session, and that session would
   * outlive the revocation.
   */
  async start(
    adminId: string,
    verified?: { passwordHash: string; mustChangePassword: boolean },
  ): Promise<IssuedRefreshToken> {
    return this.transactions.run(async (manager) => {
      const account = await this.admins.findByIdForShare(adminId, manager);
      if (
        !account ||
        !canAuthenticate(account) ||
        (verified !== undefined &&
          (account.passwordHash !== verified.passwordHash ||
            account.mustChangePassword !== verified.mustChangePassword))
      ) {
        throw new UnauthorizedError('Authentication failed');
      }
      return this.issue(adminId, randomUUID(), manager);
    });
  }

  /**
   * Exchanges a refresh token for a new one and retires the old one.
   * Replaying an already-rotated token revokes the whole session.
   * Throws UnauthorizedError for any token that cannot be used.
   */
  async rotate(rawToken: string): Promise<RotatedSession> {
    const tokenHash = hashRefreshToken(rawToken);

    // Decide inside the transaction, throw outside it: a throw would roll back the revocation.
    const outcome = await this.transactions.run(
      async (manager) => {
        const current = await this.tokens.findByHashForUpdate(
          tokenHash,
          manager,
        );
        if (!current) return null;

        const now = new Date();
        const decision = decideRefresh(current, now);

        if (decision === 'reuse') {
          await this.tokens.revokeFamily(
            current.familyId,
            'REUSE_DETECTED',
            now,
            manager,
          );
          return null;
        }
        if (decision === 'reject') return null;

        const admin = await this.admins.findById(current.adminId, manager);
        if (!admin || !canAuthenticate(admin)) {
          await this.tokens.revokeFamily(
            current.familyId,
            'ACCOUNT_DISABLED',
            now,
            manager,
          );
          return null;
        }

        const next = await this.issue(admin.id, current.familyId, manager);
        await this.tokens.markRotated(current.id, next.id, now, manager);
        return { rawToken: next.rawToken, expiresAt: next.expiresAt, admin };
      },
      // A refresh is not "retry the same request": if a concurrent refresh already rotated this token,
      // presenting it again is reuse and revokes the session. So a concurrency failure here is never
      // reported as retryable; it propagates unchanged, as it did before the translation existed.
      { translateConcurrencyErrors: false },
    );

    if (!outcome) throw new UnauthorizedError('Authentication failed');
    return outcome;
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored: logout always succeeds. */
  async end(rawToken: string): Promise<void> {
    const current = await this.tokens.findByHash(hashRefreshToken(rawToken));
    if (current) {
      await this.tokens.revokeFamily(current.familyId, 'LOGOUT', new Date());
    }
  }

  private async issue(
    adminId: string,
    familyId: string,
    manager?: Parameters<RefreshTokenRepository['insert']>[1],
  ): Promise<IssuedRefreshToken & { id: string }> {
    const rawToken = generateRefreshToken();
    const id = randomUUID();
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlDays * DAY_MS,
    );
    await this.tokens.insert(
      {
        id,
        adminId,
        familyId,
        tokenHash: hashRefreshToken(rawToken),
        expiresAt,
      },
      manager,
    );
    return { id, rawToken, expiresAt };
  }
}
