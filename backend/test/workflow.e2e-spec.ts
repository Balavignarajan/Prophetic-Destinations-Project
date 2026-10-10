import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';
import { deleteWorkflowEvents } from './support/workflow-cleanup.js';

// The publishing workflow through the real HTTP API: transitions, role matrix, validation,
// error mapping, history, and the guarantee that review transitions never touch content versions.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-wf-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const COURSES = '/api/v1/admin/courses';
const LESSONS = '/api/v1/admin/lessons';

type Action = 'submit' | 'request-changes' | 'approve';
const ALLOWED: Record<Action, Role[]> = {
  submit: [Role.ADMIN, Role.EDITOR],
  'request-changes': [Role.ADMIN, Role.REVIEWER],
  approve: [Role.ADMIN, Role.REVIEWER],
};
const ALL_ROLES = [Role.ADMIN, Role.EDITOR, Role.REVIEWER];

describe('Publishing workflow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};
  const adminIds: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;
  const wf = (lessonId: string) => `${LESSONS}/${lessonId}/workflow`;

  const act = (
    lessonId: string,
    action: Action,
    role: Role,
    body: object = {},
  ) =>
    http()
      .post(`${wf(lessonId)}/${action}`)
      .set('Authorization', as(role))
      .send(
        action === 'request-changes' ? { note: 'please fix', ...body } : body,
      );

  const newLesson = async (name: string) => {
    const admin = as(Role.ADMIN);
    const course = (
      await http()
        .post(COURSES)
        .set('Authorization', admin)
        .send({ title: title(name) })
        .expect(201)
    ).body;
    const module = (
      await http()
        .post(`${COURSES}/${course.id}/modules`)
        .set('Authorization', admin)
        .send({ title: title(`${name}-module`) })
        .expect(201)
    ).body;
    const lesson = (
      await http()
        .post(`${COURSES}/${course.id}/modules/${module.id}/lessons`)
        .set('Authorization', admin)
        .send({ title: title(`${name}-lesson`), levels: ['BEGINNER'] })
        .expect(201)
    ).body;
    return lesson.id as string;
  };

  const lesson = async (id: string) =>
    (
      await http()
        .get(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200)
    ).body;

  const state = async (id: string, role: Role = Role.ADMIN) =>
    (await http().get(wf(id)).set('Authorization', as(role)).expect(200)).body;

  /** A lesson already in READY_FOR_REVIEW. */
  const submitted = async (name: string) => {
    const id = await newLesson(name);
    await act(id, 'submit', Role.EDITOR).expect(200);
    return id;
  };

  const cleanup = async () => {
    const like = `e2e-${runId}-%`;
    const modules = `SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;
    const owned = `SELECT "id" FROM "lessons" WHERE "module_id" IN (${modules})`;
    await deleteWorkflowEvents(dataSource, owned, [like]);
    await dataSource.query(
      `DELETE FROM "lesson_block_levels" WHERE "lesson_id" IN (${owned})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lesson_blocks" WHERE "lesson_id" IN (${owned})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lesson_levels" WHERE "lesson_id" IN (${owned})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lessons" WHERE "module_id" IN (${modules})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "course_modules" WHERE "course_id" IN (SELECT "id" FROM "courses" WHERE "title" LIKE $1)`,
      [like],
    );
    await dataSource.query(`DELETE FROM "courses" WHERE "title" LIKE $1`, [
      like,
    ]);
    await dataSource.query(
      `DELETE FROM "admin_refresh_tokens" WHERE "admin_id" IN (SELECT "id" FROM "admins" WHERE "email" LIKE $1)`,
      [`e2e-wf-${runId}-%${EMAIL_SUFFIX}`],
    );
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-wf-${runId}-%${EMAIL_SUFFIX}`,
    ]);
  };

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

    for (const role of ALL_ROLES) {
      const created = await app.get(AdminProvisioningService).create({
        email: emailFor(role),
        password: PASSWORD,
        role,
      });
      adminIds[role] = (created as { id: string }).id;
      const res = await http()
        .post('/api/v1/admin/auth/login')
        .send({ email: emailFor(role), password: PASSWORD })
        .expect(200);
      tokens[role] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('runs the full review cycle: submit, request changes, resubmit, approve', async () => {
    const id = await newLesson('cycle');
    expect((await state(id)).status).toBe('DRAFT');

    const submit = await act(id, 'submit', Role.EDITOR).expect(200);
    expect(submit.body).toMatchObject({
      lessonId: id,
      fromStatus: 'DRAFT',
      status: 'READY_FOR_REVIEW',
      event: {
        action: 'SUBMIT_FOR_REVIEW',
        actor: { adminId: adminIds[Role.EDITOR], role: 'EDITOR' },
      },
    });

    const changes = await act(id, 'request-changes', Role.REVIEWER, {
      note: '  needs a summary  ',
    }).expect(200);
    expect(changes.body).toMatchObject({
      status: 'DRAFT',
      event: { note: 'needs a summary' },
    });

    await act(id, 'submit', Role.ADMIN).expect(200);
    const approve = await act(id, 'approve', Role.REVIEWER).expect(200);
    expect(approve.body).toMatchObject({
      fromStatus: 'READY_FOR_REVIEW',
      status: 'APPROVED',
    });
    expect((await state(id)).status).toBe('APPROVED');
    expect((await lesson(id)).status).toBe('APPROVED');
  });

  it('records the history newest first, with actors, roles and notes, and pages it', async () => {
    const id = await newLesson('history');
    await act(id, 'submit', Role.EDITOR).expect(200);
    await act(id, 'request-changes', Role.REVIEWER, { note: 'one' }).expect(
      200,
    );
    await act(id, 'submit', Role.EDITOR).expect(200);
    await act(id, 'approve', Role.ADMIN).expect(200);

    const res = await http()
      .get(`${wf(id)}/events`)
      .set('Authorization', as(Role.EDITOR))
      .expect(200);
    expect(res.body.total).toBe(4);
    expect(res.body.items.map((e: { action: string }) => e.action)).toEqual([
      'APPROVE',
      'SUBMIT_FOR_REVIEW',
      'REQUEST_CHANGES',
      'SUBMIT_FOR_REVIEW',
    ]);
    expect(res.body.items[0].actor).toEqual({
      adminId: adminIds[Role.ADMIN],
      role: 'ADMIN',
    });
    expect(res.body.items[2]).toMatchObject({
      note: 'one',
      actor: { role: 'REVIEWER' },
    });
    expect(res.body.items[1].createdAt).toEqual(expect.any(String));

    const page = await http()
      .get(`${wf(id)}/events?limit=2&offset=1`)
      .set('Authorization', as(Role.REVIEWER))
      .expect(200);
    expect(page.body).toMatchObject({ total: 4, limit: 2, offset: 1 });
    expect(page.body.items.map((e: { id: string }) => e.id)).toEqual(
      res.body.items.slice(1, 3).map((e: { id: string }) => e.id),
    );

    await http()
      .get(`${wf(id)}/events?limit=0`)
      .set('Authorization', as(Role.ADMIN))
      .expect(400);
    await http()
      .get(`${wf(id)}/events?limit=101`)
      .set('Authorization', as(Role.ADMIN))
      .expect(400);
    await http()
      .get(`${wf(id)}/events?offset=-1`)
      .set('Authorization', as(Role.ADMIN))
      .expect(400);
  });

  describe('role matrix', () => {
    for (const action of Object.keys(ALLOWED) as Action[]) {
      for (const role of ALL_ROLES) {
        const allowed = ALLOWED[action].includes(role);
        it(`${role} ${allowed ? 'may' : 'may not'} ${action}`, async () => {
          const id = await newLesson(`role-${action}-${role}`.toLowerCase());
          if (action !== 'submit')
            await act(id, 'submit', Role.ADMIN).expect(200);
          const before = await state(id);

          const res = await act(id, action, role);
          if (allowed) {
            expect(res.status).toBe(200);
          } else {
            expect(res.status).toBe(403);
            expect(await state(id)).toEqual(before); // nothing changed, nothing recorded
          }
        });
      }
    }

    it('every role can read state, history and readiness', async () => {
      const id = await newLesson('read-roles');
      for (const role of ALL_ROLES) {
        await http().get(wf(id)).set('Authorization', as(role)).expect(200);
        await http()
          .get(`${wf(id)}/events`)
          .set('Authorization', as(role))
          .expect(200);
        await http()
          .get(`${LESSONS}/${id}/readiness`)
          .set('Authorization', as(role))
          .expect(200);
      }
    });

    it('rejects anonymous callers and bad tokens on every route', async () => {
      const id = await newLesson('anonymous');
      const routes: Array<[string, string]> = [
        ['get', wf(id)],
        ['get', `${wf(id)}/events`],
        ['get', `${LESSONS}/${id}/readiness`],
        ['post', `${wf(id)}/submit`],
        ['post', `${wf(id)}/request-changes`],
        ['post', `${wf(id)}/approve`],
      ];
      for (const [method, url] of routes) {
        await (http() as any)[method](url).expect(401);
        await (http() as any)
          [method](url)
          .set('Authorization', 'Bearer not-a-token')
          .expect(401);
      }
      expect((await state(id)).status).toBe('DRAFT');
    });
  });

  describe('request-changes note', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['blank', '   \n\t '],
      ['not a string', 42],
      ['too long', 'x'.repeat(2001)],
    ])(
      'rejects a %s note with 400 and changes nothing',
      async (_label, note) => {
        const id = await submitted('note-invalid');
        const body = note === undefined ? {} : { note };
        const res = await http()
          .post(`${wf(id)}/request-changes`)
          .set('Authorization', as(Role.REVIEWER))
          .send(body)
          .expect(400);
        expect(res.body.error?.code ?? res.body.code).toBe('VALIDATION_FAILED');
        expect((await state(id)).status).toBe('READY_FOR_REVIEW');
      },
    );

    it('accepts the longest allowed note', async () => {
      const id = await submitted('note-max');
      await act(id, 'request-changes', Role.REVIEWER, {
        note: 'x'.repeat(2000),
      }).expect(200);
    });

    it('rejects a note-less request-changes before checking the lesson status, but a draft is still refused with a valid note', async () => {
      const id = await newLesson('note-draft');
      await act(id, 'request-changes', Role.REVIEWER, { note: 'valid' }).expect(
        409,
      );
    });

    it('rejects unknown properties and invalid expectedContentRevision', async () => {
      const id = await newLesson('body-invalid');
      await act(id, 'submit', Role.EDITOR, { status: 'APPROVED' }).expect(400);
      await act(id, 'submit', Role.EDITOR, {
        expectedContentRevision: 0,
      }).expect(400);
      await act(id, 'submit', Role.EDITOR, {
        expectedContentRevision: 'one',
      }).expect(400);
      expect((await state(id)).status).toBe('DRAFT');
    });
  });

  describe('invalid transitions', () => {
    const cases: Array<[string, Action, () => Promise<string>]> = [
      ['approve a draft', 'approve', () => newLesson('inv-approve-draft')],
      [
        'request changes on a draft',
        'request-changes',
        () => newLesson('inv-changes-draft'),
      ],
      ['submit twice', 'submit', () => submitted('inv-submit-twice')],
      [
        'submit an approved lesson',
        'submit',
        async () => {
          const id = await submitted('inv-submit-approved');
          await act(id, 'approve', Role.REVIEWER).expect(200);
          return id;
        },
      ],
      [
        'approve twice',
        'approve',
        async () => {
          const id = await submitted('inv-approve-twice');
          await act(id, 'approve', Role.REVIEWER).expect(200);
          return id;
        },
      ],
      [
        'request changes on an approved lesson',
        'request-changes',
        async () => {
          const id = await submitted('inv-changes-approved');
          await act(id, 'approve', Role.REVIEWER).expect(200);
          return id;
        },
      ],
    ];

    it.each(cases)(
      '%s → 409 with details, nothing recorded',
      async (_label, action, prepare) => {
        const id = await prepare();
        const before = await http()
          .get(`${wf(id)}/events`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200);
        const res = await act(id, action, Role.ADMIN).expect(409);
        expect(res.body.error?.code ?? res.body.code).toBeDefined();
        expect(JSON.stringify(res.body)).toMatch(/allowedFrom/);
        const after = await http()
          .get(`${wf(id)}/events`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200);
        expect(after.body.total).toBe(before.body.total);
      },
    );
  });

  describe('missing and malformed lessons', () => {
    it('returns 404 for an unknown lesson on every route', async () => {
      const id = randomUUID();
      await http().get(wf(id)).set('Authorization', as(Role.ADMIN)).expect(404);
      await http()
        .get(`${wf(id)}/events`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      await http()
        .get(`${LESSONS}/${id}/readiness`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      await act(id, 'submit', Role.ADMIN).expect(404);
      await act(id, 'approve', Role.ADMIN).expect(404);
      await act(id, 'request-changes', Role.ADMIN).expect(404);
    });

    it('returns 400 for a malformed lesson id', async () => {
      await http()
        .get(wf('not-a-uuid'))
        .set('Authorization', as(Role.ADMIN))
        .expect(400);
      await act('not-a-uuid', 'submit', Role.ADMIN).expect(400);
    });

    it('checks the role before the lesson exists (403, not 404)', async () => {
      await act(randomUUID(), 'approve', Role.EDITOR).expect(403);
    });
  });

  describe('content revision and editing', () => {
    it('expectedContentRevision must match the current revision', async () => {
      const id = await newLesson('expected-revision');
      const { contentRevision } = await lesson(id);
      await act(id, 'submit', Role.EDITOR, {
        expectedContentRevision: contentRevision + 1,
      }).expect(409);
      expect((await state(id)).status).toBe('DRAFT');
      await act(id, 'submit', Role.EDITOR, {
        expectedContentRevision: contentRevision,
      }).expect(200);
    });

    it('workflow transitions never change lesson version or content revision', async () => {
      const id = await newLesson('versions');
      const before = await lesson(id);
      await act(id, 'submit', Role.EDITOR).expect(200);
      await act(id, 'request-changes', Role.REVIEWER, { note: 'again' }).expect(
        200,
      );
      await act(id, 'submit', Role.EDITOR).expect(200);
      await act(id, 'approve', Role.REVIEWER).expect(200);
      await act(id, 'approve', Role.REVIEWER).expect(409); // rejected attempts change nothing either

      const after = await lesson(id);
      expect(after.version).toBe(before.version);
      expect(after.contentRevision).toBe(before.contentRevision);
      expect(after.status).toBe('APPROVED');
    });

    it('editing an approved lesson resets it to draft and a later approval is refused', async () => {
      const id = await submitted('edit-after-approval');
      await act(id, 'approve', Role.REVIEWER).expect(200);
      const approvedAt = await lesson(id);

      await http()
        .patch(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.EDITOR))
        .send({
          subtitle: 'changed after approval',
          version: approvedAt.version,
        })
        .expect(200);

      const edited = await lesson(id);
      expect(edited.status).toBe('DRAFT');
      expect(edited.contentRevision).toBe(approvedAt.contentRevision + 1);
      await act(id, 'approve', Role.REVIEWER).expect(409);

      // the full cycle has to be repeated, and the approval event keeps the revision it approved
      await act(id, 'submit', Role.EDITOR).expect(200);
      await act(id, 'approve', Role.REVIEWER).expect(200);
      const events = (
        await http()
          .get(`${wf(id)}/events`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      const revisions = events.items
        .filter((e: { action: string }) => e.action === 'APPROVE')
        .map((e: { contentRevision: number }) => e.contentRevision);
      expect(revisions).toEqual([
        edited.contentRevision,
        approvedAt.contentRevision,
      ]);
    });
  });

  describe('concurrency', () => {
    it('simultaneous approvals: one 200, the rest 409, one event', async () => {
      const id = await submitted('race-approve');
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          act(id, 'approve', i % 2 ? Role.ADMIN : Role.REVIEWER),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      const events = (
        await http()
          .get(`${wf(id)}/events`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      expect(
        events.items.filter((e: { action: string }) => e.action === 'APPROVE'),
      ).toHaveLength(1);
    });

    it('simultaneous submissions: one 200, the rest 409', async () => {
      const id = await newLesson('race-submit');
      const results = await Promise.all(
        Array.from({ length: 5 }, () => act(id, 'submit', Role.EDITOR)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    });

    it('approving while an edit commits: the edit always leaves a draft, and history agrees with the order', async () => {
      const id = await submitted('race-edit');
      const start = await lesson(id);

      const [approval, edit] = await Promise.all([
        act(id, 'approve', Role.REVIEWER, {
          expectedContentRevision: start.contentRevision,
        }),
        http()
          .patch(`${LESSONS}/${id}`)
          .set('Authorization', as(Role.EDITOR))
          .send({ subtitle: 'edited during review' }),
      ]);

      expect(edit.status).toBe(200);
      const end = await lesson(id);
      expect(end.status).toBe('DRAFT');
      expect(end.contentRevision).toBe(start.contentRevision + 1);
      const events = (
        await http()
          .get(`${wf(id)}/events`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      const approvals = events.items.filter(
        (e: { action: string }) => e.action === 'APPROVE',
      );
      if (approval.status === 200) {
        expect(approvals).toHaveLength(1); // approved first, then reset by the edit
        expect(approvals[0].contentRevision).toBe(start.contentRevision);
      } else {
        expect(approval.status).toBe(409); // the edit came first: nothing approved
        expect(approvals).toHaveLength(0);
      }
    });

    it('approve against request-changes: exactly one wins and the state agrees with the history', async () => {
      const id = await submitted('race-mixed');
      const results = await Promise.all([
        act(id, 'approve', Role.REVIEWER),
        act(id, 'request-changes', Role.REVIEWER, { note: 'no' }),
        act(id, 'approve', Role.ADMIN),
        act(id, 'request-changes', Role.ADMIN, { note: 'nope' }),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      const current = await state(id);
      expect(current.status).toBe(current.latestEvent.toStatus);
    });
  });

  describe('workflow state', () => {
    it('lists only the actions the caller may take from the current status', async () => {
      const id = await newLesson('allowed');
      const allowed = async (role: Role) =>
        (await state(id, role)).allowedActions;

      expect(await allowed(Role.EDITOR)).toEqual(['SUBMIT_FOR_REVIEW']);
      expect(await allowed(Role.REVIEWER)).toEqual([]);
      expect(await allowed(Role.ADMIN)).toEqual(['SUBMIT_FOR_REVIEW']);

      await act(id, 'submit', Role.EDITOR).expect(200);
      expect(await allowed(Role.EDITOR)).toEqual([]);
      expect(
        [...(await allowed(Role.REVIEWER))].sort((a: string, b: string) =>
          a.localeCompare(b),
        ),
      ).toEqual(['APPROVE', 'REQUEST_CHANGES']);
      expect(
        [...(await allowed(Role.ADMIN))].sort((a: string, b: string) =>
          a.localeCompare(b),
        ),
      ).toEqual(['APPROVE', 'REQUEST_CHANGES']);

      await act(id, 'approve', Role.REVIEWER).expect(200);
      for (const role of ALL_ROLES) expect(await allowed(role)).toEqual([]); // publishing is not available yet
    });

    it('describes the latest event and is not cacheable', async () => {
      const id = await newLesson('state-shape');
      const fresh = await http()
        .get(wf(id))
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
      expect(fresh.body).toMatchObject({
        lessonId: id,
        status: 'DRAFT',
        latestEvent: null,
      });
      expect(fresh.headers['cache-control']).toMatch(/no-store/);

      await act(id, 'submit', Role.EDITOR).expect(200);
      const next = await state(id);
      expect(next.latestEvent).toMatchObject({
        action: 'SUBMIT_FOR_REVIEW',
        toStatus: 'READY_FOR_REVIEW',
      });
      expect(next.contentRevision).toBe((await lesson(id)).contentRevision);
    });
  });

  describe('scope guards (nothing from later slices)', () => {
    it('has no publish, unpublish or history-deletion endpoints', async () => {
      const id = await submitted('no-publish');
      await act(id, 'approve', Role.ADMIN).expect(200);
      for (const path of ['publish', 'unpublish']) {
        await http()
          .post(`${wf(id)}/${path}`)
          .set('Authorization', as(Role.ADMIN))
          .send({})
          .expect(404);
      }
      await http()
        .delete(`${wf(id)}/events`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      await http()
        .delete(wf(id))
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      await http()
        .get(`${LESSONS}/${id}/publications`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      expect((await state(id)).status).toBe('APPROVED');
    });

    it('a lesson with workflow history cannot be deleted (409) and stays intact', async () => {
      const id = await submitted('delete-guard');
      const res = await http()
        .delete(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.ADMIN));
      expect(res.status).toBe(409);
      expect((await lesson(id)).status).toBe('READY_FOR_REVIEW');
    });

    it('a lesson without history can still be deleted', async () => {
      const id = await newLesson('delete-clean');
      await http()
        .delete(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });
  });

  describe('stale review', () => {
    it('an approval that expected an older content revision is refused', async () => {
      const id = await submitted('stale-approval');
      const start = await lesson(id);
      await http()
        .patch(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.EDITOR))
        .send({ subtitle: 'changed under the reviewer' })
        .expect(200); // resets to DRAFT, revision + 1

      await act(id, 'approve', Role.REVIEWER, {
        expectedContentRevision: start.contentRevision,
      }).expect(409);
      expect((await lesson(id)).status).toBe('DRAFT');
    });

    it('the delete refusal names the retained history', async () => {
      const id = await submitted('delete-message');
      const res = await http()
        .delete(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(409);
      expect(JSON.stringify(res.body)).toMatch(
        /workflow or publication history/,
      );
    });
  });

  describe('readiness (advisory)', () => {
    it('reports without changing the lesson or its history', async () => {
      const id = await newLesson('readiness');
      const before = await lesson(id);
      const res = await http()
        .get(`${LESSONS}/${id}/readiness`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(200);
      expect(typeof res.body.ready).toBe('boolean');
      expect(Array.isArray(res.body.issues)).toBe(true);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(await lesson(id)).toEqual(before);
      expect((await state(id)).latestEvent).toBeNull();
    });

    it('does not gate the review transitions (it is advisory until publish time)', async () => {
      const id = await newLesson('readiness-not-gating');
      await act(id, 'submit', Role.EDITOR).expect(200);
    });
  });

  describe('health', () => {
    it('still reports healthy', async () => {
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });
});
