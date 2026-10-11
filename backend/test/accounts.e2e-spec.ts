import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';
import { deleteAccountHistory } from './support/account-cleanup.js';

// Admin account management over HTTP: who may call it, validation, the temporary-password flow, forced resets,
// disabling (with immediate effect on sessions), role changes, self-protection and the audit trail.

const PASSWORD = 'e2e-test-password-123';
const TEMP = 'temporary-password-123';
const NEXT = 'brand-new-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-acct-${runId}-${name}${EMAIL_SUFFIX}`;
const COOKIE = 'pd_refresh';
const API = '/api/v1';
const AUTH = `${API}/admin/auth`;
const ACCOUNTS = `${API}/admin/accounts`;
const MISSING = '3f1b8b6e-7c1d-4a52-9d2e-0a1b2c3d4e5f';
const SECRET = /argon2|passwordHash|password_hash|temporaryPassword|refresh/i;

interface Session {
  accessToken: string;
  refreshCookie: string;
  body: Record<string, any>;
}

describe('Admin account management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const sessions: Record<string, Session> = {};
  const ids: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const bearer = (session: Session) => `Bearer ${session.accessToken}`;
  const as = (name: string) => bearer(sessions[name]);

  const login = async (
    email: string,
    password: string,
  ): Promise<request.Response> =>
    http().post(`${AUTH}/login`).send({ email, password });

  const sessionOf = (res: request.Response): Session => {
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (line) => line.startsWith(`${COOKIE}=`),
    )!;
    return {
      accessToken: res.body.accessToken,
      refreshCookie: cookie.split(';')[0],
      body: res.body,
    };
  };

  const signIn = async (email: string, password: string) =>
    sessionOf(
      await login(email, password).then((r) => (r.status === 200 ? r : r)),
    );

  const refresh = (session: Session) =>
    http().post(`${AUTH}/refresh`).set('Cookie', session.refreshCookie);

  const create = (name: string, role: string, as_ = 'admin') =>
    http()
      .post(ACCOUNTS)
      .set('Authorization', as(as_))
      .send({ email: emailFor(name), role, temporaryPassword: TEMP });

  const cleanup = () =>
    deleteAccountHistory(dataSource, `e2e-acct-${runId}-%${EMAIL_SUFFIX}`);

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    await cleanup();

    for (const [name, role] of [
      ['admin', Role.ADMIN],
      ['admin2', Role.ADMIN],
      ['editor', Role.EDITOR],
      ['reviewer', Role.REVIEWER],
    ] as const) {
      const created = await app.get(AdminProvisioningService).create({
        email: emailFor(name),
        password: PASSWORD,
        role,
      });
      ids[name] = (created as { id: string }).id;
      sessions[name] = await signIn(emailFor(name), PASSWORD);
    }
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('who may call it', () => {
    const routes: [string, string, object?][] = [
      ['get', ACCOUNTS],
      [
        'post',
        ACCOUNTS,
        {
          email: 'x@e2e-test.invalid',
          role: 'EDITOR',
          temporaryPassword: TEMP,
        },
      ],
      ['get', `${ACCOUNTS}/${MISSING}`],
      ['get', `${ACCOUNTS}/${MISSING}/events`],
      ['put', `${ACCOUNTS}/${MISSING}/role`, { role: 'ADMIN' }],
      ['post', `${ACCOUNTS}/${MISSING}/disable`, {}],
      ['post', `${ACCOUNTS}/${MISSING}/enable`, {}],
      [
        'post',
        `${ACCOUNTS}/${MISSING}/password-reset`,
        { temporaryPassword: TEMP },
      ],
    ];

    it('requires authentication on every route', async () => {
      for (const [method, url, body] of routes) {
        await (http() as any)
          [method](url)
          .send(body ?? {})
          .expect(401);
      }
    });

    it('is ADMIN only: EDITOR and REVIEWER get 403 on every route', async () => {
      for (const who of ['editor', 'reviewer']) {
        for (const [method, url, body] of routes) {
          await (http() as any)
            [method](url)
            .set('Authorization', as(who))
            .send(body ?? {})
            .expect(403);
        }
      }
    });

    it('does not let an EDITOR promote themselves, with a body trying to smuggle fields', async () => {
      await http()
        .put(`${ACCOUNTS}/${ids.editor}/role`)
        .set('Authorization', as('editor'))
        .send({ role: 'ADMIN' })
        .expect(403);
      const me = await http()
        .get(`${AUTH}/me`)
        .set('Authorization', as('editor'))
        .expect(200);
      expect(me.body.role).toBe('EDITOR');
    });
  });

  describe('validation', () => {
    it('rejects malformed input with 400 and unknown account ids with 404', async () => {
      const admin = as('admin');
      await http()
        .get(`${ACCOUNTS}/not-a-uuid`)
        .set('Authorization', admin)
        .expect(400);
      await http()
        .put(`${ACCOUNTS}/${ids.editor}/role`)
        .set('Authorization', admin)
        .send({ role: 'OWNER' })
        .expect(400);
      await http()
        .put(`${ACCOUNTS}/${ids.editor}/role`)
        .set('Authorization', admin)
        .send({})
        .expect(400);
      await http()
        .post(ACCOUNTS)
        .set('Authorization', admin)
        .send({ email: emailFor('v'), role: 'EDITOR' })
        .expect(400);
      await http()
        .post(ACCOUNTS)
        .set('Authorization', admin)
        .send({
          email: emailFor('v'),
          role: 'EDITOR',
          temporaryPassword: TEMP,
          passwordHash: 'x',
          status: 'ACTIVE',
        })
        .expect(400); // unknown fields are refused, so nothing can be smuggled in
      await http()
        .get(`${ACCOUNTS}?limit=0`)
        .set('Authorization', admin)
        .expect(400);
      await http()
        .get(`${ACCOUNTS}/${MISSING}`)
        .set('Authorization', admin)
        .expect(404);
      await http()
        .post(`${ACCOUNTS}/${MISSING}/disable`)
        .set('Authorization', admin)
        .send({})
        .expect(404);
    });

    it('applies the password policy and the email rule with 422 and creates nothing', async () => {
      const admin = as('admin');
      const weak = await http()
        .post(ACCOUNTS)
        .set('Authorization', admin)
        .send({
          email: emailFor('weak'),
          role: 'EDITOR',
          temporaryPassword: 'short',
        })
        .expect(422);
      expect(JSON.stringify(weak.body)).not.toContain('short');
      await http()
        .post(ACCOUNTS)
        .set('Authorization', admin)
        .send({ email: 'nope', role: 'EDITOR', temporaryPassword: TEMP })
        .expect(422);
      const list = await http()
        .get(`${ACCOUNTS}?limit=200`)
        .set('Authorization', admin)
        .expect(200);
      expect(
        list.body.items.some(
          (a: { email: string }) => a.email === emailFor('weak'),
        ),
      ).toBe(false);
    });
  });

  describe('creating an account with a temporary password', () => {
    it('creates it, returns no secret, and refuses a duplicate', async () => {
      const res = await create('newbie', 'EDITOR').expect(201);
      expect(Object.keys(res.body).sort((a, b) => a.localeCompare(b))).toEqual([
        'createdAt',
        'email',
        'id',
        'mustChangePassword',
        'role',
        'status',
        'updatedAt',
        'version',
      ]);
      expect(res.body).toMatchObject({
        email: emailFor('newbie'),
        role: 'EDITOR',
        status: 'ACTIVE',
        mustChangePassword: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(SECRET);
      ids.newbie = res.body.id;
      await create('newbie', 'EDITOR').expect(409);

      const list = await http()
        .get(`${ACCOUNTS}?limit=200`)
        .set('Authorization', as('admin'))
        .expect(200);
      expect(JSON.stringify(list.body)).not.toMatch(SECRET);
      expect(list.body.items.map((a: { id: string }) => a.id)).toContain(
        ids.newbie,
      );
      expect(list.headers['cache-control']).toBe('no-store');
      const one = await http()
        .get(`${ACCOUNTS}/${ids.newbie}`)
        .set('Authorization', as('admin'))
        .expect(200);
      expect(one.body.id).toBe(ids.newbie);
    });

    it('must change the temporary password before using anything else, then works normally', async () => {
      const first = await signIn(emailFor('newbie'), TEMP);
      expect(first.body.admin.passwordChangeRequired).toBe(true);
      const me = await http()
        .get(`${AUTH}/me`)
        .set('Authorization', bearer(first))
        .expect(200);
      expect(me.body.passwordChangeRequired).toBe(true);

      // everything else is refused, with a machine-readable reason
      const blocked = await http()
        .get(`${API}/admin/courses`)
        .set('Authorization', bearer(first))
        .expect(403);
      expect(blocked.body.details).toEqual({
        reason: 'PASSWORD_CHANGE_REQUIRED',
      });
      await http()
        .post(`${API}/admin/courses`)
        .set('Authorization', bearer(first))
        .send({ title: 'x' })
        .expect(403);

      // the change itself: wrong current password, weak and unchanged passwords are refused
      const change = (current: string, next: string) =>
        http()
          .post(`${AUTH}/password`)
          .set('Authorization', bearer(first))
          .send({ currentPassword: current, newPassword: next });
      await change('wrong-password-123', NEXT).expect(422);
      await change(TEMP, 'short').expect(422);
      await change(TEMP, TEMP).expect(422);
      await http()
        .post(`${AUTH}/password`)
        .send({ currentPassword: TEMP, newPassword: NEXT })
        .expect(401);

      const ok = await change(TEMP, NEXT).expect(200);
      expect(ok.body.admin.passwordChangeRequired).toBeUndefined();
      expect(JSON.stringify(ok.body)).not.toMatch(/argon2|passwordHash/i);
      const second = sessionOf(ok);
      await http()
        .get(`${API}/admin/courses`)
        .set('Authorization', bearer(second))
        .expect(200);
      expect(
        (
          await http()
            .get(`${AUTH}/me`)
            .set('Authorization', bearer(second))
            .expect(200)
        ).body.passwordChangeRequired,
      ).toBeUndefined();

      // the old session and the old password are gone; the new session rotates normally
      await refresh(first).expect(401);
      await login(emailFor('newbie'), TEMP).then((r) =>
        expect(r.status).toBe(401),
      );
      const rotated = await refresh(second).expect(200);
      expect(rotated.body.accessToken).toBeTruthy();
      sessions.newbie = await signIn(emailFor('newbie'), NEXT);
    });
  });

  describe('roles', () => {
    it('changes a role, and the target feels it on the very next request', async () => {
      await http()
        .post(`${API}/admin/courses`)
        .set('Authorization', as('newbie'))
        .send({ title: `e2e-acct-${runId}-course` })
        .expect(201);
      const res = await http()
        .put(`${ACCOUNTS}/${ids.newbie}/role`)
        .set('Authorization', as('admin'))
        .send({ role: 'REVIEWER' })
        .expect(200);
      expect(res.body.role).toBe('REVIEWER');
      // same access token, new role: a REVIEWER cannot create courses
      await http()
        .post(`${API}/admin/courses`)
        .set('Authorization', as('newbie'))
        .send({ title: 'x' })
        .expect(403);
      await http()
        .get(`${API}/admin/courses`)
        .set('Authorization', as('newbie'))
        .expect(200);
    });

    it('cannot change your own role', async () => {
      await http()
        .put(`${ACCOUNTS}/${ids.admin}/role`)
        .set('Authorization', as('admin'))
        .send({ role: 'EDITOR' })
        .expect(409);
      expect(
        (
          await http()
            .get(`${AUTH}/me`)
            .set('Authorization', as('admin'))
            .expect(200)
        ).body.role,
      ).toBe('ADMIN');
    });
  });

  describe('disabling and enabling', () => {
    it('disables with immediate effect on access and refresh tokens, and re-enables', async () => {
      await create('victim', 'EDITOR').expect(201);
      const victim = await signIn(emailFor('victim'), TEMP);
      await http()
        .get(`${AUTH}/me`)
        .set('Authorization', bearer(victim))
        .expect(200);

      const res = await http()
        .post(`${ACCOUNTS}/${await accountId('victim')}/disable`)
        .set('Authorization', as('admin'))
        .send({})
        .expect(200);
      expect(res.body.status).toBe('DISABLED');
      await http()
        .get(`${AUTH}/me`)
        .set('Authorization', bearer(victim))
        .expect(401);
      await refresh(victim).expect(401);
      await login(emailFor('victim'), TEMP).then((r) =>
        expect(r.status).toBe(401),
      );

      const id = await accountId('victim');
      await http()
        .post(`${ACCOUNTS}/${id}/enable`)
        .set('Authorization', as('admin'))
        .send({})
        .expect(200);
      await login(emailFor('victim'), TEMP).then((r) =>
        expect(r.status).toBe(200),
      );
    });

    it('cannot disable your own account, and the last ADMIN is never lost', async () => {
      await http()
        .post(`${ACCOUNTS}/${ids.admin}/disable`)
        .set('Authorization', as('admin'))
        .send({})
        .expect(409);
      // two ADMINs trying to disable each other at once: exactly one succeeds
      const results = await Promise.all([
        http()
          .post(`${ACCOUNTS}/${ids.admin2}/disable`)
          .set('Authorization', as('admin'))
          .send({}),
        http()
          .post(`${ACCOUNTS}/${ids.admin}/disable`)
          .set('Authorization', as('admin2'))
          .send({}),
      ]);
      // exactly one wins; the other is stopped either by the authentication guard (401: its account was already
      // disabled when the request arrived) or by the in-transaction check (403: disabled while it was running)
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses[0]).toBe(200);
      expect([401, 403]).toContain(statuses[1]);
      const active = await dataSource.query(
        `SELECT count(*)::int AS "n" FROM "admins" WHERE "id" = ANY($1::uuid[]) AND "status" = 'ACTIVE'`,
        [[ids.admin, ids.admin2]],
      );
      expect(active[0].n).toBe(1);
      // put things back for the remaining tests
      const survivor = results[0].status === 200 ? 'admin' : 'admin2';
      const other = survivor === 'admin' ? 'admin2' : 'admin';
      await http()
        .post(`${ACCOUNTS}/${ids[other]}/enable`)
        .set('Authorization', as(survivor))
        .send({})
        .expect(200);
    });
  });

  describe('forced password reset', () => {
    it('ends the sessions and forces a change; with a temporary password it replaces the old one', async () => {
      await create('forced', 'REVIEWER').expect(201);
      const id = await accountId('forced');
      const before = await signIn(emailFor('forced'), TEMP);

      const res = await http()
        .post(`${ACCOUNTS}/${id}/password-reset`)
        .set('Authorization', as('admin'))
        .send({ temporaryPassword: 'another-temp-password-1' })
        .expect(200);
      expect(res.body.mustChangePassword).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(SECRET);
      await refresh(before).expect(401);
      // the existing access token is stopped by the pending change immediately
      await http()
        .get(`${API}/admin/courses`)
        .set('Authorization', bearer(before))
        .expect(403);
      await login(emailFor('forced'), TEMP).then((r) =>
        expect(r.status).toBe(401),
      );
      const after = await signIn(emailFor('forced'), 'another-temp-password-1');
      expect(after.body.admin.passwordChangeRequired).toBe(true);
    });

    it('does not lift the restriction through a token refresh', async () => {
      const pending = await signIn(
        emailFor('forced'),
        'another-temp-password-1',
      );
      const refreshed = await refresh(pending).expect(200);
      expect(refreshed.body.admin.passwordChangeRequired).toBe(true);
      const blocked = await http()
        .get(`${API}/admin/courses`)
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(403);
      expect(blocked.body.details).toEqual({
        reason: 'PASSWORD_CHANGE_REQUIRED',
      });
      await http()
        .get(`${ACCOUNTS}`)
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(403);
    });

    it('requires a temporary password: missing, empty or weak is refused, and so is your own account', async () => {
      const id = await accountId('forced');
      const reset = (body: object, target = id) =>
        http()
          .post(`${ACCOUNTS}/${target}/password-reset`)
          .set('Authorization', as('admin'))
          .send(body);
      await reset({}).expect(400);
      await reset({ temporaryPassword: '' }).expect(400);
      await reset({ temporaryPassword: 'short' }).expect(422);
      await reset({ temporaryPassword: TEMP, extra: 1 }).expect(400);
      await reset({ temporaryPassword: TEMP }, ids.admin).expect(409);
      // none of the refused requests changed the password
      await login(emailFor('forced'), 'another-temp-password-1').then((r) =>
        expect(r.status).toBe(200),
      );
    });
  });

  describe('the audit trail', () => {
    it('records who did what, newest first, without any secret', async () => {
      const id = await accountId('newbie');
      const res = await http()
        .get(`${ACCOUNTS}/${id}/events`)
        .set('Authorization', as('admin'))
        .expect(200);
      expect(res.body.items.map((e: { action: string }) => e.action)).toEqual([
        'ROLE_CHANGED',
        'PASSWORD_CHANGED',
        'ACCOUNT_CREATED',
      ]);
      expect(res.body.items[0]).toMatchObject({
        subjectAdminId: id,
        actorAdminId: ids.admin,
        fromValue: 'EDITOR',
        toValue: 'REVIEWER',
      });
      expect(res.body.items[1]).toMatchObject({
        subjectAdminId: id,
        actorAdminId: id,
      });
      expect(res.body.total).toBe(3);
      expect(JSON.stringify(res.body)).not.toMatch(SECRET);
    });
  });

  /** The id of an account created in these tests, by the short name used in its email. */
  async function accountId(name: string): Promise<string> {
    const rows = await dataSource.query(
      `SELECT "id" FROM "admins" WHERE "email" = $1`,
      [emailFor(name)],
    );
    return rows[0].id as string;
  }
});
