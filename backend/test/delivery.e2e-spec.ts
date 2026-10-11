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

// The public learner endpoint, end to end and anonymous: GET /api/v1/lessons/:lessonId?level=
// Content is authored and published through the real admin API; every learner request below
// carries no credentials unless the test says so.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-dlv-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const API = '/api/v1';
const COURSES = `${API}/admin/courses`;
const ADMIN_LESSONS = `${API}/admin/lessons`;
const ALL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const NO_BODY_KEYS = ['code', 'message', 'requestId', 'statusCode'];
/** The strong validator of a published snapshot: only ever sent with a 200 or 304 for that snapshot. */
const SNAPSHOT_ETAG = /^"[0-9a-f]{64}"$/;
const carriesNoSnapshotValidator = (headers: Record<string, unknown>) =>
  expect(typeof headers.etag === 'string' ? headers.etag : '').not.toMatch(
    SNAPSHOT_ETAG,
  );

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

describe('Public lesson delivery (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};
  const adminIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;
  const wf = (id: string) => `${ADMIN_LESSONS}/${id}/workflow`;

  /** The learner request: anonymous, no cookies. */
  const learn = (lessonId: string, level: string, headers: object = {}) =>
    http()
      .get(`${API}/lessons/${lessonId}?level=${level}`)
      .set(headers as Record<string, string>);

  const act = (id: string, action: string, role: Role, body: object = {}) =>
    http()
      .post(`${wf(id)}/${action}`)
      .set('Authorization', as(role))
      .send(body);

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
        .post(`${ADMIN_LESSONS}/${lesson.id}/blocks`)
        .set('Authorization', admin)
        .send({ type: 'RICH_TEXT', sharedContent: rich(text), levels })
        .expect(201)
    ).body;
    return { lessonId: lesson.id as string, blockId: block.id as string };
  };

  const approve = async (id: string) => {
    await act(id, 'submit', Role.EDITOR).expect(200);
    await act(id, 'approve', Role.REVIEWER).expect(200);
  };
  const publish = (id: string) => act(id, 'publish', Role.ADMIN);
  const unpublish = (id: string) => act(id, 'unpublish', Role.ADMIN);

  /** A lesson that is already published at the given levels. */
  const published = async (
    name: string,
    levels: string[] = ALL_LEVELS,
    text?: string,
  ) => {
    const created = await newLesson(name, levels, text);
    await approve(created.lessonId);
    await publish(created.lessonId).expect(200);
    return created;
  };

  const adminSnapshot = async (id: string, version: number, level: string) =>
    (
      await http()
        .get(`${ADMIN_LESSONS}/${id}/publications/${version}/levels/${level}`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(200)
    ).body;

  const editBlock = (lessonId: string, blockId: string, text: string) =>
    http()
      .patch(`${ADMIN_LESSONS}/${lessonId}/blocks/${blockId}`)
      .set('Authorization', as(Role.EDITOR))
      .send({ sharedContent: rich(text) })
      .expect(200);

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
      `e2e-dlv-${runId}-%${EMAIL_SUFFIX}`,
    ]);
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '1000';
    process.env.PUBLIC_RATE_LIMIT = '10000';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    await cleanup();

    for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
      const created = await app.get(AdminProvisioningService).create({
        email: emailFor(role),
        password: PASSWORD,
        role,
      });
      adminIds.push((created as { id: string }).id);
      const res = await http()
        .post(`${API}/admin/auth/login`)
        .send({ email: emailFor(role), password: PASSWORD })
        .expect(200);
      tokens[role] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('a published lesson, anonymously', () => {
    it.each(ALL_LEVELS)(
      'returns the stored %s snapshot in the fixed envelope',
      async (level) => {
        const { lessonId } = await published(`envelope-${level}`);
        const res = await learn(lessonId, level).expect(200);

        // exactly the documented envelope: nothing else
        expect(Object.keys(res.body).sort()).toEqual(
          [
            'contentHash',
            'lessonId',
            'level',
            'publicationVersion',
            'snapshot',
          ].sort(),
        );
        expect(res.body).toMatchObject({
          lessonId,
          level,
          publicationVersion: 1,
        });
        expect(res.body.snapshot).toMatchObject({
          schemaVersion: 1,
          level,
          lesson: { id: lessonId },
          blocks: [{ type: 'RICH_TEXT', ordinal: 1, source: 'SHARED' }],
        });
        expect(res.headers['content-type']).toMatch(/application\/json/);
      },
    );

    it('serves the stored snapshot untouched: identical to what the admin read returns, and its hash verifies', async () => {
      const { lessonId } = await published('untouched');
      for (const level of ALL_LEVELS) {
        const res = await learn(lessonId, level).expect(200);
        const admin = await adminSnapshot(lessonId, 1, level);

        expect(res.body.snapshot).toEqual(admin.content);
        expect(res.body.contentHash).toBe(admin.contentHash);
        // a client can verify the stored hash from the payload it received
        const recomputed = createHash('sha256')
          .update(canonicalJson(res.body.snapshot), 'utf8')
          .digest('hex');
        expect(recomputed).toBe(res.body.contentHash);
      }
    });

    it('is stable: two requests return the same bytes and the same ETag, with nothing time-dependent', async () => {
      const { lessonId } = await published('stable');
      const first = await learn(lessonId, 'BEGINNER').expect(200);
      await new Promise((resolve) => setTimeout(resolve, 1100)); // more than a second of clock difference
      const second = await learn(lessonId, 'BEGINNER').expect(200);

      expect(second.text).toBe(first.text);
      expect(second.headers.etag).toBe(first.headers.etag);
      expect(first.headers['date']).toBeDefined(); // HTTP's own Date header is outside the body
      expect(first.text).not.toMatch(/requestId|generatedAt|timestamp/i);
    });

    it('exposes nothing administrative: no actors, no workflow data, no cookies, no internal ids', async () => {
      const { lessonId } = await published('no-admin-data');
      const res = await learn(lessonId, 'BEGINNER').expect(200);
      const text = res.text;
      for (const id of adminIds) expect(text).not.toContain(id);
      expect(text).not.toMatch(
        /@e2e-test\.invalid|publishedBy|publishedAt|endedAt|workflow|status|actor|contentRevision/,
      );
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('anonymous access and the global guards', () => {
    it('needs no credentials, and ignores any it is given (even invalid ones)', async () => {
      const { lessonId } = await published('anonymous');
      await learn(lessonId, 'BEGINNER').expect(200);
      await learn(lessonId, 'BEGINNER', {
        Authorization: 'Bearer not-a-token',
      }).expect(200);
      await learn(lessonId, 'BEGINNER', {
        Authorization: as(Role.REVIEWER),
      }).expect(200);
    });

    it('does not weaken authentication anywhere else', async () => {
      const { lessonId } = await published('guards-regression');
      for (const [method, url] of [
        ['get', `${ADMIN_LESSONS}/${lessonId}/publications`],
        ['get', `${ADMIN_LESSONS}/${lessonId}/publications/1/levels/BEGINNER`],
        ['get', `${ADMIN_LESSONS}/${lessonId}/workflow`],
        ['get', `${ADMIN_LESSONS}/${lessonId}/workflow/events`],
        ['post', `${ADMIN_LESSONS}/${lessonId}/workflow/unpublish`],
        ['get', `${API}/admin/publishing/consistency`],
        ['get', `${ADMIN_LESSONS}/${lessonId}`],
        ['get', `${ADMIN_LESSONS}/${lessonId}/preview?level=BEGINNER`],
      ] as const) {
        await http()[method](url).expect(401);
      }
      expect((await learn(lessonId, 'BEGINNER')).status).toBe(200);
    });

    it('offers only this one route: no listing, search, catalog, sync, download or writes', async () => {
      const { lessonId } = await published('one-route');
      const anonymousGets = [
        `${API}/lessons`,
        `${API}/lessons?level=BEGINNER`,
        `${API}/lessons/${lessonId}/blocks`,
        `${API}/lessons/${lessonId}/publications`,
        `${API}/lessons/${lessonId}/workflow`,
        `${API}/lessons/${lessonId}/download?level=BEGINNER`,
        `${API}/lessons/search?q=text`,
        `${API}/courses`,
        `${API}/modules`,
        `${API}/catalog`,
        `${API}/sync`,
      ];
      for (const url of anonymousGets) {
        const res = await http().get(url);
        // `/lessons/search` is read as a lesson id and rejected as not a UUID: still no search
        expect([400, 401, 404], url).toContain(res.status);
        expect(res.text, url).not.toMatch(/"snapshot"|"items"|"total"/);
      }
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        const res = await http()
          [method](`${API}/lessons/${lessonId}?level=BEGINNER`)
          .send({});
        expect([401, 404, 405], method).toContain(res.status);
      }
      // and the route itself is unaffected
      await learn(lessonId, 'BEGINNER').expect(200);
    });
  });

  describe('request validation', () => {
    it.each([
      ['a malformed lesson id', 'not-a-uuid', 'BEGINNER'],
      ['a numeric lesson id', '12345', 'BEGINNER'],
      ['an empty-ish lesson id', '00000000-0000-0000-0000', 'BEGINNER'],
    ])('rejects %s with 400', async (_name, id, level) => {
      const res = await learn(id, level).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        requestId: expect.any(String),
      });
    });

    it.each([
      ['no level at all', ''],
      ['an empty level', '?level='],
      ['a lower-case level', '?level=beginner'],
      ['a mixed-case level', '?level=Beginner'],
      ['an unknown level', '?level=EXPERT'],
      ['a padded level', '?level=%20BEGINNER'],
      ['two levels', '?level=BEGINNER&level=ADVANCED'],
      ['an unknown extra parameter', '?level=BEGINNER&draft=true'],
      ['a level and a version', '?level=BEGINNER&version=1'],
      ['an array-style level', '?level[]=BEGINNER'],
    ])('rejects %s with 400', async (_name, query) => {
      const { lessonId } = await published(
        `validation-${Math.random().toString(36).slice(2, 8)}`,
        ['BEGINNER'],
      );
      const res = await http()
        .get(`${API}/lessons/${lessonId}${query}`)
        .expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('accepts the upper-case lesson id and answers with the canonical lower-case one', async () => {
      const { lessonId } = await published('upper-case-id', ['BEGINNER']);
      const res = await learn(lessonId.toUpperCase(), 'BEGINNER').expect(200);
      expect(res.body.lessonId).toBe(lessonId);
      expect(res.body.snapshot.lesson.id).toBe(lessonId);
    });
  });

  describe('what is not published is not found, with one uniform answer', () => {
    const uniform = async (id: string, level: string) => {
      const res = await learn(id, level).expect(404);
      expect(Object.keys(res.body).sort()).toEqual(NO_BODY_KEYS);
      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Lesson not found',
      });
      expect(res.headers['cache-control']).toBe('no-store');
      carriesNoSnapshotValidator(res.headers);
      return res;
    };

    it('a draft that was never published, a lesson in review and an approved lesson', async () => {
      const draft = await newLesson('never-published');
      for (const level of ALL_LEVELS) await uniform(draft.lessonId, level);

      await act(draft.lessonId, 'submit', Role.EDITOR).expect(200);
      await uniform(draft.lessonId, 'BEGINNER');
      await act(draft.lessonId, 'approve', Role.REVIEWER).expect(200);
      for (const level of ALL_LEVELS) await uniform(draft.lessonId, level);
    });

    it('a lesson id that does not exist looks exactly like an unpublished one', async () => {
      const draft = await newLesson('indistinguishable');
      const missing = await uniform(randomUUID(), 'BEGINNER');
      const unpublished = await uniform(draft.lessonId, 'BEGINNER');
      const strip = (body: Record<string, unknown>) => ({
        ...body,
        requestId: undefined,
      });
      expect(strip(unpublished.body)).toEqual(strip(missing.body));
    });

    it('a level the active publication does not have, with no fallback to any other level', async () => {
      const { lessonId } = await published('one-level-only', ['INTERMEDIATE']);
      await learn(lessonId, 'INTERMEDIATE').expect(200);
      await uniform(lessonId, 'BEGINNER');
      await uniform(lessonId, 'ADVANCED');
    });

    it('a level that the lesson gained after publishing is still not available until it is republished', async () => {
      const { lessonId, blockId } = await published('level-added-later', [
        'BEGINNER',
      ]);
      await http()
        .put(`${ADMIN_LESSONS}/${lessonId}/levels`)
        .set('Authorization', as(Role.EDITOR))
        .send({ levels: ['BEGINNER', 'ADVANCED'] })
        .expect(200);
      await http()
        .put(`${ADMIN_LESSONS}/${lessonId}/blocks/${blockId}/levels/ADVANCED`)
        .set('Authorization', as(Role.EDITOR))
        .send({ content: null })
        .expect(200);
      await uniform(lessonId, 'ADVANCED');
      await learn(lessonId, 'BEGINNER').expect(200);
    });

    it('a lesson whose publication has been ended and not replaced', async () => {
      const { lessonId } = await published('withdrawn');
      await learn(lessonId, 'BEGINNER').expect(200);

      await unpublish(lessonId).expect(200);

      for (const level of ALL_LEVELS) await uniform(lessonId, level); // withdrawal is immediate
    });

    it("another lesson's content is never returned for a different lesson id", async () => {
      const one = await published(
        'lesson-one',
        ['BEGINNER'],
        'ONE-SECRET-TEXT',
      );
      const two = await published(
        'lesson-two',
        ['BEGINNER'],
        'TWO-SECRET-TEXT',
      );
      const three = await newLesson(
        'lesson-three-draft',
        ['BEGINNER'],
        'THREE-DRAFT-TEXT',
      );

      const first = await learn(one.lessonId, 'BEGINNER').expect(200);
      const second = await learn(two.lessonId, 'BEGINNER').expect(200);
      expect(first.text).toContain('ONE-SECRET-TEXT');
      expect(first.text).not.toContain('TWO-SECRET-TEXT');
      expect(second.text).toContain('TWO-SECRET-TEXT');
      expect(second.text).not.toContain('ONE-SECRET-TEXT');
      expect(first.body.snapshot.lesson.id).toBe(one.lessonId);
      expect(second.body.snapshot.lesson.id).toBe(two.lessonId);
      await uniform(three.lessonId, 'BEGINNER');
      expect(JSON.stringify([first.body, second.body])).not.toContain(
        'THREE-DRAFT-TEXT',
      );
    });
  });

  describe('editing, withdrawing and republishing', () => {
    it('keeps serving the older publication after an authoring edit, and never shows the working copy', async () => {
      const { lessonId, blockId } = await published(
        'edit-while-published',
        ['BEGINNER'],
        'PUBLISHED-TEXT',
      );
      const before = await learn(lessonId, 'BEGINNER').expect(200);

      await editBlock(lessonId, blockId, 'WORKING-COPY-TEXT');
      await http()
        .patch(`${ADMIN_LESSONS}/${lessonId}`)
        .set('Authorization', as(Role.EDITOR))
        .send({
          title: title('edit-while-published-renamed'),
          subtitle: 'WORKING-COPY-SUBTITLE',
        })
        .expect(200);

      // the working copy is now a draft ...
      const state = (
        await http()
          .get(wf(lessonId))
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      expect(state.status).toBe('DRAFT');
      expect(state.activePublication.version).toBe(1);
      // ... but learners get exactly what was published
      const after = await learn(lessonId, 'BEGINNER').expect(200);
      expect(after.text).toBe(before.text);
      expect(after.headers.etag).toBe(before.headers.etag);
      expect(after.text).toContain('PUBLISHED-TEXT');
      expect(after.text).not.toMatch(/WORKING-COPY|renamed/);
    });

    it('still serves it while the edited working copy is in review or approved', async () => {
      const { lessonId, blockId } = await published(
        'edit-then-review',
        ['BEGINNER'],
        'OLD-TEXT',
      );
      await editBlock(lessonId, blockId, 'NEW-TEXT');
      await act(lessonId, 'submit', Role.EDITOR).expect(200);
      expect((await learn(lessonId, 'BEGINNER').expect(200)).text).toContain(
        'OLD-TEXT',
      );
      await act(lessonId, 'approve', Role.REVIEWER).expect(200);
      const res = await learn(lessonId, 'BEGINNER').expect(200);
      expect(res.text).toContain('OLD-TEXT');
      expect(res.text).not.toContain('NEW-TEXT');
      expect(res.body.publicationVersion).toBe(1);
    });

    it('serves the new snapshot as soon as a new version is published, with a new validator', async () => {
      const { lessonId, blockId } = await published(
        'new-version',
        ['BEGINNER'],
        'VERSION-ONE',
      );
      const v1 = await learn(lessonId, 'BEGINNER').expect(200);

      await editBlock(lessonId, blockId, 'VERSION-TWO');
      await approve(lessonId);
      await publish(lessonId).expect(200);

      const v2 = await learn(lessonId, 'BEGINNER').expect(200);
      expect(v2.body.publicationVersion).toBe(2);
      expect(v2.text).toContain('VERSION-TWO');
      expect(v2.text).not.toContain('VERSION-ONE');
      expect(v2.headers.etag).not.toBe(v1.headers.etag);
      // the old validator no longer matches: the full new response, never a 304
      const stale = await learn(lessonId, 'BEGINNER', {
        'If-None-Match': v1.headers.etag,
      }).expect(200);
      expect(stale.body.publicationVersion).toBe(2);
    });

    it('withdrawing removes access but leaves the historical snapshot exactly as it was', async () => {
      const { lessonId } = await published('withdraw-history');
      const served = await learn(lessonId, 'BEGINNER').expect(200);
      const adminBefore = await adminSnapshot(lessonId, 1, 'BEGINNER');

      await unpublish(lessonId).expect(200);

      await learn(lessonId, 'BEGINNER').expect(404);
      const adminAfter = await adminSnapshot(lessonId, 1, 'BEGINNER');
      expect(adminAfter).toEqual(adminBefore);
      expect(adminAfter.content).toEqual(served.body.snapshot);
      const history = (
        await http()
          .get(`${ADMIN_LESSONS}/${lessonId}/publications`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      expect(history.items[0]).toMatchObject({
        version: 1,
        active: false,
        endedReason: 'UNPUBLISHED',
      });
    });

    it('withdrawing an edited draft working copy also removes access, and the draft is preserved', async () => {
      const { lessonId, blockId } = await published(
        'withdraw-draft',
        ['BEGINNER'],
        'PUBLISHED-TEXT',
      );
      await editBlock(lessonId, blockId, 'DRAFT-TEXT');
      await unpublish(lessonId).expect(200);
      await learn(lessonId, 'BEGINNER').expect(404);
      const state = (
        await http()
          .get(wf(lessonId))
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      expect(state.status).toBe('DRAFT');
    });

    it('republishing after a withdrawal serves again, as a new version with a different validator', async () => {
      const { lessonId } = await published('republish-same');
      const v1 = await learn(lessonId, 'BEGINNER').expect(200);
      await unpublish(lessonId).expect(200);
      await learn(lessonId, 'BEGINNER').expect(404);

      await publish(lessonId).expect(200);

      const v2 = await learn(lessonId, 'BEGINNER').expect(200);
      expect(v2.body.publicationVersion).toBe(2);
      expect(v2.body.contentHash).toBe(v1.body.contentHash); // identical content ...
      expect(v2.headers.etag).not.toBe(v1.headers.etag); // ... but a different representation
      await learn(lessonId, 'BEGINNER', {
        'If-None-Match': v1.headers.etag,
      }).expect(200);
    });
  });

  describe('ETag and conditional requests', () => {
    it('sends a strong, quoted, opaque ETag that identifies the whole representation', async () => {
      const { lessonId } = await published('etag-shape');
      const res = await learn(lessonId, 'BEGINNER').expect(200);
      expect(res.headers.etag).toMatch(SNAPSHOT_ETAG);
      expect(res.headers.etag).not.toMatch(/^W\//);
      // it is derived from, but is not, the stored content hash
      expect(res.headers.etag).not.toContain(res.body.contentHash);
      // and it is stable across requests
      const again = await learn(lessonId, 'BEGINNER').expect(200);
      expect(again.headers.etag).toBe(res.headers.etag);
    });

    it('answers 304 with no body when If-None-Match matches, and repeats the validators', async () => {
      const { lessonId } = await published('etag-304');
      const full = await learn(lessonId, 'BEGINNER').expect(200);
      const res = await learn(lessonId, 'BEGINNER', {
        'If-None-Match': full.headers.etag,
      }).expect(304);
      expect(res.text).toBe('');
      expect(res.body).toEqual({});
      expect(res.headers.etag).toBe(full.headers.etag);
      expect(res.headers['cache-control']).toBe('public, no-cache');
    });

    it.each([
      ['a weak validator of the same tag', (etag: string) => `W/${etag}`],
      ['a list containing it', (etag: string) => `"other", ${etag}, "another"`],
      ['a weak tag in a list', (etag: string) => `"x",W/${etag}`],
      ['the * wildcard', () => '*'],
    ])('answers 304 for %s', async (_name, header) => {
      const { lessonId } = await published(
        `etag-header-${Math.random().toString(36).slice(2, 7)}`,
        ['BEGINNER'],
      );
      const full = await learn(lessonId, 'BEGINNER').expect(200);
      await learn(lessonId, 'BEGINNER', {
        'If-None-Match': header(full.headers.etag),
      }).expect(304);
    });

    it.each([
      [
        'a different tag',
        '"0000000000000000000000000000000000000000000000000000000000000000-v1"',
      ],
      ['an unquoted tag', 'abc'],
      ['a malformed header', '"unterminated'],
      ['an empty header', ''],
    ])('sends the full response for %s', async (_name, header) => {
      const { lessonId } = await published(
        `etag-miss-${Math.random().toString(36).slice(2, 7)}`,
        ['BEGINNER'],
      );
      const res = await learn(lessonId, 'BEGINNER', {
        'If-None-Match': header,
      }).expect(200);
      expect(res.body.snapshot).toBeDefined();
      expect(res.headers.etag).toBeDefined();
    });

    it('never answers 304 for a different level or a different lesson', async () => {
      const one = await published('etag-isolation-one');
      const two = await published('etag-isolation-two');
      const beginner = await learn(one.lessonId, 'BEGINNER').expect(200);

      // the BEGINNER validator against INTERMEDIATE and ADVANCED of the same lesson
      for (const level of ['INTERMEDIATE', 'ADVANCED']) {
        const res = await learn(one.lessonId, level, {
          'If-None-Match': beginner.headers.etag,
        }).expect(200);
        expect(res.body.level).toBe(level);
        expect(res.headers.etag).not.toBe(beginner.headers.etag);
      }
      // ... and against another lesson at the same level
      const other = await learn(two.lessonId, 'BEGINNER', {
        'If-None-Match': beginner.headers.etag,
      }).expect(200);
      expect(other.body.lessonId).toBe(two.lessonId);
      expect(other.headers.etag).not.toBe(beginner.headers.etag);
      // each level has its own validator
      const etags = new Set<string>();
      for (const level of ALL_LEVELS)
        etags.add((await learn(one.lessonId, level).expect(200)).headers.etag);
      expect(etags.size).toBe(3);
    });

    it('never answers 304 for a withdrawn lesson, whatever validator the client holds', async () => {
      const { lessonId } = await published('etag-withdrawn');
      const full = await learn(lessonId, 'BEGINNER').expect(200);
      await unpublish(lessonId).expect(200);
      for (const header of [full.headers.etag, `W/${full.headers.etag}`, '*']) {
        const res = await learn(lessonId, 'BEGINNER', {
          'If-None-Match': header,
        }).expect(404);
        carriesNoSnapshotValidator(res.headers);
      }
    });

    it('still validates against the older publication while an edit is pending', async () => {
      const { lessonId, blockId } = await published('etag-pending-edit', [
        'BEGINNER',
      ]);
      const full = await learn(lessonId, 'BEGINNER').expect(200);
      await editBlock(lessonId, blockId, 'changed in the working copy');
      await learn(lessonId, 'BEGINNER', {
        'If-None-Match': full.headers.etag,
      }).expect(304);
    });
  });

  describe('the ETag identifies lesson, level, version and content, not just the stored hash', () => {
    const SHARED_HASH = 'ab'.repeat(32);

    /**
     * Test data only: publishes `levels` of an (unpublished) lesson as version `version` with a chosen
     * stored hash, by writing the publication rows directly. Through the real publish path two
     * different lessons or levels can never share a hash (the hashed payload contains the lesson id and
     * the level); this crafts the case the validator must stay correct for anyway.
     */
    const craftPublication = async (
      lessonId: string,
      levels: string[],
      hash: string,
      version = 1,
    ) => {
      const [publication] = await dataSource.query(
        `INSERT INTO "lesson_publications"
           ("lesson_id", "version", "module_id", "source_content_revision", "snapshot_schema_version", "published_by")
         VALUES ($1, $2, $3, 1, 1, $4) RETURNING "id"`,
        [lessonId, version, randomUUID(), adminIds[0]],
      );
      for (const level of levels) {
        await dataSource.query(
          `INSERT INTO "lesson_publication_levels"
             ("publication_id", "lesson_id", "level", "content", "content_hash", "content_bytes")
           VALUES ($1, $2, $3, $4::jsonb, $5, 40)`,
          [
            publication.id,
            lessonId,
            level,
            JSON.stringify({ schemaVersion: 1, crafted: true }),
            hash,
          ],
        );
      }
    };

    it('different lessons with an identical stored hash and publication version get different ETags', async () => {
      const one = await newLesson('etag-identity-lesson-one', ['BEGINNER']);
      const two = await newLesson('etag-identity-lesson-two', ['BEGINNER']);
      await craftPublication(one.lessonId, ['BEGINNER'], SHARED_HASH, 1);
      await craftPublication(two.lessonId, ['BEGINNER'], SHARED_HASH, 1);

      const first = await learn(one.lessonId, 'BEGINNER').expect(200);
      const second = await learn(two.lessonId, 'BEGINNER').expect(200);

      // identical hash and version ...
      expect(first.body.contentHash).toBe(second.body.contentHash);
      expect(first.body.publicationVersion).toBe(
        second.body.publicationVersion,
      );
      // ... different representations (the envelope carries the lesson id), so different validators
      expect(first.body.lessonId).not.toBe(second.body.lessonId);
      expect(first.headers.etag).not.toBe(second.headers.etag);
      // and neither lesson's validator is ever accepted for the other
      await learn(two.lessonId, 'BEGINNER', {
        'If-None-Match': first.headers.etag,
      }).expect(200);
      await learn(one.lessonId, 'BEGINNER', {
        'If-None-Match': second.headers.etag,
      }).expect(200);
      // each still revalidates against its own
      await learn(one.lessonId, 'BEGINNER', {
        'If-None-Match': first.headers.etag,
      }).expect(304);
      await learn(two.lessonId, 'BEGINNER', {
        'If-None-Match': second.headers.etag,
      }).expect(304);
    });

    it('different levels of one lesson with an identical stored hash and publication version get different ETags', async () => {
      const { lessonId } = await newLesson('etag-identity-levels');
      await craftPublication(lessonId, ALL_LEVELS, SHARED_HASH, 1);

      const responses = await Promise.all(
        ALL_LEVELS.map((level) => learn(lessonId, level)),
      );
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.contentHash).toBe(SHARED_HASH);
        expect(res.body.publicationVersion).toBe(1);
      }
      const etags = responses.map((res) => res.headers.etag);
      expect(new Set(etags).size).toBe(3);
      // a validator for one level never matches another level
      for (const [index, level] of ALL_LEVELS.entries()) {
        for (const [otherIndex, otherEtag] of etags.entries()) {
          const res = await learn(lessonId, level, {
            'If-None-Match': otherEtag,
          });
          expect(
            res.status,
            `${level} with the tag of ${ALL_LEVELS[otherIndex]}`,
          ).toBe(index === otherIndex ? 304 : 200);
        }
      }
    });

    it('the same lesson and level with an identical stored hash but a new publication version gets a different ETag', async () => {
      const { lessonId } = await published('etag-identity-version', [
        'BEGINNER',
      ]);
      const v1 = await learn(lessonId, 'BEGINNER').expect(200);
      await unpublish(lessonId).expect(200);
      await publish(lessonId).expect(200); // identical content, version 2

      const v2 = await learn(lessonId, 'BEGINNER').expect(200);
      expect(v2.body.contentHash).toBe(v1.body.contentHash);
      expect(v2.body.publicationVersion).toBe(2);
      expect(v2.headers.etag).not.toBe(v1.headers.etag);
      await learn(lessonId, 'BEGINNER', {
        'If-None-Match': v1.headers.etag,
      }).expect(200);
      await learn(lessonId, 'BEGINNER', {
        'If-None-Match': v2.headers.etag,
      }).expect(304);
    });

    it('an identical representation always gets the same ETag, and the 304 repeats it with the cache headers and no body', async () => {
      const { lessonId } = await published('etag-identity-stable', [
        'BEGINNER',
      ]);
      const a = await learn(lessonId, 'BEGINNER').expect(200);
      const b = await learn(lessonId, 'BEGINNER').expect(200);
      expect(b.headers.etag).toBe(a.headers.etag);

      const notModified = await learn(lessonId, 'BEGINNER', {
        'If-None-Match': a.headers.etag,
      }).expect(304);
      expect(notModified.text).toBe('');
      expect(notModified.headers.etag).toBe(a.headers.etag);
      expect(notModified.headers['cache-control']).toBe('public, no-cache');
    });

    it('a withdrawn publication is a 404 whatever validator is supplied, including crafted ones', async () => {
      const { lessonId } = await published('etag-identity-withdrawn', [
        'BEGINNER',
      ]);
      const live = await learn(lessonId, 'BEGINNER').expect(200);
      await unpublish(lessonId).expect(200);
      for (const header of [
        live.headers.etag,
        `W/${live.headers.etag}`,
        `"x", ${live.headers.etag}`,
        '*',
      ]) {
        const res = await learn(lessonId, 'BEGINNER', {
          'If-None-Match': header,
        }).expect(404);
        expect(res.headers['cache-control']).toBe('no-store');
        carriesNoSnapshotValidator(res.headers);
      }
    });
  });

  describe('cache policy', () => {
    it('allows storing a lesson but requires revalidation before every reuse (public, no-cache)', async () => {
      const { lessonId } = await published('cache-ok');
      const res = await learn(lessonId, 'BEGINNER').expect(200);
      expect(res.headers['cache-control']).toBe('public, no-cache');
      expect(res.headers['cache-control']).not.toMatch(
        /max-age|s-maxage|immutable|stale-while|stale-if/,
      );
      expect(res.headers.expires).toBeUndefined();
      expect(res.headers['last-modified']).toBeUndefined();
    });

    it('forbids caching of every error', async () => {
      const draft = await newLesson('cache-errors');
      const cases = [
        await learn(randomUUID(), 'BEGINNER'), // 404
        await learn(draft.lessonId, 'BEGINNER'), // 404, draft
        await learn('nope', 'BEGINNER'), // 400
        await http().get(`${API}/lessons/${draft.lessonId}`), // 400, no level
      ];
      expect(cases.map((r) => r.status)).toEqual([404, 404, 400, 400]);
      for (const res of cases)
        expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('existing behaviour is untouched', () => {
    it('admin snapshot reads, history and the consistency report still work and agree', async () => {
      const { lessonId } = await published('regression');
      await learn(lessonId, 'BEGINNER').expect(200);

      const history = (
        await http()
          .get(`${ADMIN_LESSONS}/${lessonId}/publications`)
          .set('Authorization', as(Role.EDITOR))
          .expect(200)
      ).body;
      expect(history).toMatchObject({
        total: 1,
        items: [{ version: 1, active: true }],
      });
      const report = (
        await http()
          .get(`${API}/admin/publishing/consistency`)
          .set('Authorization', as(Role.ADMIN))
          .expect(200)
      ).body;
      expect(
        report.issues.filter(
          (i: { lessonId: string }) => i.lessonId === lessonId,
        ),
      ).toEqual([]);
    });

    it('health stays public and unversioned', async () => {
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });
});
