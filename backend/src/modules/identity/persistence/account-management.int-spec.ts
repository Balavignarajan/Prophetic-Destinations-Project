import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { deleteAccountHistory } from '../../../../test/support/account-cleanup.js';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../shared-kernel/index.js';
import { AccountService } from '../application/account.service.js';
import { AuthService } from '../application/auth.service.js';
import { PasswordHasher } from '../application/password-hasher.js';
import { SessionService } from '../application/session.service.js';
import type { AuthenticatedAdmin } from '../domain/admin-account.js';
import { Role } from '../domain/role.js';
import { IdentityModule } from '../identity.module.js';
import { AdminRepository } from './admin.repository.js';

// Integration: account management against the real database (see .env): the service rules, the transactions, the
// session revocation, the audit trail and the last-ADMIN protection under concurrency.
// Rows carry a per-run prefix and are deleted afterwards.
const runId = randomUUID().slice(0, 8);
const email = (name: string) => `acct-${runId}-${name}@int-test.invalid`;
const PASSWORD = 'integration-password-1';
const TEMP = 'temporary-password-1';

describe('admin account management (integration)', () => {
  let dataSource: DataSource;
  let accounts: AccountService;
  let auth: AuthService;
  let sessions: SessionService;
  let admins: AdminRepository;
  let hasher: PasswordHasher;
  let closeModule: () => Promise<void>;

  const cleanup = async () => {
    await deleteAccountHistory(dataSource, `acct-${runId}-%@int-test.invalid`);
  };

  /** A real account (real password hash) and the authenticated shape the controllers pass in. */
  const newAccount = async (
    name: string,
    role: Role,
    mustChangePassword = false,
  ): Promise<AuthenticatedAdmin> => {
    const created = await admins.create({
      email: email(name),
      passwordHash: await hasher.hash(PASSWORD),
      role,
      mustChangePassword,
    });
    return { id: created.id, email: created.email, role: created.role };
  };

  const activeTokens = async (adminId: string) =>
    (
      await dataSource.query(
        `SELECT count(*)::int AS "n" FROM "admin_refresh_tokens" WHERE "admin_id" = $1 AND "revoked_at" IS NULL`,
        [adminId],
      )
    )[0].n as number;
  const events = (subjectId: string) =>
    dataSource.query(
      `SELECT "action", "actor_admin_id", "from_value", "to_value" FROM "admin_account_events"
        WHERE "subject_admin_id" = $1 ORDER BY "seq"`,
      [subjectId],
    );
  const row = async (id: string) =>
    (await dataSource.query(`SELECT * FROM "admins" WHERE "id" = $1`, [id]))[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, IdentityModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    accounts = moduleRef.get(AccountService, { strict: false });
    auth = moduleRef.get(AuthService, { strict: false });
    sessions = moduleRef.get(SessionService, { strict: false });
    admins = moduleRef.get(AdminRepository, { strict: false });
    hasher = moduleRef.get(PasswordHasher, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('creating accounts', () => {
    it('creates an account that must change its temporary password, records the action, and returns no secret', async () => {
      const boss = await newAccount('c-boss', Role.ADMIN);
      const created = await accounts.create(boss, {
        email: `  ${email('c-new').toUpperCase()}  `,
        role: Role.EDITOR,
        temporaryPassword: TEMP,
      });
      expect(created).toMatchObject({
        email: email('c-new'),
        role: 'EDITOR',
        status: 'ACTIVE',
        mustChangePassword: true,
        version: 1,
      });
      expect(JSON.stringify(created)).not.toMatch(
        /argon2|passwordHash|password_hash/i,
      );
      expect(await events(created.id)).toEqual([
        {
          action: 'ACCOUNT_CREATED',
          actor_admin_id: boss.id,
          from_value: null,
          to_value: 'EDITOR',
        },
      ]);
      // the temporary password works, and the session says a change is required
      const session = await auth.login(email('c-new'), TEMP);
      expect(session.admin.passwordChangeRequired).toBe(true);
    });

    it('rejects a duplicate email (409), a weak password and a bad email/role (422) without creating anything', async () => {
      const boss = await newAccount('c-boss2', Role.ADMIN);
      await newAccount('c-dup', Role.EDITOR);
      await expect(
        accounts.create(boss, {
          email: email('c-dup'),
          role: Role.EDITOR,
          temporaryPassword: TEMP,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      for (const bad of [
        {
          email: email('c-weak'),
          role: Role.EDITOR,
          temporaryPassword: 'short',
        },
        { email: 'not-an-email', role: Role.EDITOR, temporaryPassword: TEMP },
        {
          email: email('c-role'),
          role: 'OWNER' as Role,
          temporaryPassword: TEMP,
        },
      ]) {
        await expect(accounts.create(boss, bad)).rejects.toBeInstanceOf(
          BusinessRuleError,
        );
      }
      expect(await admins.findByEmail(email('c-weak'))).toBeNull();
      expect(await admins.findByEmail(email('c-role'))).toBeNull();
    });

    it('is refused for a non-ADMIN or a disabled actor, even if the controller let them through', async () => {
      const editor = await newAccount('c-editor', Role.EDITOR);
      await expect(
        accounts.create(editor, {
          email: email('c-by-editor'),
          role: Role.ADMIN,
          temporaryPassword: TEMP,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(await admins.findByEmail(email('c-by-editor'))).toBeNull();

      const boss = await newAccount('c-boss3', Role.ADMIN);
      const other = await newAccount('c-boss3b', Role.ADMIN);
      await accounts.disable(boss, other.id);
      await expect(
        accounts.create(other, {
          email: email('c-by-disabled'),
          role: Role.EDITOR,
          temporaryPassword: TEMP,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('listing', () => {
    it('lists accounts without any secret and pages them', async () => {
      await newAccount('l-one', Role.EDITOR);
      await newAccount('l-two', Role.REVIEWER);
      const page = await accounts.list(1000, 0);
      const mine = page.items.filter((a) =>
        a.email.startsWith(`acct-${runId}-l-`),
      );
      expect(mine.map((a) => a.email).sort()).toEqual([
        email('l-one'),
        email('l-two'),
      ]);
      expect(JSON.stringify(page.items)).not.toMatch(/argon2|passwordHash/i);
      expect(page.total).toBeGreaterThanOrEqual(2);
      expect((await accounts.list(1, 0)).items).toHaveLength(1);
    });

    it('reports a missing account as 404', async () => {
      await expect(accounts.get(randomUUID())).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(
        accounts.listEvents(randomUUID(), 10, 0),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('roles', () => {
    it('changes a role, bumps the version and records who changed what', async () => {
      const boss = await newAccount('r-boss', Role.ADMIN);
      const target = await newAccount('r-target', Role.EDITOR);
      const changed = await accounts.changeRole(boss, target.id, Role.REVIEWER);
      expect(changed).toMatchObject({ role: 'REVIEWER', version: 2 });
      expect((await events(target.id)).at(-1)).toEqual({
        action: 'ROLE_CHANGED',
        actor_admin_id: boss.id,
        from_value: 'EDITOR',
        to_value: 'REVIEWER',
      });
      // the access token reflects it on the next request: authenticate re-reads the account
      const session = await auth.login(email('r-target'), PASSWORD);
      expect((await auth.authenticate(session.accessToken)).role).toBe(
        'REVIEWER',
      );
    });

    it('does nothing (and records nothing) when the role is unchanged', async () => {
      const boss = await newAccount('r-boss2', Role.ADMIN);
      const target = await newAccount('r-same', Role.EDITOR);
      const result = await accounts.changeRole(boss, target.id, Role.EDITOR);
      expect(result.version).toBe(1);
      expect(await events(target.id)).toEqual([]);
    });

    it('refuses to change your own role and a role that does not exist', async () => {
      const boss = await newAccount('r-self', Role.ADMIN);
      await expect(
        accounts.changeRole(boss, boss.id, Role.EDITOR),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await row(boss.id)).role).toBe('ADMIN');
      await expect(
        accounts.changeRole(boss, boss.id, 'OWNER' as Role),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('is refused for non-ADMIN actors, so an EDITOR cannot promote themselves or anyone', async () => {
      const editor = await newAccount('r-editor', Role.EDITOR);
      const other = await newAccount('r-other', Role.REVIEWER);
      await expect(
        accounts.changeRole(editor, editor.id, Role.ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        accounts.changeRole(editor, other.id, Role.ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect((await row(editor.id)).role).toBe('EDITOR');
      expect((await row(other.id)).role).toBe('REVIEWER');
    });

    it('answers 404 for an unknown target', async () => {
      const boss = await newAccount('r-boss3', Role.ADMIN);
      await expect(
        accounts.changeRole(boss, randomUUID(), Role.EDITOR),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('disabling and enabling', () => {
    it('disables at once: the access token stops working, every refresh token is revoked, and it is recorded', async () => {
      const boss = await newAccount('d-boss', Role.ADMIN);
      await newAccount('d-target', Role.EDITOR);
      const first = await auth.login(email('d-target'), PASSWORD);
      await auth.login(email('d-target'), PASSWORD); // a second device
      const targetId = first.admin.id;
      expect(await activeTokens(targetId)).toBe(2);

      const disabled = await accounts.disable(boss, targetId);
      expect(disabled.status).toBe('DISABLED');
      expect(await activeTokens(targetId)).toBe(0);
      await expect(auth.authenticate(first.accessToken)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      await expect(
        auth.login(email('d-target'), PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect((await events(targetId)).at(-1)).toMatchObject({
        action: 'ACCOUNT_DISABLED',
        actor_admin_id: boss.id,
      });
      const reasons = await dataSource.query(
        `SELECT DISTINCT "revoked_reason" FROM "admin_refresh_tokens" WHERE "admin_id" = $1`,
        [targetId],
      );
      expect(reasons).toEqual([{ revoked_reason: 'ACCOUNT_DISABLED' }]);

      // disabling again is a no-op; enabling restores sign-in
      expect((await accounts.disable(boss, targetId)).version).toBe(
        disabled.version,
      );
      expect((await accounts.enable(boss, targetId)).status).toBe('ACTIVE');
      await expect(
        auth.login(email('d-target'), PASSWORD),
      ).resolves.toBeDefined();
      expect(
        (await events(targetId)).map((e: { action: string }) => e.action),
      ).toEqual(['ACCOUNT_DISABLED', 'ACCOUNT_ENABLED']);
    });

    it('refuses to disable yourself, and non-ADMIN actors cannot disable or enable anyone', async () => {
      const boss = await newAccount('d-boss2', Role.ADMIN);
      const reviewer = await newAccount('d-reviewer', Role.REVIEWER);
      await expect(accounts.disable(boss, boss.id)).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(accounts.disable(reviewer, boss.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(accounts.enable(reviewer, boss.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect((await row(boss.id)).status).toBe('ACTIVE');
    });
  });

  describe('forced password reset', () => {
    it('ends every session and requires a change; with a temporary password it replaces the old one', async () => {
      const boss = await newAccount('p-boss', Role.ADMIN);
      await newAccount('p-target', Role.EDITOR);
      const session = await auth.login(email('p-target'), PASSWORD);
      const targetId = session.admin.id;

      const reset = await accounts.requirePasswordReset(boss, targetId, TEMP);
      expect(reset.mustChangePassword).toBe(true);
      expect(await activeTokens(targetId)).toBe(0);
      await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      // the old access token still resolves to the account, but now carries the pending change
      expect(
        (await auth.authenticate(session.accessToken)).passwordChangeRequired,
      ).toBe(true);
      await expect(
        auth.login(email('p-target'), PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(auth.login(email('p-target'), TEMP)).resolves.toBeDefined();
      expect((await events(targetId)).at(-1)).toEqual({
        action: 'PASSWORD_RESET_REQUIRED',
        actor_admin_id: boss.id,
        from_value: null,
        to_value: 'TEMPORARY_PASSWORD_SET',
      });
    });

    it('hashes the temporary password, enables mustChangePassword and revokes every refresh token', async () => {
      const boss = await newAccount('p-boss2', Role.ADMIN);
      const target = await newAccount('p-hash', Role.EDITOR);
      await auth.login(email('p-hash'), PASSWORD);
      await auth.login(email('p-hash'), PASSWORD);
      expect(await activeTokens(target.id)).toBe(2);
      const before = (await row(target.id)).password_hash;

      await accounts.requirePasswordReset(boss, target.id, TEMP);

      const after = await row(target.id);
      expect(after.password_hash).not.toBe(before);
      expect(after.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(after.password_hash).not.toContain(TEMP);
      expect(after.must_change_password).toBe(true);
      expect(await activeTokens(target.id)).toBe(0);
      const reasons = await dataSource.query(
        `SELECT DISTINCT "revoked_reason" FROM "admin_refresh_tokens" WHERE "admin_id" = $1`,
        [target.id],
      );
      expect(reasons).toEqual([{ revoked_reason: 'PASSWORD_RESET' }]);
      // the old password no longer opens anything; the temporary one only leads to the password change
      await expect(
        auth.login(email('p-hash'), PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      const session = await auth.login(email('p-hash'), TEMP);
      expect(session.admin.passwordChangeRequired).toBe(true);
      expect(JSON.stringify(await events(target.id))).not.toContain(TEMP);
    });

    it('rejects a weak temporary password before touching anything, and your own account', async () => {
      const boss = await newAccount('p-boss3', Role.ADMIN);
      const target = await newAccount('p-weak', Role.EDITOR);
      await expect(
        accounts.requirePasswordReset(boss, target.id, 'short'),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect((await row(target.id)).must_change_password).toBe(false);
      await expect(
        accounts.requirePasswordReset(boss, boss.id, TEMP),
      ).rejects.toBeInstanceOf(ConflictError);
      const editor = await newAccount('p-editor', Role.EDITOR);
      await expect(
        accounts.requirePasswordReset(editor, target.id, TEMP),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('changing your own password', () => {
    it('checks the current password, applies the policy, clears the flag and ends every other session', async () => {
      await newAccount('s-self', Role.EDITOR, true);
      const session = await auth.login(email('s-self'), PASSWORD);
      const other = await auth.login(email('s-self'), PASSWORD);
      const me = session.admin;
      expect(await activeTokens(me.id)).toBe(2);

      await expect(
        accounts.changeOwnPassword(
          me.id,
          'wrong-password-1',
          'brand-new-password-1',
        ),
      ).rejects.toThrow('The current password is incorrect');
      await expect(
        accounts.changeOwnPassword(me.id, PASSWORD, 'short'),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      await expect(
        accounts.changeOwnPassword(me.id, PASSWORD, PASSWORD),
      ).rejects.toThrow('must be different');
      expect(await activeTokens(me.id)).toBe(2); // nothing changed by the failures
      expect((await row(me.id)).must_change_password).toBe(true);

      const changed = await accounts.changeOwnPassword(
        me.id,
        PASSWORD,
        'brand-new-password-1',
      );
      expect(changed.passwordChangeRequired).toBeUndefined();
      expect(await activeTokens(me.id)).toBe(0);
      await expect(auth.refresh(other.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      await expect(
        auth.login(email('s-self'), PASSWORD),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      const again = await auth.login(email('s-self'), 'brand-new-password-1');
      expect(again.admin.passwordChangeRequired).toBeUndefined();
      expect((await row(me.id)).must_change_password).toBe(false);
      expect((await events(me.id)).at(-1)).toEqual({
        action: 'PASSWORD_CHANGED',
        actor_admin_id: me.id,
        from_value: null,
        to_value: null,
      });
    });

    it('is refused for a disabled account', async () => {
      const boss = await newAccount('s-boss', Role.ADMIN);
      const target = await newAccount('s-disabled', Role.EDITOR);
      await accounts.disable(boss, target.id);
      await expect(
        accounts.changeOwnPassword(target.id, PASSWORD, 'brand-new-password-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('the last active ADMIN', () => {
    it('two ADMINs trying to disable each other at once: exactly one wins and an active ADMIN remains', async () => {
      const a = await newAccount('x-a', Role.ADMIN);
      const b = await newAccount('x-b', Role.ADMIN);
      // other ADMINs may exist in this database; what matters is that these two never both go
      const results = await Promise.allSettled([
        accounts.disable(a, b.id),
        accounts.disable(b, a.id),
      ]);
      const won = results.filter((r) => r.status === 'fulfilled');
      expect(won).toHaveLength(1);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
          .reason,
      ).toBeInstanceOf(ForbiddenError);
      const statuses = [
        (await row(a.id)).status,
        (await row(b.id)).status,
      ].sort((x, y) => x.localeCompare(y));
      expect(statuses).toEqual(['ACTIVE', 'DISABLED']);
    });

    it('two ADMINs demoting each other at once: exactly one wins', async () => {
      const a = await newAccount('x-c', Role.ADMIN);
      const b = await newAccount('x-d', Role.ADMIN);
      const results = await Promise.allSettled([
        accounts.changeRole(a, b.id, Role.EDITOR),
        accounts.changeRole(b, a.id, Role.EDITOR),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const roles = [(await row(a.id)).role, (await row(b.id)).role].sort(
        (x, y) => x.localeCompare(y),
      );
      expect(roles).toEqual(['ADMIN', 'EDITOR']);
    });

    it('many concurrent operations on one account leave a consistent state and one audit row each', async () => {
      const boss = await newAccount('x-boss', Role.ADMIN);
      const target = await newAccount('x-target', Role.EDITOR);
      const outcomes = await Promise.allSettled([
        accounts.disable(boss, target.id),
        accounts.disable(boss, target.id),
        accounts.changeRole(boss, target.id, Role.REVIEWER),
        accounts.requirePasswordReset(boss, target.id, TEMP),
      ]);
      expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
      const log = (await events(target.id)).map(
        (e: { action: string }) => e.action,
      );
      expect(log.filter((a: string) => a === 'ACCOUNT_DISABLED')).toHaveLength(
        1,
      ); // the second was a no-op
      expect((await row(target.id)).status).toBe('DISABLED');
    });
  });

  describe('the audit trail', () => {
    it('is append-only: the database rejects updates, deletes and truncates', async () => {
      const boss = await newAccount('a-boss', Role.ADMIN);
      const created = await accounts.create(boss, {
        email: email('a-new'),
        role: Role.EDITOR,
        temporaryPassword: TEMP,
      });
      for (const statement of [
        `UPDATE "admin_account_events" SET "to_value" = 'ADMIN' WHERE "subject_admin_id" = '${created.id}'`,
        `DELETE FROM "admin_account_events" WHERE "subject_admin_id" = '${created.id}'`,
        `TRUNCATE "admin_account_events"`,
      ]) {
        await expect(dataSource.query(statement)).rejects.toMatchObject({
          code: '23000',
        });
      }
      expect(await events(created.id)).toHaveLength(1);
    });

    it('is read back newest first and never carries a secret', async () => {
      const boss = await newAccount('a-boss2', Role.ADMIN);
      const target = await newAccount('a-target', Role.EDITOR);
      await accounts.changeRole(boss, target.id, Role.REVIEWER);
      await accounts.disable(boss, target.id);
      const history = await accounts.listEvents(target.id, 10, 0);
      expect(history.items.map((e) => e.action)).toEqual([
        'ACCOUNT_DISABLED',
        'ROLE_CHANGED',
      ]);
      expect(history.total).toBe(2);
      expect(JSON.stringify(history)).not.toMatch(
        /argon2|password_hash|passwordHash/i,
      );
    });

    it('rejects an invalid role change record at the database level', async () => {
      const boss = await newAccount('a-boss3', Role.ADMIN);
      await expect(
        dataSource.query(
          `INSERT INTO "admin_account_events" ("subject_admin_id","actor_admin_id","action","from_value","to_value")
           VALUES ($1,$1,'ROLE_CHANGED','EDITOR','EDITOR')`,
          [boss.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('sessions racing with revocation', () => {
    /**
     * A transaction that behaves like a revocation (it locks the admin row and will change the account), while a
     * login that has already checked the password tries to open a session. The session must not be created once the
     * account was disabled or its password changed.
     */
    const loginDuring = async (
      name: string,
      change: (
        adminId: string,
        hold: import('typeorm').QueryRunner,
      ) => Promise<void>,
    ) => {
      const account = await newAccount(name, Role.EDITOR);
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      let login: Promise<unknown> = Promise.resolve();
      try {
        await holder.query(
          `SELECT "id" FROM "admins" WHERE "id" = $1 FOR UPDATE`,
          [account.id],
        );
        login = auth.login(email(name), PASSWORD).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await waitUntilSomeoneWaitsForALock(dataSource);
        await change(account.id, holder);
        await holder.commitTransaction();
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
      }
      return {
        account,
        outcome: (await login) as { value?: unknown; error?: unknown },
      };
    };

    it('a login that raced with a disable is refused and leaves no live token', async () => {
      const { account, outcome } = await loginDuring(
        'w-dis',
        async (id, hold) => {
          await hold.query(
            `UPDATE "admins" SET "status" = 'DISABLED' WHERE "id" = $1`,
            [id],
          );
        },
      );
      expect(outcome.error).toBeInstanceOf(UnauthorizedError);
      expect(await activeTokens(account.id)).toBe(0);
    });

    it('a login that checked the old password while it was being changed is refused and leaves no live token', async () => {
      const { account, outcome } = await loginDuring(
        'w-pw',
        async (id, hold) => {
          await hold.query(
            `UPDATE "admins" SET "password_hash" = $2 WHERE "id" = $1`,
            [id, await hasher.hash('a-different-password-1')],
          );
        },
      );
      expect(outcome.error).toBeInstanceOf(UnauthorizedError);
      expect(await activeTokens(account.id)).toBe(0);
    });

    it('a login that checked the account before a forced reset flagged it is refused', async () => {
      const { account, outcome } = await loginDuring(
        'w-flag',
        async (id, hold) => {
          await hold.query(
            `UPDATE "admins" SET "must_change_password" = true WHERE "id" = $1`,
            [id],
          );
        },
      );
      expect(outcome.error).toBeInstanceOf(UnauthorizedError);
      expect(await activeTokens(account.id)).toBe(0);
    });

    it('a login that raced with nothing relevant still succeeds', async () => {
      const { account, outcome } = await loginDuring(
        'w-ok',
        async () => undefined,
      );
      expect(outcome.error).toBeUndefined();
      expect(await activeTokens(account.id)).toBe(1);
    });

    /**
     * A refresh that already holds the old token's row lock, against a revocation. They contend for the admin row
     * (the revocation holds it, the new token's foreign key needs it), so the database resolves it by aborting one
     * side. Either way the safety property holds: once the revocation has committed, no token is left alive.
     */
    it.each([
      [
        'disable',
        async (boss: AuthenticatedAdmin, id: string) =>
          accounts.disable(boss, id),
      ],
      [
        'forced reset',
        async (boss: AuthenticatedAdmin, id: string) =>
          accounts.requirePasswordReset(boss, id, TEMP),
      ],
    ])(
      'a refresh racing with a %s never leaves a token alive after the revocation committed',
      async (_name, revoke) => {
        const boss = await newAccount(
          `w-boss-${_name.replace(' ', '')}`,
          Role.ADMIN,
        );
        const target = await newAccount(
          `w-race-${_name.replace(' ', '')}`,
          Role.EDITOR,
        );
        const session = await auth.login(target.email, PASSWORD);
        const [old] = await dataSource.query(
          `SELECT "id", "family_id" FROM "admin_refresh_tokens" WHERE "admin_id" = $1 AND "revoked_at" IS NULL`,
          [session.admin.id],
        );
        const holder = dataSource.createQueryRunner();
        await holder.connect();
        await holder.startTransaction();
        let revoking: Promise<unknown> = Promise.resolve();
        try {
          await holder.query(
            `SELECT "id" FROM "admin_refresh_tokens" WHERE "id" = $1 FOR UPDATE`,
            [old.id],
          );
          revoking = revoke(boss, session.admin.id).then(
            () => 'done',
            () => 'failed',
          );
          await waitUntilSomeoneWaitsForALock(dataSource);
          const replacementId = randomUUID();
          await holder.query(
            `INSERT INTO "admin_refresh_tokens" ("id","admin_id","family_id","token_hash","expires_at")
           VALUES ($1,$2,$3,encode(sha256($4::bytea),'hex'),now() + interval '1 day')`,
            [
              replacementId,
              session.admin.id,
              old.family_id,
              Buffer.from(randomUUID()),
            ],
          );
          await holder.query(
            `UPDATE "admin_refresh_tokens" SET "revoked_at" = now(), "revoked_reason" = 'ROTATED', "replaced_by_id" = $2 WHERE "id" = $1`,
            [old.id, replacementId],
          );
          await holder.commitTransaction();
        } catch {
          // the database chose the refresh as the deadlock victim: nothing was issued
        } finally {
          if (holder.isTransactionActive) await holder.rollbackTransaction();
          await holder.release();
        }
        const result = await revoking;
        if (result === 'done')
          expect(await activeTokens(session.admin.id)).toBe(0);
        else expect((await row(session.admin.id)).status).toBe('ACTIVE'); // refused cleanly: nothing half-applied
      },
    );
  });

  it('keeps using the existing refresh-token rotation after a password change', async () => {
    await newAccount('z-rot', Role.EDITOR);
    const first = await auth.login(email('z-rot'), PASSWORD);
    const changed = await accounts.changeOwnPassword(
      first.admin.id,
      PASSWORD,
      'brand-new-password-2',
    );
    const fresh = await auth.startSessionFor(changed);
    const rotated = await auth.refresh(fresh.refreshToken);
    expect(rotated.refreshToken).not.toBe(fresh.refreshToken);
    await expect(auth.refresh(fresh.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    ); // reuse detected
    expect(sessions).toBeDefined();
  });
});

/** Polls until some backend is blocked on a lock (the revocation waiting for the token row). */
async function waitUntilSomeoneWaitsForALock(dataSource: DataSource) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await dataSource.query(
      `SELECT count(*)::int AS "waiting" FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
