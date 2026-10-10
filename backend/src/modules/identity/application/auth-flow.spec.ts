import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { EntityManager } from 'typeorm';
import type { AppConfig } from '../../../config/index.js';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  ConflictError,
  UnauthorizedError,
} from '../../../shared-kernel/index.js';
import type { AdminAccount } from '../domain/admin-account.js';
import { hashRefreshToken } from '../domain/refresh-token.js';
import type { RefreshSession, RevokedReason } from '../domain/refresh-token.js';
import { Role } from '../domain/role.js';
import type {
  AdminRepository,
  NewAdmin,
} from '../persistence/admin.repository.js';
import type {
  NewRefreshSession,
  RefreshTokenRepository,
} from '../persistence/refresh-token.repository.js';
import { AccessTokenService } from './access-token.service.js';
import { AdminProvisioningService } from './admin-provisioning.service.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

// In-memory stand-ins for the repositories; the real ones are covered by the integration tests.
class FakeAdmins {
  accounts: AdminAccount[] = [];
  async findByEmail(email: string) {
    return this.accounts.find((a) => a.email === email) ?? null;
  }
  async findById(id: string) {
    return this.accounts.find((a) => a.id === id) ?? null;
  }
  async create(admin: NewAdmin) {
    if (this.accounts.some((a) => a.email === admin.email)) {
      throw new ConflictError('duplicate');
    }
    const account: AdminAccount = {
      id: randomUUID(),
      status: 'ACTIVE',
      ...admin,
    };
    this.accounts.push(account);
    return account;
  }
}

class FakeTokens {
  rows: RefreshSession[] = [];
  async insert(s: NewRefreshSession) {
    this.rows.push({
      ...s,
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
    });
  }
  async findByHash(hash: string) {
    return this.rows.find((r) => r.tokenHash === hash) ?? null;
  }
  findByHashForUpdate(hash: string) {
    return this.findByHash(hash);
  }
  async markRotated(id: string, replacedById: string, now: Date) {
    Object.assign(
      this.rows.find((r) => r.id === id)!,
      {
        revokedAt: now,
        revokedReason: 'ROTATED',
        replacedById,
      },
    );
  }
  async revokeFamily(familyId: string, reason: RevokedReason, now: Date) {
    const active = this.rows.filter(
      (r) => r.familyId === familyId && !r.revokedAt,
    );
    active.forEach((r) =>
      Object.assign(r, { revokedAt: now, revokedReason: reason }),
    );
    return active.length;
  }
}

const PASSWORD = 'a-long-test-password';
const config = {
  jwtAccessSecret: 'j'.repeat(40),
  jwtAccessTtlSeconds: 900,
  refreshTokenTtlDays: 14,
} as AppConfig;

function build() {
  const admins = new FakeAdmins();
  const tokens = new FakeTokens();
  const passwords = new PasswordHasher();
  const transactions = {
    run: (work: (m: EntityManager) => unknown) => work({} as EntityManager),
  };
  const sessions = new SessionService(
    tokens as unknown as RefreshTokenRepository,
    admins as unknown as AdminRepository,
    transactions as unknown as TransactionRunner,
    config,
  );
  const accessTokens = new AccessTokenService(
    new JwtService({ secret: config.jwtAccessSecret }),
    config,
  );
  const auth = new AuthService(
    admins as unknown as AdminRepository,
    passwords,
    accessTokens,
    sessions,
  );
  const provisioning = new AdminProvisioningService(
    admins as unknown as AdminRepository,
    passwords,
  );
  return { admins, tokens, auth, provisioning, accessTokens };
}

async function seeded(role: Role = Role.EDITOR) {
  const ctx = build();
  await ctx.provisioning.create({
    email: 'Editor@Example.com',
    password: PASSWORD,
    role,
  });
  return ctx;
}

