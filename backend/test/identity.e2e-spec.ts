import { createHash, randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import {
  CurrentAdmin,
  Role,
  Roles,
  type AuthenticatedAdmin,
} from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';
import { Public } from './../src/platform/public.decorator.js';

// Stand-in protected endpoints. The real admin endpoints do not exist yet, so
// these let the e2e suite exercise the global guards exactly as they will be used.
@Controller('test-probe')
class ProbeController {
  @Get('any')
  any(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return { id: admin.id, role: admin.role };
  }

  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }

  @Roles(Role.EDITOR, Role.REVIEWER)
  @Get('editors-and-reviewers')
  editorsAndReviewers() {
    return { ok: true };
  }

  @Public()
  @Get('public')
  open() {
    return { public: true };
  }
}

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-${runId}-${name}${EMAIL_SUFFIX}`;

const COOKIE = 'pd_refresh';
const AUTH = '/api/v1/admin/auth';

interface LoggedIn {
  accessToken: string;
  refreshToken: string;
  body: Record<string, any>;
  setCookie: string;
}

describe('Admin identity (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const accounts: Record<'admin' | 'editor' | 'reviewer', string> = {
    admin: emailFor('admin'),
    editor: emailFor('editor'),
    reviewer: emailFor('reviewer'),
  };

  const http = () => request(app.getHttpServer());

  async function login(email: string, password = PASSWORD): Promise<LoggedIn> {
    const res = await http()
      .post(`${AUTH}/login`)
      .send({ email, password })
      .expect(200);
    return {
      accessToken: res.body.accessToken,
      refreshToken: cookieValue(res.headers['set-cookie']),
      body: res.body,
      setCookie: findCookie(res.headers['set-cookie'])!,
    };
  }

  const refreshWith = (refreshToken: string) =>
    http().post(`${AUTH}/refresh`).set('Cookie', `${COOKIE}=${refreshToken}`);

  const me = (accessToken?: string) => {
    const req = http().get(`${AUTH}/me`);
    return accessToken
      ? req.set('Authorization', `Bearer ${accessToken}`)
      : req;
  };

  const bearer = (path: string, token: string) =>
    http().get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    // Throttling has its own spec; keep it out of the way here.
    process.env.AUTH_RATE_LIMIT = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    await cleanup();

    const provisioning = app.get(AdminProvisioningService);
    await provisioning.create({
      email: accounts.admin,
      password: PASSWORD,
      role: Role.ADMIN,
    });
    await provisioning.create({
      email: accounts.editor,
      password: PASSWORD,
      role: Role.EDITOR,
    });
    await provisioning.create({
      email: accounts.reviewer,
      password: PASSWORD,
      role: Role.REVIEWER,
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const cleanup = () =>
    dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-${runId}-%${EMAIL_SUFFIX}`,
    ]);

  describe('login', () => {
    it('succeeds with valid credentials', async () => {
      const res = await http()
        .post(`${AUTH}/login`)
        .send({ email: accounts.editor, password: PASSWORD })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
        admin: {
          id: expect.any(String),
          email: accounts.editor,
          role: 'EDITOR',
        },
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is case-insensitive about the email', async () => {
      await http()
        .post(`${AUTH}/login`)
        .send({ email: accounts.editor.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it('sets the refresh token as an httpOnly, strict, path-scoped cookie and keeps it out of the body', async () => {
      const { setCookie, body, refreshToken } = await login(accounts.editor);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Strict/i);
      expect(setCookie).toContain('Path=/api/v1/admin/auth');
      expect(setCookie).toMatch(/Expires=/);
      expect(JSON.stringify(body)).not.toContain(refreshToken);
    });

    it('fails with the same generic error for a wrong password and an unknown email', async () => {
      const wrongPassword = await http()
        .post(`${AUTH}/login`)
        .send({ email: accounts.editor, password: 'definitely-wrong-password' })
        .expect(401);
      const unknownEmail = await http()
        .post(`${AUTH}/login`)
        .send({ email: emailFor('nobody'), password: PASSWORD })
        .expect(401);

      const strip = ({
        requestId: _ignored,
        ...rest
      }: Record<string, unknown>) => rest;
      expect(strip(wrongPassword.body)).toEqual(strip(unknownEmail.body));
      expect(strip(wrongPassword.body)).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      });
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
      expect(unknownEmail.headers['set-cookie']).toBeUndefined();
    });

    it('fails the same way for a disabled account', async () => {
      const email = emailFor('disabled');
      await app
        .get(AdminProvisioningService)
        .create({ email, password: PASSWORD, role: Role.EDITOR });
      await dataSource.query(
        `UPDATE "admins" SET "status" = 'DISABLED' WHERE "email" = $1`,
        [email],
      );

      const res = await http()
        .post(`${AUTH}/login`)
        .send({ email, password: PASSWORD })
        .expect(401);
      expect(res.body).toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      });
    });

    it('rejects malformed input with the standard validation error', async () => {
      const res = await http()
        .post(`${AUTH}/login`)
        .send({ email: accounts.editor })
        .expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: [{ field: 'password' }],
      });
      await http()
        .post(`${AUTH}/login`)
        .send({ email: accounts.editor, password: PASSWORD, role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('protected routes and the current admin', () => {
    it('rejects anonymous requests with 401 in the standard error shape', async () => {
      const res = await me().expect(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        requestId: expect.any(String),
      });
      await http().get('/api/v1/test-probe/any').expect(401);
    });

    it('rejects malformed, forged and non-bearer credentials', async () => {
      await me('garbage').expect(401);
      const { accessToken } = await login(accounts.editor);
      const [header, , signature] = accessToken.split('.');
      const forged = Buffer.from(
        JSON.stringify({ sub: randomUUID(), role: 'ADMIN', typ: 'access' }),
      ).toString('base64url');
      await me(`${header}.${forged}.${signature}`).expect(401);
      await http()
        .get(`${AUTH}/me`)
        .set('Authorization', `Basic ${accessToken}`)
        .expect(401);
    });

    it('accepts a valid token and returns only safe admin fields', async () => {
      const { accessToken, body } = await login(accounts.reviewer);
      const res = await me(accessToken).expect(200);
      expect(res.body).toEqual({
        id: body.admin.id,
        email: accounts.reviewer,
        role: 'REVIEWER',
      });
    });

    it('rejects an access token once the account is disabled', async () => {
      const email = emailFor('soon-disabled');
      await app
        .get(AdminProvisioningService)
        .create({ email, password: PASSWORD, role: Role.EDITOR });
      const { accessToken } = await login(email);
      await me(accessToken).expect(200);
      await dataSource.query(
        `UPDATE "admins" SET "status" = 'DISABLED' WHERE "email" = $1`,
        [email],
      );
      await me(accessToken).expect(401);
    });

    it('leaves @Public() routes and health open to anonymous callers', async () => {
      await http().get('/api/v1/test-probe/public').expect(200);
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });

  describe('role guard', () => {
    it('rejects an insufficient role with 403', async () => {
      const { accessToken } = await login(accounts.editor);
      const res = await bearer(
        '/api/v1/test-probe/admin-only',
        accessToken,
      ).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('allows the correct role', async () => {
      const { accessToken } = await login(accounts.admin);
      await bearer('/api/v1/test-probe/admin-only', accessToken).expect(200);
    });

    it('checks every listed role, and ADMIN is not an implicit superuser', async () => {
      const route = '/api/v1/test-probe/editors-and-reviewers';
      await bearer(route, (await login(accounts.editor)).accessToken).expect(
        200,
      );
      await bearer(route, (await login(accounts.reviewer)).accessToken).expect(
        200,
      );
      await bearer(route, (await login(accounts.admin)).accessToken).expect(
        403,
      );
    });

    it('lets any authenticated admin use routes with no role restriction', async () => {
      const { accessToken, body } = await login(accounts.reviewer);
      const res = await bearer('/api/v1/test-probe/any', accessToken).expect(
        200,
      );
      expect(res.body).toEqual({ id: body.admin.id, role: 'REVIEWER' });
    });
  });

  describe('refresh', () => {
    it('issues a new, working access token', async () => {
      const { refreshToken, accessToken } = await login(accounts.editor);
      const res = await refreshWith(refreshToken).expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        admin: { email: accounts.editor, role: 'EDITOR' },
      });
      expect(res.body.accessToken).toBeTruthy();
      await me(res.body.accessToken).expect(200);
      expect(accessToken).toBeTruthy();
    });

    it('rotates the refresh token on every use', async () => {
      const first = await login(accounts.editor);
      const res = await refreshWith(first.refreshToken).expect(200);
      const second = cookieValue(res.headers['set-cookie']);

      expect(second).toBeTruthy();
      expect(second).not.toBe(first.refreshToken);
      await refreshWith(second).expect(200); // the new one works
    });

    it('rejects a reused token and revokes the whole session', async () => {
      const first = await login(accounts.editor);
      const rotated = await refreshWith(first.refreshToken).expect(200);
      const newest = cookieValue(rotated.headers['set-cookie']);

      const replay = await refreshWith(first.refreshToken).expect(401);
      expect(replay.body).toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      });

      // The legitimate holder of the newest token is cut off too.
      await refreshWith(newest).expect(401);
    });

    it('leaves other sessions of the same admin alone', async () => {
      const a = await login(accounts.editor);
      const b = await login(accounts.editor);
      await refreshWith(a.refreshToken).expect(200);
      await refreshWith(a.refreshToken).expect(401); // replay of a's old token
      await refreshWith(b.refreshToken).expect(200);
    });

    it('rejects missing, unknown and access-token values, and clears the cookie', async () => {
      const missing = await http().post(`${AUTH}/refresh`).expect(401);
      expect(findCookie(missing.headers['set-cookie'])).toMatch(/pd_refresh=;/);
      await refreshWith('unknown-token').expect(401);
      const { accessToken } = await login(accounts.editor);
      await refreshWith(accessToken).expect(401);
    });

    it('refuses to refresh once the account is disabled', async () => {
      const email = emailFor('disabled-refresh');
      await app
        .get(AdminProvisioningService)
        .create({ email, password: PASSWORD, role: Role.EDITOR });
      const { refreshToken } = await login(email);
      await dataSource.query(
        `UPDATE "admins" SET "status" = 'DISABLED' WHERE "email" = $1`,
        [email],
      );
      await refreshWith(refreshToken).expect(401);
    });

    it('rejects an expired refresh token', async () => {
      const { refreshToken } = await login(accounts.editor);
      await dataSource.query(
        `UPDATE "admin_refresh_tokens" SET "expires_at" = now() - interval '1 minute' WHERE "token_hash" = $1`,
        [sha256(refreshToken)],
      );
      await refreshWith(refreshToken).expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const { refreshToken } = await login(accounts.editor);

      const res = await http()
        .post(`${AUTH}/logout`)
        .set('Cookie', `${COOKIE}=${refreshToken}`)
        .expect(204);
      expect(findCookie(res.headers['set-cookie'])).toMatch(/pd_refresh=;/);

      await refreshWith(refreshToken).expect(401);
      const [row] = await dataSource.query(
        `SELECT "revoked_reason" FROM "admin_refresh_tokens" WHERE "token_hash" = $1`,
        [sha256(refreshToken)],
      );
      expect(row.revoked_reason).toBe('LOGOUT');
    });

    it('revokes the latest token of a rotated session too', async () => {
      const first = await login(accounts.editor);
      const rotated = await refreshWith(first.refreshToken).expect(200);
      const latest = cookieValue(rotated.headers['set-cookie']);

      await http()
        .post(`${AUTH}/logout`)
        .set('Cookie', `${COOKIE}=${latest}`)
        .expect(204);
      await refreshWith(latest).expect(401);
    });

    it('works without an access token and is harmless without a session', async () => {
      await http().post(`${AUTH}/logout`).expect(204);
      await http()
        .post(`${AUTH}/logout`)
        .set('Cookie', `${COOKIE}=unknown`)
        .expect(204);
    });
  });

  describe('secrets never leak or get stored in the clear', () => {
    it('stores only an argon2id hash of the password', async () => {
      const [row] = await dataSource.query(
        `SELECT "password_hash" FROM "admins" WHERE "email" = $1`,
        [accounts.editor],
      );
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
    });

    it('stores only a SHA-256 hash of the refresh token', async () => {
      const { refreshToken } = await login(accounts.editor);
      const [row] = await dataSource.query(
        `SELECT t::text AS dump, "token_hash" FROM "admin_refresh_tokens" t WHERE "token_hash" = $1`,
        [sha256(refreshToken)],
      );
      expect(row).toBeDefined();
      expect(row.token_hash).not.toBe(refreshToken);
      expect(row.dump).not.toContain(refreshToken);
    });

    it('never returns password hashes, refresh tokens or their hashes in any auth response', async () => {
      const first = await login(accounts.editor);
      const hash = sha256(first.refreshToken);
      const [{ password_hash }] = await dataSource.query(
        `SELECT "password_hash" FROM "admins" WHERE "email" = $1`,
        [accounts.editor],
      );

      const responses = [
        { body: first.body },
        await me(first.accessToken).expect(200),
        await refreshWith(first.refreshToken).expect(200),
        await http()
          .post(`${AUTH}/login`)
          .send({ email: accounts.editor, password: 'wrong-password-1' })
          .expect(401),
        await refreshWith(first.refreshToken).expect(401),
      ];

      for (const { body } of responses) {
        const text = JSON.stringify(body);
        expect(text).not.toContain(password_hash);
        expect(text).not.toContain('argon2');
        expect(text).not.toContain(first.refreshToken);
        expect(text).not.toContain(hash);
        expect(text).not.toMatch(
          /passwordHash|password_hash|tokenHash|token_hash|refreshToken/i,
        );
      }
    });

    it('keeps JWT claims minimal', async () => {
      const { accessToken, body } = await login(accounts.editor);
      const claims = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      );
      expect(Object.keys(claims).sort()).toEqual([
        'aud',
        'exp',
        'iat',
        'iss',
        'role',
        'sub',
        'typ',
      ]);
      expect(claims.sub).toBe(body.admin.id);
      expect(JSON.stringify(claims)).not.toContain(accounts.editor);
    });
  });
});

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function findCookie(header: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith(`${COOKIE}=`));
}

function cookieValue(header: string | string[] | undefined): string {
  return findCookie(header)!
    .split(';')[0]
    .slice(COOKIE.length + 1);
}
