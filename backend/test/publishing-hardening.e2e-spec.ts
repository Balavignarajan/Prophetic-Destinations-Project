import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';
import { deleteWorkflowHistory } from './support/workflow-cleanup.js';

// Hardening through the real HTTP API: the 10 second lock timeout (as a controlled 409), the consistency
// report, and a full lifecycle (publish, edit, review, approve, republish, unpublish) that must leave
// every lesson consistent.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-hard-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const COURSES = '/api/v1/admin/courses';
const LESSONS = '/api/v1/admin/lessons';
const CONSISTENCY = '/api/v1/admin/publishing/consistency';
const ALL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

describe('Publishing hardening (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};
  const ownLessons = new Set<string>();

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;
  const wf = (id: string) => `${LESSONS}/${id}/workflow`;

  const act = (id: string, action: string, role: Role, body: object = {}) =>
    http()
      .post(`${wf(id)}/${action}`)
      .set('Authorization', as(role))
      .send(body);

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
        .send({ title: title(`${name}-lesson`), levels: ALL_LEVELS })
        .expect(201)
    ).body;
    const block = (
      await http()
        .post(`${LESSONS}/${lesson.id}/blocks`)
        .set('Authorization', admin)
        .send({
          type: 'RICH_TEXT',
          sharedContent: rich(`text of ${name}`),
          levels: ALL_LEVELS,
        })
        .expect(201)
    ).body;
    ownLessons.add(lesson.id);
    return { lessonId: lesson.id as string, blockId: block.id as string };
  };

  const approve = async (id: string) => {
    await act(id, 'submit', Role.EDITOR).expect(200);
    await act(id, 'approve', Role.REVIEWER).expect(200);
  };

  const state = async (id: string) =>
    (await http().get(wf(id)).set('Authorization', as(Role.ADMIN)).expect(200))
      .body;

  const edit = (id: string, body: object) =>
    http()
      .patch(`${LESSONS}/${id}`)
      .set('Authorization', as(Role.EDITOR))
      .send(body);

  /** The consistency report, restricted to this suite's lessons (other suites share the database). */
  const ownIssues = async (verify = true) => {
    const res = await http()
      .get(`${CONSISTENCY}?verifySnapshots=${verify}&limit=1000`)
      .set('Authorization', as(Role.ADMIN))
      .expect(200);
    return (res.body.issues as { lessonId: string }[]).filter((issue) =>
      ownLessons.has(issue.lessonId),
    );
  };

  const cleanup = async () => {
    const like = `e2e-${runId}-%`;
    const modules = `SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;
    const owned = `SELECT "id" FROM "lessons" WHERE "module_id" IN (${modules})`;
    await deleteWorkflowHistory(dataSource, owned, [like]);
    for (const table of [
      'lesson_block_levels',
      'lesson_blocks',
      'lesson_levels',
    ]) {
      await dataSource.query(
        `DELETE FROM "${table}" WHERE "lesson_id" IN (${owned})`,
        [like],
      );
    }
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
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-hard-${runId}-%${EMAIL_SUFFIX}`,
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

    for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
      await app.get(AdminProvisioningService).create({
        email: emailFor(role),
        password: PASSWORD,
        role,
      });
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

  describe('lock timeout', () => {
    it('a transition that cannot get the lesson lock within 10 seconds is a controlled, retryable 409, and changes nothing', async () => {
      const { lessonId } = await newLesson('lock-timeout');
      await approve(lessonId);
      const before = await state(lessonId);

      // someone else is holding the lesson row (an authoring write in progress)
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      await holder.query(
        `SELECT "id" FROM "lessons" WHERE "id" = $1 FOR UPDATE`,
        [lessonId],
      );
      let res: request.Response;
      const started = Date.now();
      try {
        res = await act(lessonId, 'publish', Role.ADMIN);
      } finally {
        await holder.rollbackTransaction();
        await holder.release();
      }
      const waited = Date.now() - started;

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        details: { reason: 'LOCK_TIMEOUT', retryable: true },
      });
      expect(waited).toBeGreaterThanOrEqual(9_500); // the approved 10 second timeout
      expect(waited).toBeLessThan(25_000);
      // nothing about the database or the server leaks
      expect(JSON.stringify(res.body)).not.toMatch(
        /postgres|canceling statement|lock timeout|SELECT|FOR UPDATE|relation|stack|\bat\s+\S+\.(ts|js)/i,
      );
      expect(Object.keys(res.body).sort()).toEqual(
        ['code', 'details', 'message', 'requestId', 'statusCode'].sort(),
      );

      // nothing changed, and the same request works once the lock is gone
      expect(await state(lessonId)).toEqual(before);
      await act(lessonId, 'publish', Role.ADMIN).expect(200);
    }, 60_000);

    it('a quick edit that holds the lock only briefly does not make a transition fail', async () => {
      const { lessonId, blockId } = await newLesson('lock-brief');
      await approve(lessonId);
      const results = await Promise.all([
        http()
          .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
          .set('Authorization', as(Role.EDITOR))
          .send({ sharedContent: rich('changed meanwhile') }),
        act(lessonId, 'publish', Role.ADMIN),
      ]);
      expect(results[0].status).toBe(200);
      expect([200, 409]).toContain(results[1].status);
      if (results[1].status === 409) {
        // the edit won: the lesson is a draft again and the refusal is the ordinary state conflict, not a timeout
        expect(results[1].body.details?.reason).not.toBe('LOCK_TIMEOUT');
      }
      expect((await ownIssues()).length).toBe(0);
    });
  });

  describe('consistency report', () => {
    it('is ADMIN only', async () => {
      await http().get(CONSISTENCY).expect(401);
      await http()
        .get(CONSISTENCY)
        .set('Authorization', 'Bearer nope')
        .expect(401);
      await http()
        .get(CONSISTENCY)
        .set('Authorization', as(Role.EDITOR))
        .expect(403);
      await http()
        .get(CONSISTENCY)
        .set('Authorization', as(Role.REVIEWER))
        .expect(403);
      await http()
        .get(CONSISTENCY)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
    });

    it('has a stable shape, is read-only and is not cacheable', async () => {
      const { lessonId } = await newLesson('report-shape');
      await approve(lessonId);
      await act(lessonId, 'publish', Role.ADMIN).expect(200);
      const before = await state(lessonId);

      const res = await http()
        .get(`${CONSISTENCY}?verifySnapshots=true`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);

      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect(res.body).toEqual(
        expect.objectContaining({
          consistent: expect.any(Boolean),
          limitPerCheck: 100,
          snapshotsVerified: true,
          truncated: expect.any(Boolean),
          issues: expect.any(Array),
        }),
      );
      expect(await state(lessonId)).toEqual(before);
    });

    it('validates its query', async () => {
      const get = (query: string) =>
        http()
          .get(`${CONSISTENCY}${query}`)
          .set('Authorization', as(Role.ADMIN));
      await get('?limit=0').expect(400);
      await get('?limit=1001').expect(400);
      await get('?limit=abc').expect(400);
      await get('?verifySnapshots=maybe').expect(400);
      await get('?limit=5&verifySnapshots=false').expect(200);
    });
  });

  describe('a whole lifecycle stays consistent', () => {
    it('publish, edit, review, approve, republish and every kind of unpublish', async () => {
      const { lessonId, blockId } = await newLesson('lifecycle');
      const expectClean = async (label: string) =>
        expect(await ownIssues(), label).toEqual([]);

      await approve(lessonId);
      await act(lessonId, 'publish', Role.ADMIN).expect(200); // v1, PUBLISHED
      await expectClean('published');

      // the four states a working copy can be in while v1 is active
      await edit(lessonId, { subtitle: 'edit 1' }).expect(200); // DRAFT, v1 active
      expect((await state(lessonId)).status).toBe('DRAFT');
      expect((await state(lessonId)).activePublication.version).toBe(1);
      await expectClean('draft with older publication');

      await act(lessonId, 'submit', Role.EDITOR).expect(200); // READY_FOR_REVIEW, v1 active
      expect((await state(lessonId)).activePublication.version).toBe(1);
      await expectClean('in review with older publication');

      await act(lessonId, 'approve', Role.REVIEWER).expect(200); // APPROVED, v1 active
      expect((await state(lessonId)).activePublication.version).toBe(1);
      await expectClean('approved with older publication');

      // an effective edit invalidates the approval; a no-op does not
      const revision = (await state(lessonId)).contentRevision;
      await http()
        .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.EDITOR))
        .send({ sharedContent: rich('text of lifecycle') }) // same content: a no-op
        .expect(200);
      expect(await state(lessonId)).toMatchObject({
        status: 'APPROVED',
        contentRevision: revision,
      });
      await http()
        .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.EDITOR))
        .send({ sharedContent: rich('second version') })
        .expect(200);
      expect(await state(lessonId)).toMatchObject({
        status: 'DRAFT',
        contentRevision: revision + 1,
      });
      await act(lessonId, 'approve', Role.REVIEWER).expect(409);
      await approve(lessonId);

      const v2 = await act(lessonId, 'publish', Role.ADMIN).expect(200); // supersedes v1
      expect(v2.body).toMatchObject({
        supersededVersion: 1,
        publication: { version: 2 },
      });
      await expectClean('republished');

      await act(lessonId, 'unpublish', Role.ADMIN).expect(200); // PUBLISHED -> APPROVED
      expect((await state(lessonId)).status).toBe('APPROVED');
      expect((await state(lessonId)).activePublication).toBeNull();
      await act(lessonId, 'publish', Role.ADMIN).expect(200); // v3
      await edit(lessonId, { subtitle: 'edit 2' }).expect(200); // DRAFT, v3 active
      await act(lessonId, 'unpublish', Role.ADMIN).expect(200); // DRAFT preserved
      expect((await state(lessonId)).status).toBe('DRAFT');
      await expectClean('end of the walk');

      const history = (
        await http()
          .get(`${LESSONS}/${lessonId}/publications`)
          .set('Authorization', as(Role.REVIEWER))
          .expect(200)
      ).body;
      expect(history.items.map((p: { version: number }) => p.version)).toEqual([
        3, 2, 1,
      ]);
      expect(
        history.items.map((p: { endedReason: string }) => p.endedReason),
      ).toEqual(['UNPUBLISHED', 'UNPUBLISHED', 'SUPERSEDED']);
    }, 120_000);

    it('concurrent publish, unpublish and authoring requests never leave an inconsistent lesson', async () => {
      const { lessonId, blockId } = await newLesson('lifecycle-storm');
      await approve(lessonId);
      await act(lessonId, 'publish', Role.ADMIN).expect(200);

      const burst = () =>
        Promise.all([
          act(lessonId, 'unpublish', Role.ADMIN),
          act(lessonId, 'publish', Role.ADMIN),
          act(lessonId, 'unpublish', Role.ADMIN),
          http()
            .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
            .set('Authorization', as(Role.EDITOR))
            .send({ sharedContent: rich(`burst ${Math.random()}`) }),
          act(lessonId, 'submit', Role.EDITOR),
          act(lessonId, 'approve', Role.REVIEWER),
        ]);

      for (let round = 0; round < 2; round += 1) {
        const responses = await burst();
        for (const res of responses) {
          expect([200, 409]).toContain(res.status); // never a 500
        }
        const current = await state(lessonId);
        if (current.status === 'PUBLISHED') {
          expect(current.activePublication).not.toBeNull();
        }
        expect(await ownIssues()).toEqual([]);
        // bring it back to a publishable state for the next round
        if (current.status === 'DRAFT')
          await act(lessonId, 'submit', Role.EDITOR);
        if ((await state(lessonId)).status === 'READY_FOR_REVIEW') {
          await act(lessonId, 'approve', Role.REVIEWER);
        }
      }
    }, 60_000);
  });

  it('keeps health public', async () => {
    await http().get('/health').expect(200);
    await http().get('/health/db').expect(200);
  });
});
