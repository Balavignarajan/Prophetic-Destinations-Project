import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { canonicalJson } from './../src/modules/publishing/domain/snapshot-payload.js';
import { configureApp } from './../src/platform/configure-app.js';
import { deleteWorkflowHistory } from './support/workflow-cleanup.js';

// Publishing and unpublishing through the real HTTP API with the real block registry:
// permissions, transitions, snapshots, history, immutability, republishing, races and errors.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-pub-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const COURSES = '/api/v1/admin/courses';
const LESSONS = '/api/v1/admin/lessons';
const ALL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

describe('Publishing and unpublishing (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;
  const wf = (lessonId: string) => `${LESSONS}/${lessonId}/workflow`;
  const pubs = (lessonId: string) => `${LESSONS}/${lessonId}/publications`;

  const act = (
    lessonId: string,
    action: string,
    role: Role,
    body: object = {},
  ) =>
    http()
      .post(`${wf(lessonId)}/${action}`)
      .set('Authorization', as(role))
      .send(action === 'request-changes' ? { note: 'fix', ...body } : body);

  /** course > module > lesson with one text block visible at the given levels. */
  const newLesson = async (
    name: string,
    levels: string[] = ALL_LEVELS,
    text = `text of ${name}`,
  ) => {
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
        .send({ title: title(`${name}-lesson`), levels })
        .expect(201)
    ).body;
    const block = (
      await http()
        .post(`${LESSONS}/${lesson.id}/blocks`)
        .set('Authorization', admin)
        .send({ type: 'RICH_TEXT', sharedContent: rich(text), levels })
        .expect(201)
    ).body;
    return {
      lessonId: lesson.id as string,
      blockId: block.id as string,
      lessonTitle: title(`${name}-lesson`),
    };
  };

  const approve = async (lessonId: string) => {
    await act(lessonId, 'submit', Role.EDITOR).expect(200);
    await act(lessonId, 'approve', Role.REVIEWER).expect(200);
  };

  /** A lesson that is APPROVED and ready to publish. */
  const approvedLesson = async (name: string, levels = ALL_LEVELS) => {
    const lesson = await newLesson(name, levels);
    await approve(lesson.lessonId);
    return lesson;
  };

  const publish = (lessonId: string, body: object = {}, role = Role.ADMIN) =>
    act(lessonId, 'publish', role, body);
  const unpublish = (lessonId: string, body: object = {}, role = Role.ADMIN) =>
    act(lessonId, 'unpublish', role, body);

  const lesson = async (id: string) =>
    (
      await http()
        .get(`${LESSONS}/${id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200)
    ).body;
  const state = async (id: string, role = Role.ADMIN) =>
    (await http().get(wf(id)).set('Authorization', as(role)).expect(200)).body;
  const history = async (id: string) =>
    (
      await http()
        .get(pubs(id))
        .set('Authorization', as(Role.ADMIN))
        .expect(200)
    ).body;
  const snapshot = async (id: string, version: number, level: string) =>
    (
      await http()
        .get(`${pubs(id)}/${version}/levels/${level}`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(200)
    ).body;

  const edit = (id: string, body: object) =>
    http()
      .patch(`${LESSONS}/${id}`)
      .set('Authorization', as(Role.EDITOR))
      .send(body);

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
      `e2e-pub-${runId}-%${EMAIL_SUFFIX}`,
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

  it('runs the whole path: submit, request changes, resubmit, approve, publish, unpublish, republish', async () => {
    const { lessonId } = await newLesson('whole-path');
    await act(lessonId, 'submit', Role.EDITOR).expect(200);
    await act(lessonId, 'request-changes', Role.REVIEWER, {
      note: 'tighten it',
    }).expect(200);
    await act(lessonId, 'submit', Role.EDITOR).expect(200);
    await act(lessonId, 'approve', Role.REVIEWER).expect(200);

    const published = await publish(lessonId, { note: 'go' }).expect(200);
    expect(published.body).toMatchObject({
      lessonId,
      fromStatus: 'APPROVED',
      status: 'PUBLISHED',
      event: { action: 'PUBLISH', note: 'go', actor: { role: 'ADMIN' } },
      publication: { version: 1, active: true, endedAt: null },
    });
    expect(published.body.event.publicationId).toBe(
      published.body.publication.id,
    );
    expect(
      published.body.publication.levels.map((l: { level: string }) => l.level),
    ).toEqual(ALL_LEVELS);
    expect(published.body.supersededVersion).toBeUndefined();
    expect((await lesson(lessonId)).status).toBe('PUBLISHED');

    const ended = await unpublish(lessonId, { note: 'pause' }).expect(200);
    expect(ended.body).toMatchObject({
      fromStatus: 'PUBLISHED',
      status: 'APPROVED',
      publication: { version: 1, active: false, endedReason: 'UNPUBLISHED' },
    });

    const again = await publish(lessonId).expect(200);
    expect(again.body.publication).toMatchObject({ version: 2, active: true });

    const events = (
      await http()
        .get(`${wf(lessonId)}/events`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(200)
    ).body;
    expect(events.items.map((e: { action: string }) => e.action)).toEqual([
      'PUBLISH',
      'UNPUBLISH',
      'PUBLISH',
      'APPROVE',
      'SUBMIT_FOR_REVIEW',
      'REQUEST_CHANGES',
      'SUBMIT_FOR_REVIEW',
    ]);
    expect(events.items[0].publicationId).toBe(again.body.publication.id);
    expect(events.items[1].publicationId).toBe(published.body.publication.id);
    expect(events.items[3].publicationId).toBeNull();
  });

  describe('permissions', () => {
    it.each([Role.EDITOR, Role.REVIEWER])(
      '%s cannot publish or unpublish (403) and nothing changes',
      async (role) => {
        const { lessonId } = await approvedLesson(`perm-${role}`);
        await publish(lessonId, {}, role).expect(403);
        await unpublish(lessonId, {}, role).expect(403);
        expect((await state(lessonId)).status).toBe('APPROVED');
        expect((await history(lessonId)).total).toBe(0);

        await publish(lessonId).expect(200);
        await unpublish(lessonId, {}, role).expect(403);
        expect((await state(lessonId)).status).toBe('PUBLISHED');
        expect((await history(lessonId)).items[0].active).toBe(true);
      },
    );

    it('rejects anonymous callers and bad tokens on every new route', async () => {
      const { lessonId } = await approvedLesson('perm-anon');
      await publish(lessonId).expect(200);
      const routes: [string, string][] = [
        ['post', `${wf(lessonId)}/publish`],
        ['post', `${wf(lessonId)}/unpublish`],
        ['get', pubs(lessonId)],
        ['get', `${pubs(lessonId)}/1`],
        ['get', `${pubs(lessonId)}/1/levels/BEGINNER`],
      ];
      for (const [method, url] of routes) {
        await (http() as any)[method](url).expect(401);
        await (http() as any)
          [method](url)
          .set('Authorization', 'Bearer nope')
          .expect(401);
      }
      expect((await state(lessonId)).status).toBe('PUBLISHED');
    });

    it('every role can read publication history and snapshots', async () => {
      const { lessonId } = await approvedLesson('perm-read');
      await publish(lessonId).expect(200);
      for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
        await http()
          .get(pubs(lessonId))
          .set('Authorization', as(role))
          .expect(200);
        await http()
          .get(`${pubs(lessonId)}/1`)
          .set('Authorization', as(role))
          .expect(200);
        await http()
          .get(`${pubs(lessonId)}/1/levels/ADVANCED`)
          .set('Authorization', as(role))
          .expect(200);
      }
    });

    it('offers publish and unpublish only to an ADMIN, and only when they apply', async () => {
      const { lessonId } = await approvedLesson('perm-offer');
      expect((await state(lessonId)).allowedActions).toEqual(['PUBLISH']);
      expect((await state(lessonId, Role.EDITOR)).allowedActions).toEqual([]);
      expect((await state(lessonId, Role.REVIEWER)).allowedActions).toEqual([]);

      await publish(lessonId).expect(200);
      expect((await state(lessonId)).allowedActions).toEqual(['UNPUBLISH']);
      expect((await state(lessonId, Role.EDITOR)).allowedActions).toEqual([]);
    });
  });

  describe('invalid states and requests', () => {
    it.each([
      ['a draft', async () => (await newLesson('inv-draft')).lessonId],
      [
        'a lesson in review',
        async () => {
          const { lessonId } = await newLesson('inv-review');
          await act(lessonId, 'submit', Role.EDITOR).expect(200);
          return lessonId;
        },
      ],
      [
        'an already published lesson',
        async () => {
          const { lessonId } = await approvedLesson('inv-published');
          await publish(lessonId).expect(200);
          return lessonId;
        },
      ],
    ])(
      'cannot publish %s (409 with the allowed status)',
      async (_n, prepare) => {
        const lessonId = await prepare();
        const before = (await history(lessonId)).total;
        const res = await publish(lessonId).expect(409);
        expect(JSON.stringify(res.body)).toMatch(/allowedFrom/);
        expect((await history(lessonId)).total).toBe(before);
      },
    );

    it('cannot unpublish a lesson that is not published (409)', async () => {
      const { lessonId } = await approvedLesson('inv-unpublish');
      const res = await unpublish(lessonId).expect(409);
      expect(JSON.stringify(res.body)).toMatch(/no active publication/);
      await publish(lessonId).expect(200);
      await unpublish(lessonId).expect(200);
      await unpublish(lessonId).expect(409); // ended exactly once
      expect((await history(lessonId)).total).toBe(1);
    });

    it('returns 404 for an unknown lesson and 400 for a malformed id', async () => {
      const id = randomUUID();
      await publish(id).expect(404);
      await unpublish(id).expect(404);
      await http()
        .get(pubs(id))
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      await publish('not-a-uuid').expect(400);
      await http()
        .get(pubs('not-a-uuid'))
        .set('Authorization', as(Role.ADMIN))
        .expect(400);
    });

    it('validates the body like the other transitions', async () => {
      const { lessonId } = await approvedLesson('inv-body');
      await publish(lessonId, { status: 'PUBLISHED' }).expect(400);
      await publish(lessonId, { expectedContentRevision: 0 }).expect(400);
      await publish(lessonId, { note: 'x'.repeat(2001) }).expect(400);
      await publish(lessonId, { note: 5 }).expect(400);
      expect((await state(lessonId)).status).toBe('APPROVED');
    });

    it('refuses a stale expected content revision (409)', async () => {
      const { lessonId } = await approvedLesson('inv-stale');
      const { contentRevision } = await lesson(lessonId);
      await publish(lessonId, {
        expectedContentRevision: contentRevision + 1,
      }).expect(409);
      expect((await history(lessonId)).total).toBe(0);
      await publish(lessonId, {
        expectedContentRevision: contentRevision,
      }).expect(200);
    });

    it('handles bad version, level and paging arguments', async () => {
      const { lessonId } = await approvedLesson('inv-args', ['BEGINNER']);
      await publish(lessonId).expect(200);
      const get = (path: string) =>
        http().get(path).set('Authorization', as(Role.ADMIN));
      await get(`${pubs(lessonId)}/abc`).expect(400);
      await get(`${pubs(lessonId)}/0`).expect(404);
      await get(`${pubs(lessonId)}/2`).expect(404);
      await get(`${pubs(lessonId)}/1/levels/EXPERT`).expect(400);
      await get(`${pubs(lessonId)}/1/levels/beginner`).expect(400);
      // a level the lesson is not available at has no snapshot
      await get(`${pubs(lessonId)}/1/levels/ADVANCED`).expect(404);
      await get(`${pubs(lessonId)}?limit=0`).expect(400);
      await get(`${pubs(lessonId)}?limit=101`).expect(400);
      await get(`${pubs(lessonId)}?offset=-1`).expect(400);
    });
  });

  describe('readiness is checked again at publish time', () => {
    it('refuses a lesson with an unfinished block (422 with the full report) and publishes nothing', async () => {
      const { lessonId, blockId } = await newLesson('ready-block');
      await http()
        .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.EDITOR))
        .send({ sharedContent: null })
        .expect(200);
      await approve(lessonId); // review does not require readiness

      const res = await publish(lessonId).expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
      const report = res.body.details.report;
      expect(report.ready).toBe(false);
      expect(
        new Set(
          report.issues
            .filter((i: { code: string }) => i.code === 'BLOCK_NO_CONTENT')
            .map((i: { level: string }) => i.level),
        ),
      ).toEqual(new Set(ALL_LEVELS)); // every level reported, not only the first
      expect((await state(lessonId)).status).toBe('APPROVED');
      expect((await history(lessonId)).total).toBe(0);
      const events = (
        await http()
          .get(`${wf(lessonId)}/events`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      expect(events.items[0].action).toBe('APPROVE'); // no PUBLISH event
    });

    it('refuses a lesson with nothing visible at one level', async () => {
      const { lessonId, blockId } = await newLesson('ready-hidden');
      await http()
        .delete(`${LESSONS}/${lessonId}/blocks/${blockId}/levels/ADVANCED`)
        .set('Authorization', as(Role.EDITOR))
        .expect(200);
      await approve(lessonId);
      const res = await publish(lessonId).expect(422);
      const issues = res.body.details.report.issues;
      expect(issues).toEqual([
        expect.objectContaining({
          code: 'NO_VISIBLE_BLOCKS',
          level: 'ADVANCED',
        }),
      ]);
    });

    it('refuses a lesson without levels', async () => {
      const { lessonId } = await newLesson('ready-no-levels', []);
      await approve(lessonId);
      const res = await publish(lessonId).expect(422);
      expect(
        res.body.details.report.issues.map((i: { code: string }) => i.code),
      ).toContain('LESSON_HAS_NO_LEVELS');
    });

    it('the advisory readiness endpoint agrees and writes nothing', async () => {
      const { lessonId } = await approvedLesson('ready-advisory');
      const report = (
        await http()
          .get(`${LESSONS}/${lessonId}/readiness`)
          .set('Authorization', as(Role.REVIEWER))
          .expect(200)
      ).body;
      expect(report.ready).toBe(true);
      expect((await state(lessonId)).status).toBe('APPROVED');
      await publish(lessonId).expect(200);
    });
  });

  describe('snapshots', () => {
    it('stores one self-contained snapshot per available level, with a matching hash and size', async () => {
      const { lessonId, blockId, lessonTitle } = await approvedLesson('snap');
      const res = await publish(lessonId).expect(200);

      for (const level of res.body.publication.levels as {
        level: string;
        contentHash: string;
        contentBytes: number;
      }[]) {
        const stored = await snapshot(lessonId, 1, level.level);
        expect(stored).toMatchObject({
          lessonId,
          version: 1,
          level: level.level,
          contentHash: level.contentHash,
          contentBytes: level.contentBytes,
        });
        expect(stored.content).toMatchObject({
          schemaVersion: 1,
          level: level.level,
          lesson: { id: lessonId, title: lessonTitle },
          blocks: [
            {
              blockId,
              type: 'RICH_TEXT',
              ordinal: 1,
              source: 'SHARED',
              content: rich('text of snap'),
            },
          ],
        });
        const canonical = canonicalJson(stored.content);
        expect(stored.contentHash).toBe(
          createHash('sha256').update(canonical, 'utf8').digest('hex'),
        );
        expect(stored.contentBytes).toBe(Buffer.byteLength(canonical, 'utf8'));
      }
    });

    it('publishes only the levels the lesson is available at', async () => {
      const { lessonId } = await approvedLesson('snap-subset', [
        'INTERMEDIATE',
      ]);
      const res = await publish(lessonId).expect(200);
      expect(
        res.body.publication.levels.map((l: { level: string }) => l.level),
      ).toEqual(['INTERMEDIATE']);
    });

    it('does not change when the lesson is edited afterwards', async () => {
      const { lessonId, blockId } = await approvedLesson('snap-frozen');
      await publish(lessonId).expect(200);
      const before = await Promise.all(
        ALL_LEVELS.map((level) => snapshot(lessonId, 1, level)),
      );
      const listBefore = await history(lessonId);

      await edit(lessonId, { title: title('snap-frozen-renamed') }).expect(200);
      await http()
        .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.EDITOR))
        .send({ sharedContent: rich('changed after publishing') })
        .expect(200);
      await http()
        .post(`${LESSONS}/${lessonId}/blocks`)
        .set('Authorization', as(Role.EDITOR))
        .send({
          type: 'RICH_TEXT',
          sharedContent: rich('another'),
          levels: ALL_LEVELS,
        })
        .expect(201);
      await http()
        .delete(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.EDITOR))
        .expect(204);

      const after = await Promise.all(
        ALL_LEVELS.map((level) => snapshot(lessonId, 1, level)),
      );
      expect(after).toEqual(before);
      expect(await history(lessonId)).toEqual(listBefore);
      expect(JSON.stringify(after)).not.toContain('changed after publishing');
    });

    it('an edit after publishing leaves the old version active and the lesson a draft', async () => {
      const { lessonId } = await approvedLesson('snap-edit');
      const published = await publish(lessonId).expect(200);
      await edit(lessonId, { subtitle: 'edited' }).expect(200);

      const current = await state(lessonId);
      expect(current.status).toBe('DRAFT');
      expect(current.activePublication).toMatchObject({
        version: 1,
        active: true,
        sourceContentRevision: published.body.contentRevision,
      });
      expect(current.contentRevision).toBe(published.body.contentRevision + 1);
      // the draft can go back into review, and the old version can still be withdrawn
      expect(current.allowedActions).toEqual([
        'SUBMIT_FOR_REVIEW',
        'UNPUBLISH',
      ]);
    });

    it('never changes lesson version or content revision across publish and unpublish', async () => {
      const { lessonId } = await approvedLesson('snap-versions');
      const before = await lesson(lessonId);
      await publish(lessonId).expect(200);
      await unpublish(lessonId).expect(200);
      await publish(lessonId).expect(200);
      const after = await lesson(lessonId);
      expect(after.version).toBe(before.version);
      expect(after.contentRevision).toBe(before.contentRevision);
      expect(after.status).toBe('PUBLISHED');
    });
  });

  describe('unpublishing', () => {
    it('ends the publication once and keeps its snapshots readable', async () => {
      const { lessonId } = await approvedLesson('unpub-keep');
      await publish(lessonId).expect(200);
      const before = await snapshot(lessonId, 1, 'BEGINNER');

      const res = await unpublish(lessonId).expect(200);

      expect(res.body.publication.endedAt).toEqual(expect.any(String));
      const listed = (await history(lessonId)).items[0];
      expect(listed).toMatchObject({
        version: 1,
        active: false,
        endedReason: 'UNPUBLISHED',
      });
      expect(await snapshot(lessonId, 1, 'BEGINNER')).toEqual(before);
      expect((await state(lessonId)).activePublication).toBeNull();
    });

    it('a draft working copy stays a draft while its publication ends', async () => {
      const { lessonId } = await approvedLesson('unpub-draft');
      await publish(lessonId).expect(200);
      await edit(lessonId, { subtitle: 'edited' }).expect(200);
      const revision = (await lesson(lessonId)).contentRevision;

      const res = await unpublish(lessonId).expect(200);

      expect(res.body).toMatchObject({ fromStatus: 'DRAFT', status: 'DRAFT' });
      expect((await lesson(lessonId)).contentRevision).toBe(revision);
      expect((await history(lessonId)).items[0].active).toBe(false);
    });

    // The working copy can be in any status while a publication is active. Unpublishing ends the
    // publication in every case; only PUBLISHED moves (to APPROVED).
    const WORKING_COPY: [string, string][] = [
      ['PUBLISHED', 'APPROVED'],
      ['DRAFT', 'DRAFT'],
      ['READY_FOR_REVIEW', 'READY_FOR_REVIEW'],
      ['APPROVED', 'APPROVED'],
    ];

    /** Publishes a lesson, then brings its working copy to `target` through real edits and reviews. */
    const publishedWith = async (name: string, target: string) => {
      const created = await approvedLesson(name);
      await publish(created.lessonId).expect(200);
      if (target !== 'PUBLISHED') {
        await edit(created.lessonId, {
          subtitle: 'edited after publishing',
        }).expect(200);
        if (target !== 'DRAFT') {
          await act(created.lessonId, 'submit', Role.EDITOR).expect(200);
        }
        if (target === 'APPROVED') {
          await act(created.lessonId, 'approve', Role.REVIEWER).expect(200);
        }
      }
      expect((await lesson(created.lessonId)).status).toBe(target);
      return created;
    };

    const blocksOf = async (lessonId: string) =>
      (
        await http()
          .get(`${LESSONS}/${lessonId}/blocks`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;

    it.each(WORKING_COPY)(
      'a %s working copy: unpublish ends the publication and leaves the working copy %s, untouched',
      async (target, expected) => {
        const { lessonId } = await publishedWith(`unpub-${target}`, target);
        const before = await lesson(lessonId);
        const blocksBefore = await blocksOf(lessonId);
        const snapshotsBefore = await Promise.all(
          ALL_LEVELS.map((level) => snapshot(lessonId, 1, level)),
        );

        const res = await unpublish(lessonId, { note: 'withdrawn' }).expect(
          200,
        );

        expect(res.body).toMatchObject({
          fromStatus: target,
          status: expected,
          contentRevision: before.contentRevision,
          event: {
            action: 'UNPUBLISH',
            fromStatus: target,
            toStatus: expected,
          },
          publication: {
            version: 1,
            active: false,
            endedReason: 'UNPUBLISHED',
          },
        });
        expect(res.body.event.publicationId).toBe(res.body.publication.id);

        // the working copy: same content, same counters; only PUBLISHED -> APPROVED moves
        const after = await lesson(lessonId);
        expect(after.status).toBe(expected);
        expect(after.version).toBe(before.version);
        expect(after.contentRevision).toBe(before.contentRevision);
        expect({ ...after, status: null, updatedAt: null }).toEqual({
          ...before,
          status: null,
          updatedAt: null,
        });
        if (target !== 'PUBLISHED') {
          expect(after.updatedAt).toBe(before.updatedAt); // not even touched
        }
        expect(await blocksOf(lessonId)).toEqual(blocksBefore);

        // the publication history: ended once, snapshots immutable
        const list = await history(lessonId);
        expect(list.total).toBe(1);
        expect(list.items[0]).toMatchObject({
          version: 1,
          active: false,
          endedReason: 'UNPUBLISHED',
        });
        expect(
          await Promise.all(
            ALL_LEVELS.map((level) => snapshot(lessonId, 1, level)),
          ),
        ).toEqual(snapshotsBefore);
        expect((await state(lessonId)).activePublication).toBeNull();

        // nothing left to end
        const again = await unpublish(lessonId).expect(409);
        expect(JSON.stringify(again.body)).toMatch(/no active publication/);
        const events = (
          await http()
            .get(`${wf(lessonId)}/events`)
            .set('Authorization', as(Role.ADMIN))
            .expect(200)
        ).body;
        expect(
          events.items.filter(
            (e: { action: string }) => e.action === 'UNPUBLISH',
          ),
        ).toHaveLength(1);
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy: simultaneous unpublishes end the publication exactly once',
      async (target, expected) => {
        const { lessonId } = await publishedWith(
          `unpub-race-${target}`,
          target,
        );
        const before = await lesson(lessonId);

        const results = await Promise.all(
          Array.from({ length: 4 }, () => unpublish(lessonId)),
        );

        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(results.filter((r) => r.status === 409)).toHaveLength(3);
        const after = await lesson(lessonId);
        expect(after.status).toBe(expected);
        expect(after.version).toBe(before.version);
        expect(after.contentRevision).toBe(before.contentRevision);
        const list = await history(lessonId);
        expect(
          list.items.filter((p: { active: boolean }) => p.active),
        ).toHaveLength(0);
        expect(list.total).toBe(1);
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy: only an ADMIN may unpublish (403), and nothing changes',
      async (target) => {
        const { lessonId } = await publishedWith(
          `unpub-perm-${target}`,
          target,
        );
        const before = await lesson(lessonId);
        await unpublish(lessonId, {}, Role.EDITOR).expect(403);
        await unpublish(lessonId, {}, Role.REVIEWER).expect(403);
        expect(await lesson(lessonId)).toEqual(before);
        expect((await history(lessonId)).items[0].active).toBe(true);
        expect((await state(lessonId)).allowedActions).toContain('UNPUBLISH');
      },
    );

    it('a lesson left in review by an unpublish continues through the workflow and can be republished', async () => {
      const { lessonId } = await publishedWith(
        'unpub-continues',
        'READY_FOR_REVIEW',
      );
      await unpublish(lessonId).expect(200);
      expect((await state(lessonId)).status).toBe('READY_FOR_REVIEW');
      await act(lessonId, 'approve', Role.REVIEWER).expect(200);
      const again = await publish(lessonId).expect(200);
      expect(again.body.publication.version).toBe(2);
      expect(again.body.supersededVersion).toBeUndefined();
    });
  });

  describe('republishing and history', () => {
    it('after an unpublish the next publish is version 2 and version 1 stays as history', async () => {
      const { lessonId } = await approvedLesson('re-unpub');
      await publish(lessonId).expect(200);
      await unpublish(lessonId).expect(200);

      const again = await publish(lessonId).expect(200);
      expect(again.body.publication.version).toBe(2);
      expect(again.body.supersededVersion).toBeUndefined();

      const list = await history(lessonId);
      expect(list.total).toBe(2);
      expect(list.items.map((p: { version: number }) => p.version)).toEqual([
        2, 1,
      ]);
      expect(list.items.map((p: { active: boolean }) => p.active)).toEqual([
        true,
        false,
      ]);
    });

    it('a republish after edit and re-approval supersedes the active version, which keeps the old content', async () => {
      const { lessonId, blockId } = await approvedLesson('re-supersede');
      await publish(lessonId).expect(200);
      await http()
        .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.EDITOR))
        .send({ sharedContent: rich('second version') })
        .expect(200);
      await approve(lessonId);

      const second = await publish(lessonId).expect(200);

      expect(second.body.supersededVersion).toBe(1);
      const list = await history(lessonId);
      expect(list.items[1]).toMatchObject({
        version: 1,
        active: false,
        endedReason: 'SUPERSEDED',
      });
      expect(list.items[0]).toMatchObject({ version: 2, active: true });
      expect(list.items[0].sourceContentRevision).toBe(
        list.items[1].sourceContentRevision + 1, // the block edit; review steps do not count
      );
      expect(JSON.stringify(await snapshot(lessonId, 1, 'BEGINNER'))).toContain(
        'text of re-supersede',
      );
      expect(JSON.stringify(await snapshot(lessonId, 2, 'BEGINNER'))).toContain(
        'second version',
      );
    });

    it('lists newest first with paging', async () => {
      const { lessonId } = await approvedLesson('re-paging');
      for (let i = 0; i < 3; i += 1) {
        await publish(lessonId).expect(200);
        await unpublish(lessonId).expect(200);
      }
      const all = await history(lessonId);
      expect(all.items.map((p: { version: number }) => p.version)).toEqual([
        3, 2, 1,
      ]);
      const page = (
        await http()
          .get(`${pubs(lessonId)}?limit=1&offset=1`)
          .set('Authorization', as(Role.EDITOR))
          .expect(200)
      ).body;
      expect(page).toMatchObject({ total: 3, limit: 1, offset: 1 });
      expect(page.items.map((p: { version: number }) => p.version)).toEqual([
        2,
      ]);
    });
  });

  describe('concurrency', () => {
    it('simultaneous publishes: one 200, the rest 409, a single version', async () => {
      const { lessonId } = await approvedLesson('race-publish');
      const results = await Promise.all(
        Array.from({ length: 5 }, () => publish(lessonId)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      const list = await history(lessonId);
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ version: 1, active: true });
    });

    it('simultaneous republishes after an unpublish create exactly one new version', async () => {
      const { lessonId } = await approvedLesson('race-version');
      await publish(lessonId).expect(200);
      await unpublish(lessonId).expect(200);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => publish(lessonId)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const list = await history(lessonId);
      expect(list.items.map((p: { version: number }) => p.version)).toEqual([
        2, 1,
      ]);
      expect(
        list.items.filter((p: { active: boolean }) => p.active),
      ).toHaveLength(1);
    });

    it('simultaneous unpublishes end the publication exactly once', async () => {
      const { lessonId } = await approvedLesson('race-unpublish');
      await publish(lessonId).expect(200);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => unpublish(lessonId)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    });

    it('an edit racing a publish: the snapshot is never a mix of before and after', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { lessonId, blockId } = await approvedLesson(
          `race-edit-${attempt}`,
        );
        const start = await lesson(lessonId);

        const [published, edited] = await Promise.all([
          publish(lessonId, { expectedContentRevision: start.contentRevision }),
          http()
            .patch(`${LESSONS}/${lessonId}/blocks/${blockId}`)
            .set('Authorization', as(Role.EDITOR))
            .send({ sharedContent: rich('EDITED') }),
        ]);

        expect(edited.status).toBe(200);
        const end = await lesson(lessonId);
        expect(end.status).toBe('DRAFT'); // an edit always leaves a draft, in either order
        const list = await history(lessonId);

        if (published.status === 200) {
          // publish took the lock first: a complete snapshot of the old content
          expect(list.total).toBe(1);
          expect(list.items[0].sourceContentRevision).toBe(
            start.contentRevision,
          );
          for (const level of ALL_LEVELS) {
            const text = JSON.stringify(await snapshot(lessonId, 1, level));
            expect(text).toContain(`text of race-edit-${attempt}`);
            expect(text).not.toContain('EDITED');
          }
        } else {
          // the edit came first: nothing was published
          expect(published.status).toBe(409);
          expect(list.total).toBe(0);
        }
      }
    }, 120_000);
  });

  describe('deletion and the boundaries of this slice', () => {
    it('a lesson with publication history can never be deleted (409), even after unpublishing', async () => {
      const { lessonId, blockId } = await approvedLesson('delete-history');
      await publish(lessonId).expect(200);
      // the blocks are the first thing in the way; remove them so only the history is left
      await http()
        .delete(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
      const remove = () =>
        http()
          .delete(`${LESSONS}/${lessonId}`)
          .set('Authorization', as(Role.ADMIN));

      const res = await remove().expect(409);
      expect(JSON.stringify(res.body)).toMatch(/history/);
      await unpublish(lessonId).expect(200);
      await remove().expect(409);

      expect((await history(lessonId)).total).toBe(1);
      await snapshot(lessonId, 1, 'BEGINNER'); // the snapshot is self-contained: it survives the blocks being deleted
    });

    it('a lesson that was never published is still deletable once it has no blocks or history', async () => {
      const { lessonId, blockId } = await newLesson('delete-clean');
      await http()
        .delete(`${LESSONS}/${lessonId}/blocks/${blockId}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
      await http()
        .delete(`${LESSONS}/${lessonId}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });

    it('exposes no public delivery of lessons, drafts or snapshots', async () => {
      const { lessonId } = await approvedLesson('no-delivery');
      await publish(lessonId).expect(200);
      for (const url of [
        `/api/v1/lessons/${lessonId}`,
        `/api/v1/lessons/${lessonId}/levels/BEGINNER`,
        `/api/v1/public/lessons/${lessonId}`,
        `/api/v1/delivery/lessons/${lessonId}`,
      ]) {
        expect([401, 404]).toContain((await http().get(url)).status);
      }
      // the only way to read a snapshot is the authenticated admin route
      await http()
        .get(`${pubs(lessonId)}/1/levels/BEGINNER`)
        .expect(401);
    });

    it('no endpoint changes or deletes a publication', async () => {
      const { lessonId } = await approvedLesson('immutable-api');
      await publish(lessonId).expect(200);
      for (const [method, url] of [
        ['delete', `${pubs(lessonId)}/1`],
        ['patch', `${pubs(lessonId)}/1`],
        ['put', `${pubs(lessonId)}/1/levels/BEGINNER`],
        ['delete', `${pubs(lessonId)}/1/levels/BEGINNER`],
        ['post', `${pubs(lessonId)}/1/levels/BEGINNER`],
      ] as const) {
        await http()
          [method](url)
          .set('Authorization', as(Role.ADMIN))
          .send({})
          .expect(404);
      }
      expect((await history(lessonId)).total).toBe(1);
    });
  });

  it('keeps health public and unversioned', async () => {
    await http().get('/health').expect(200);
    await http().get('/health/db').expect(200);
  });
});
