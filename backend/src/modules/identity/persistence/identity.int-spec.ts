import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../domain/refresh-token.js';
import { Role } from '../domain/role.js';
import { IdentityModule } from '../identity.module.js';
import { AdminRepository } from './admin.repository.js';
import { RefreshTokenRepository } from './refresh-token.repository.js';

// Integration: real repositories against the real database (see .env).
// Every row created here uses an @test.invalid email and is deleted afterwards.
const EMAIL_SUFFIX = '@int-test.invalid';
const runId = randomUUID().slice(0, 8);
const email = (name: string) => `int-${runId}-${name}${EMAIL_SUFFIX}`;

describe('identity persistence (integration)', () => {
  let dataSource: DataSource;
  let admins: AdminRepository;
  let tokens: RefreshTokenRepository;
  let closeModule: () => Promise<void>;

  const cleanup = () =>
    dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `int-%${EMAIL_SUFFIX}`,
    ]);

  const newAdmin = (name: string, role: Role = Role.EDITOR) =>
    admins.create({ email: email(name), passwordHash: '$argon2id$fake', role });

  const newToken = async (adminId: string, familyId = randomUUID()) => {
    const raw = generateRefreshToken();
    const id = randomUUID();
    await tokens.insert({
      id,
      adminId,
      familyId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
    });
    return { id, raw, familyId, hash: hashRefreshToken(raw) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, IdentityModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    admins = moduleRef.get(AdminRepository, { strict: false });
    tokens = moduleRef.get(RefreshTokenRepository, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('admins', () => {
    it('creates and finds an admin, returning a plain domain object', async () => {
      const created = await newAdmin('basic', Role.REVIEWER);
      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email: email('basic'),
        passwordHash: '$argon2id$fake',
        role: 'REVIEWER',
        status: 'ACTIVE',
      });
      expect(await admins.findByEmail(email('basic'))).toEqual(created);
      expect(await admins.findById(created.id)).toEqual(created);
    });

    it('returns null for unknown admins', async () => {
      expect(await admins.findByEmail(email('missing'))).toBeNull();
      expect(await admins.findById(randomUUID())).toBeNull();
    });

    it('starts at version 1 with timestamps set', async () => {
      const created = await newAdmin('meta');
      const [row] = await dataSource.query(
        `SELECT "version", "created_at", "updated_at" FROM "admins" WHERE "id" = $1`,
        [created.id],
      );
      expect(row.version).toBe(1);
      expect(row.created_at).toBeInstanceOf(Date);
      expect(row.updated_at).toBeInstanceOf(Date);
    });

    it('rejects a duplicate email with a ConflictError', async () => {
      await newAdmin('dup');
      await expect(newAdmin('dup')).rejects.toBeInstanceOf(ConflictError);
    });

    it('enforces unique email in the database, not just in code', async () => {
      await newAdmin('dbunique');
      await expect(
        dataSource.query(
          `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'x','ADMIN')`,
          [email('dbunique')],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('enforces normalized emails in the database', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'x','ADMIN')`,
          [`Int-${runId}-Upper${EMAIL_SUFFIX}`],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('enforces the fixed role and status values in the database', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'x','ROOT')`,
          [email('badrole')],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        dataSource.query(
          `INSERT INTO "admins" ("email","password_hash","role","status") VALUES ($1,'x','ADMIN','BANNED')`,
          [email('badstatus')],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('refresh tokens', () => {
    it('stores and finds a token by its hash only', async () => {
      const admin = await newAdmin('rt-basic');
      const token = await newToken(admin.id);

      const found = await tokens.findByHash(token.hash);
      expect(found).toMatchObject({
        id: token.id,
        adminId: admin.id,
        familyId: token.familyId,
        tokenHash: token.hash,
        revokedAt: null,
        revokedReason: null,
        replacedById: null,
      });
      expect(await tokens.findByHash(hashRefreshToken('other'))).toBeNull();
    });

    it('never stores the raw token anywhere in the row', async () => {
      const admin = await newAdmin('rt-raw');
      const token = await newToken(admin.id);
      const [row] = await dataSource.query(
        `SELECT t::text AS dump FROM "admin_refresh_tokens" t WHERE "id" = $1`,
        [token.id],
      );
      expect(row.dump).not.toContain(token.raw);
      expect(row.dump).toContain(token.hash);
    });

    it('enforces a unique token hash', async () => {
      const admin = await newAdmin('rt-unique');
      const token = await newToken(admin.id);
      await expect(
        tokens.insert({
          id: randomUUID(),
          adminId: admin.id,
          familyId: randomUUID(),
          tokenHash: token.hash,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });

    it('requires an existing admin', async () => {
      await expect(newToken(randomUUID())).rejects.toMatchObject({
        driverError: { code: '23503' },
      });
    });

    it('revokes a whole family, only once, and keeps the first reason', async () => {
      const admin = await newAdmin('rt-family');
      const familyId = randomUUID();
      const first = await newToken(admin.id, familyId);
      const second = await newToken(admin.id, familyId);
      const otherSession = await newToken(admin.id);

      await dataSource.transaction((manager) =>
        tokens.markRotated(first.id, second.id, new Date(), manager),
      );
      const revoked = await tokens.revokeFamily(
        familyId,
        'REUSE_DETECTED',
        new Date(),
      );
      expect(revoked).toBe(1); // only `second` was still active

      expect(await tokens.findByHash(first.hash)).toMatchObject({
        revokedReason: 'ROTATED',
        replacedById: second.id,
      });
      expect(await tokens.findByHash(second.hash)).toMatchObject({
        revokedReason: 'REUSE_DETECTED',
      });
      expect(
        (await tokens.findByHash(otherSession.hash))?.revokedAt,
      ).toBeNull();
      expect(await tokens.revokeFamily(familyId, 'LOGOUT', new Date())).toBe(0);
    });

    it('revokes every session of an admin', async () => {
      const admin = await newAdmin('rt-all');
      const a = await newToken(admin.id);
      const b = await newToken(admin.id);
      expect(
        await tokens.revokeAllForAdmin(
          admin.id,
          'ACCOUNT_DISABLED',
          new Date(),
        ),
      ).toBe(2);
      expect((await tokens.findByHash(a.hash))?.revokedReason).toBe(
        'ACCOUNT_DISABLED',
      );
      expect((await tokens.findByHash(b.hash))?.revokedReason).toBe(
        'ACCOUNT_DISABLED',
      );
    });

    it('rejects a revocation with a missing reason (database check)', async () => {
      const admin = await newAdmin('rt-check');
      const token = await newToken(admin.id);
      await expect(
        dataSource.query(
          `UPDATE "admin_refresh_tokens" SET "revoked_at" = now() WHERE "id" = $1`,
          [token.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        dataSource.query(
          `UPDATE "admin_refresh_tokens" SET "revoked_at" = now(), "revoked_reason" = 'WHATEVER' WHERE "id" = $1`,
          [token.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('locks the row for update inside a transaction', async () => {
      const admin = await newAdmin('rt-lock');
      const token = await newToken(admin.id);
      const found = await dataSource.transaction((manager) =>
        tokens.findByHashForUpdate(token.hash, manager),
      );
      expect(found?.id).toBe(token.id);
    });

    it('is deleted together with its admin', async () => {
      const admin = await newAdmin('rt-cascade');
      const token = await newToken(admin.id);
      await dataSource.query(`DELETE FROM "admins" WHERE "id" = $1`, [
        admin.id,
      ]);
      expect(await tokens.findByHash(token.hash)).toBeNull();
    });
  });
});