describe('login', () => {
  it('succeeds with correct credentials and any email casing', async () => {
    const { auth } = await seeded();
    const session = await auth.login('  EDITOR@example.COM ', PASSWORD);
    expect(session.admin).toEqual({
      id: expect.any(String),
      email: 'editor@example.com',
      role: 'EDITOR',
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
  });

  it('fails identically for a wrong password, an unknown email and a disabled account', async () => {
    const { auth, admins } = await seeded();
    admins.accounts.push({
      ...admins.accounts[0],
      id: randomUUID(),
      email: 'disabled@example.com',
      status: 'DISABLED',
    });

    const failures = await Promise.all(
      [
        auth.login('editor@example.com', 'wrong password!!'),
        auth.login('nobody@example.com', PASSWORD),
        auth.login('disabled@example.com', PASSWORD),
      ].map((attempt) =>
        attempt.then(
          () => null,
          (error: unknown) => error,
        ),
      ),
    );

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(UnauthorizedError);
    }
    const messages = new Set(failures.map((f) => (f as Error).message));
    expect(messages.size).toBe(1);
  });

  it('stores only a hash of the refresh token', async () => {
    const { auth, tokens } = await seeded();
    const { refreshToken } = await auth.login('editor@example.com', PASSWORD);
    expect(tokens.rows).toHaveLength(1);
    expect(tokens.rows[0].tokenHash).toBe(hashRefreshToken(refreshToken));
    expect(JSON.stringify(tokens.rows)).not.toContain(refreshToken);
  });
});

describe('provisioning', () => {
  it('stores an argon2 hash, never the plaintext password', async () => {
    const { admins } = await seeded();
    expect(admins.accounts[0].passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(JSON.stringify(admins.accounts)).not.toContain(PASSWORD);
  });

  it('normalizes the email', async () => {
    const { admins } = await seeded();
    expect(admins.accounts[0].email).toBe('editor@example.com');
  });

  it('rejects a weak password, bad email and bad role together', async () => {
    const { provisioning } = build();
    await expect(
      provisioning.create({
        email: 'nope',
        password: 'short',
        role: 'ROOT' as Role,
      }),
    ).rejects.toMatchObject({
      details: expect.arrayContaining([expect.any(String)]),
    });
  });

  it('ensure() is idempotent and never changes an existing account', async () => {
    const { provisioning, admins } = build();
    const input = { email: 'a@b.co', password: PASSWORD, role: Role.ADMIN };
    expect(await provisioning.ensure(input)).toEqual({ created: true });
    const hash = admins.accounts[0].passwordHash;
    expect(
      await provisioning.ensure({
        ...input,
        password: 'a-different-long-password',
      }),
    ).toEqual({ created: false });
    expect(admins.accounts).toHaveLength(1);
    expect(admins.accounts[0].passwordHash).toBe(hash);
  });
});

describe('refresh', () => {
  it('rotates: returns a new token and retires the old one', async () => {
    const { auth, tokens } = await seeded();
    const first = await auth.login('editor@example.com', PASSWORD);
    const second = await auth.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.admin.email).toBe('editor@example.com');
    expect(tokens.rows).toHaveLength(2);
    expect(tokens.rows[0]).toMatchObject({
      revokedReason: 'ROTATED',
      replacedById: tokens.rows[1].id,
    });
    expect(tokens.rows[1].revokedAt).toBeNull();
    expect(tokens.rows[1].familyId).toBe(tokens.rows[0].familyId);
  });

  it('revokes the whole session when a rotated token is replayed', async () => {
    const { auth, tokens } = await seeded();
    const first = await auth.login('editor@example.com', PASSWORD);
    const second = await auth.refresh(first.refreshToken);

    await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(tokens.rows.every((r) => r.revokedAt)).toBe(true);
    expect(tokens.rows[1].revokedReason).toBe('REUSE_DETECTED');
    // the legitimate newest token is dead too
    await expect(auth.refresh(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('does not touch other sessions when one is replayed', async () => {
    const { auth, tokens } = await seeded();
    const a = await auth.login('editor@example.com', PASSWORD);
    const b = await auth.login('editor@example.com', PASSWORD);
    await auth.refresh(a.refreshToken);
    await expect(auth.refresh(a.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(auth.refresh(b.refreshToken)).resolves.toBeTruthy();
    expect(new Set(tokens.rows.map((r) => r.familyId)).size).toBe(2);
  });

  it('rejects unknown, missing and expired tokens', async () => {
    const { auth, tokens } = await seeded();
    await expect(auth.refresh('unknown')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(auth.refresh(undefined)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    const session = await auth.login('editor@example.com', PASSWORD);
    tokens.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('refuses and revokes the session of a disabled account', async () => {
    const { auth, admins, tokens } = await seeded();
    const session = await auth.login('editor@example.com', PASSWORD);
    admins.accounts[0].status = 'DISABLED';
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(tokens.rows[0].revokedReason).toBe('ACCOUNT_DISABLED');
  });
});

describe('logout', () => {
  it('revokes the session so its refresh token no longer works', async () => {
    const { auth, tokens } = await seeded();
    const session = await auth.login('editor@example.com', PASSWORD);
    await auth.logout(session.refreshToken);
    expect(tokens.rows[0].revokedReason).toBe('LOGOUT');
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('revokes every token of the session, not only the latest', async () => {
    const { auth, tokens } = await seeded();
    const first = await auth.login('editor@example.com', PASSWORD);
    const second = await auth.refresh(first.refreshToken);
    await auth.logout(second.refreshToken);
    expect(tokens.rows.every((r) => r.revokedAt)).toBe(true);
  });

  it('always succeeds, even for unknown or missing tokens', async () => {
    const { auth } = await seeded();
    await expect(auth.logout('unknown')).resolves.toBeUndefined();
    await expect(auth.logout(undefined)).resolves.toBeUndefined();
  });
});

describe('authenticate', () => {
  it('resolves a valid access token to the current admin', async () => {
    const { auth } = await seeded(Role.REVIEWER);
    const { accessToken } = await auth.login('editor@example.com', PASSWORD);
    expect(await auth.authenticate(accessToken)).toMatchObject({
      email: 'editor@example.com',
      role: 'REVIEWER',
    });
  });

  it('uses the account as it is now: a disabled admin is rejected immediately', async () => {
    const { auth, admins } = await seeded();
    const { accessToken } = await auth.login('editor@example.com', PASSWORD);
    admins.accounts[0].status = 'DISABLED';
    await expect(auth.authenticate(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('uses the current role, not the one in the token', async () => {
    const { auth, admins } = await seeded(Role.ADMIN);
    const { accessToken } = await auth.login('editor@example.com', PASSWORD);
    admins.accounts[0].role = Role.REVIEWER;
    expect((await auth.authenticate(accessToken)).role).toBe('REVIEWER');
  });

  it('rejects invalid tokens', async () => {
    const { auth } = await seeded();
    await expect(auth.authenticate('garbage')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('refresh rotation and concurrency errors', () => {
  const driverError = (code: string) =>
    Object.assign(new Error('postgres detail'), { driverError: { code } });

  it('asks the runner not to translate concurrency errors (a refresh is not "retry the same request")', async () => {
    const seen: unknown[] = [];
    const transactions = {
      run: (_work: unknown, options?: unknown) => {
        seen.push(options);
        return Promise.resolve(null);
      },
    };
    const sessions = new SessionService(
      new FakeTokens() as unknown as RefreshTokenRepository,
      new FakeAdmins() as unknown as AdminRepository,
      transactions as unknown as TransactionRunner,
      config,
    );

    await expect(sessions.rotate('some-token')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(seen).toEqual([{ translateConcurrencyErrors: false }]);
  });

  it.each(['40P01', '40001', '55P03'])(
    'a database %s during rotation reaches the caller as the original error, never as a retryable 409',
    async (code) => {
      const original = driverError(code);
      // the real runner, over a data source whose transaction fails
      const { TransactionRunner: Runner } =
        await import('../../../database/transaction-runner.js');
      const runner = new Runner({
        transaction: async () => {
          throw original;
        },
      } as never);
      const sessions = new SessionService(
        new FakeTokens() as unknown as RefreshTokenRepository,
        new FakeAdmins() as unknown as AdminRepository,
        runner,
        config,
      );

      const thrown = await sessions
        .rotate('some-token')
        .catch((e: unknown) => e);

      expect(thrown).toBe(original);
      expect(thrown).not.toBeInstanceOf(ConflictError);
      expect(thrown).not.toBeInstanceOf(UnauthorizedError);
    },
  );
});
