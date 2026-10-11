import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';
import { deleteCatalogHistory } from './support/catalog-cleanup.js';
import { deleteWorkflowHistory } from './support/workflow-cleanup.js';

// Course/module publishing and the public catalog, end to end: the admin workflow routes, the anonymous
// catalog and navigation routes, and the effect of course/module publication on lesson delivery.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-cat-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const API = '/api/v1';
const COURSES = `${API}/admin/courses`;
const ADMIN_LESSONS = `${API}/admin/lessons`;
const ETAG = /^"[0-9a-f]{64}"$/;
const MISSING = '3f1b8b6e-7c1d-4a52-9d2e-0a1b2c3d4e5f';

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

interface Built {
  courseId: string;
  modules: { moduleId: string; lessonIds: string[] }[];
}

// Each test authors and publishes whole courses over a remote database: allow for round-trip latency.
vi.setConfig({ testTimeout: 180_000 });

describe('Course/module publishing and the public catalog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;
  const courseWf = (id: string) => `${COURSES}/${id}/workflow`;
  const moduleWf = (c: string, m: string) =>
    `${COURSES}/${c}/modules/${m}/workflow`;
  const lessonWf = (id: string) => `${ADMIN_LESSONS}/${id}/workflow`;

  const post = (url: string, role: Role, body: object = {}) =>
    http().post(url).set('Authorization', as(role)).send(body);
  const get = (url: string, role: Role = Role.ADMIN) =>
    http().get(url).set('Authorization', as(role));

  const cycle = async (base: string, publishToo = false) => {
    await post(`${base}/submit`, Role.EDITOR).expect(200);
    await post(`${base}/approve`, Role.REVIEWER).expect(200);
    if (publishToo) await post(`${base}/publish`, Role.ADMIN).expect(200);
  };

  /** A course with modules of lessons (each lesson at `levels`), authored through the admin API. */
  const author = async (
    name: string,
    layout: string[][][], // module -> lesson -> levels
  ): Promise<Built> => {
    const admin = as(Role.ADMIN);
    const course = (
      await http()
        .post(COURSES)
        .set('Authorization', admin)
        .send({ title: title(name), description: `about ${name}` })
        .expect(201)
    ).body;
    const built: Built = { courseId: course.id, modules: [] };
    for (const [m, lessons] of layout.entries()) {
      const module = (
        await http()
          .post(`${COURSES}/${course.id}/modules`)
          .set('Authorization', admin)
          .send({ title: title(`${name}-m${m + 1}`) })
          .expect(201)
      ).body;
      const lessonIds: string[] = [];
      for (const [l, levels] of lessons.entries()) {
        const lesson = (
          await http()
            .post(`${COURSES}/${course.id}/modules/${module.id}/lessons`)
            .set('Authorization', admin)
            .send({ title: title(`${name}-m${m + 1}-l${l + 1}`), levels })
            .expect(201)
        ).body;
        await http()
          .post(`${ADMIN_LESSONS}/${lesson.id}/blocks`)
          .set('Authorization', admin)
          .send({
            type: 'RICH_TEXT',
            sharedContent: rich(`text ${name} ${m}.${l}`),
            levels,
          })
          .expect(201);
        lessonIds.push(lesson.id);
      }
      built.modules.push({ moduleId: module.id, lessonIds });
    }
    return built;
  };

  const publishLesson = async (id: string) => {
    await cycle(lessonWf(id), true);
  };

  /** Authors a course, publishes every lesson and the course with all its modules. */
  const publishedCourse = async (name: string, layout: string[][][]) => {
    const built = await author(name, layout);
    for (const module of built.modules) {
      for (const id of module.lessonIds) await publishLesson(id);
      await cycle(moduleWf(built.courseId, module.moduleId));
    }
    await cycle(courseWf(built.courseId), true);
    return built;
  };

  const L = (level: string) => `level=${level}`;
  const course = (id: string, level: string, headers: object = {}) =>
    http()
      .get(`${API}/courses/${id}?${L(level)}`)
      .set(headers as Record<string, string>);
  const listing = (level: string, headers: object = {}) =>
    http()
      .get(`${API}/courses?${L(level)}`)
      .set(headers as Record<string, string>);
  const navigation = (id: string, level: string, headers: object = {}) =>
    http()
      .get(`${API}/lessons/${id}/navigation?${L(level)}`)
      .set(headers as Record<string, string>);
  const lesson = (id: string, level: string, headers: object = {}) =>
    http()
      .get(`${API}/lessons/${id}?${L(level)}`)
      .set(headers as Record<string, string>);

  const cleanup = async () => {
    const like = `e2e-${runId}-%`;
    const courses = `SELECT "id" FROM "courses" WHERE "title" LIKE $1`;
    const owned = `SELECT l."id" FROM "lessons" l JOIN "course_modules" m ON m."id" = l."module_id"
      WHERE m."course_id" IN (${courses})`;
    await deleteCatalogHistory(dataSource, courses, [like]);
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
    await dataSource.query(`DELETE FROM "lessons" WHERE "id" IN (${owned})`, [
      like,
    ]);
    await dataSource.query(
      `DELETE FROM "course_modules" WHERE "course_id" IN (${courses})`,
      [like],
    );
    await dataSource.query(`DELETE FROM "courses" WHERE "title" LIKE $1`, [
      like,
    ]);
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-cat-${runId}-%${EMAIL_SUFFIX}`,
    ]);
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '1000';
    process.env.PUBLIC_RATE_LIMIT = '10000';
    // The suite runs longer than the 15 minute default token lifetime on a slow remote database.
    process.env.JWT_ACCESS_TTL_SECONDS = '7200';
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
        .post(`${API}/admin/auth/login`)
        .send({ email: emailFor(role), password: PASSWORD })
        .expect(200);
      tokens[role] = res.body.accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('admin workflow', () => {
    it('enforces the role matrix and authentication', async () => {
      const { courseId } = await author('roles', [[['BEGINNER']]]);
      await http()
        .post(`${courseWf(courseId)}/submit`)
        .send({})
        .expect(401);
      await post(`${courseWf(courseId)}/submit`, Role.REVIEWER).expect(403);
      await post(`${courseWf(courseId)}/submit`, Role.EDITOR).expect(200);
      await post(`${courseWf(courseId)}/approve`, Role.EDITOR).expect(403);
      await post(`${courseWf(courseId)}/approve`, Role.REVIEWER).expect(200);
      await post(`${courseWf(courseId)}/publish`, Role.EDITOR).expect(403);
      await post(`${courseWf(courseId)}/publish`, Role.REVIEWER).expect(403);
      for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
        await get(courseWf(courseId), role).expect(200);
      }
    });

    it('reports 404 for unknown courses and modules, 409 for invalid transitions and stale versions', async () => {
      await post(`${courseWf(MISSING)}/submit`, Role.EDITOR).expect(404);
      const { courseId, modules } = await author('errors', [[['BEGINNER']]]);
      await post(`${moduleWf(courseId, MISSING)}/submit`, Role.EDITOR).expect(
        404,
      );
      await post(`${courseWf(courseId)}/publish`, Role.ADMIN).expect(409); // not approved
      await post(`${courseWf(courseId)}/submit`, Role.EDITOR, {
        expectedVersion: 999,
      }).expect(409);
      await post(`${courseWf(courseId)}/request-changes`, Role.REVIEWER).expect(
        400,
      ); // note required
      expect(modules).toHaveLength(1);
    });

    it('runs the review cycle with events that record the actor', async () => {
      const { courseId } = await author('cycle', [[['BEGINNER']]]);
      await post(`${courseWf(courseId)}/submit`, Role.EDITOR).expect(200);
      await post(`${courseWf(courseId)}/request-changes`, Role.REVIEWER, {
        note: 'needs a subtitle',
      }).expect(200);
      await cycle(courseWf(courseId));
      const events = (await get(`${courseWf(courseId)}/events`).expect(200))
        .body;
      const items = events.items ?? events;
      expect(items.map((e: { action: string }) => e.action)).toEqual([
        'APPROVE',
        'SUBMIT_FOR_REVIEW',
        'REQUEST_CHANGES',
        'SUBMIT_FOR_REVIEW',
      ]);
    });

    it('refuses to publish a course with no published lesson (422) and a module before its course (409/422)', async () => {
      const { courseId, modules } = await author('unready', [[['BEGINNER']]]);
      await cycle(courseWf(courseId));
      const res = await post(`${courseWf(courseId)}/publish`, Role.ADMIN);
      expect(res.status).toBe(422);
      await cycle(moduleWf(courseId, modules[0].moduleId));
      const mod = await post(
        `${moduleWf(courseId, modules[0].moduleId)}/publish`,
        Role.ADMIN,
      );
      expect([409, 422]).toContain(mod.status);
    });

    it('publishes the course with its approved modules, one immutable catalog version', async () => {
      const built = await author('publish', [[['BEGINNER']], [['BEGINNER']]]);
      for (const m of built.modules) {
        await publishLesson(m.lessonIds[0]);
      }
      await cycle(moduleWf(built.courseId, built.modules[0].moduleId));
      await cycle(courseWf(built.courseId));
      const res = await post(
        `${courseWf(built.courseId)}/publish`,
        Role.ADMIN,
      ).expect(200);
      expect(res.body).toMatchObject({
        courseId: built.courseId,
        status: 'PUBLISHED',
      });
      expect(res.body.publication.version).toBe(1);
      // the module that was never approved is reported, not silently published
      expect(JSON.stringify(res.body.modulesNotIncluded)).toContain(
        built.modules[1].moduleId,
      );
      const stored = await get(
        `${COURSES}/${built.courseId}/publications/1/levels/BEGINNER`,
      ).expect(200);
      expect(JSON.stringify(stored.body)).toContain(
        built.modules[0].lessonIds[0],
      );
      expect(JSON.stringify(stored.body)).not.toContain(
        built.modules[1].lessonIds[0],
      );
    });
  });

  describe('public catalog', () => {
    it('lists and shows a published course, level by level, anonymously', async () => {
      const built = await publishedCourse('catalog', [
        [['BEGINNER', 'INTERMEDIATE'], ['BEGINNER']],
        [['BEGINNER']],
      ]);
      const detail = await course(built.courseId, 'BEGINNER').expect(200);
      expect(detail.body).toMatchObject({
        courseId: built.courseId,
        level: 'BEGINNER',
        moduleCount: 2,
        lessonCount: 3,
      });
      expect(detail.body.modules[0].lessons).toHaveLength(2);
      expect(detail.headers['cache-control']).toBe('public, no-cache');
      expect(detail.headers.etag).toMatch(ETAG);

      const intermediate = await course(built.courseId, 'INTERMEDIATE').expect(
        200,
      );
      expect(intermediate.body).toMatchObject({
        moduleCount: 1,
        lessonCount: 1,
      });
      // no fallback and no leakage: nothing is published at ADVANCED
      await course(built.courseId, 'ADVANCED').expect(404);

      const list = await listing('BEGINNER').expect(200);
      expect(
        list.body.courses.map((c: { courseId: string }) => c.courseId),
      ).toContain(built.courseId);
      const adv = await listing('ADVANCED').expect(200);
      expect(
        adv.body.courses.map((c: { courseId: string }) => c.courseId),
      ).not.toContain(built.courseId);
    });

    it('validates input and answers every missing case with the same 404', async () => {
      const built = await publishedCourse('validation', [[['BEGINNER']]]);
      await course('not-a-uuid', 'BEGINNER').expect(400);
      await course(built.courseId, 'EXPERT').expect(400);
      await http().get(`${API}/courses/${built.courseId}`).expect(400);
      await listing('beginner').expect(400);
      const unknown = await course(MISSING, 'BEGINNER').expect(404);
      const unpublished = await author('draft', [[['BEGINNER']]]);
      const draft = await course(unpublished.courseId, 'BEGINNER').expect(404);
      expect(draft.body.message).toBe(unknown.body.message);
      expect(draft.headers['cache-control']).toBe('no-store');
    });

    it('validates with strong ETags and answers 304 only for the current representation', async () => {
      const built = await publishedCourse('etag', [[['BEGINNER']]]);
      const first = await course(built.courseId, 'BEGINNER').expect(200);
      const tag = first.headers.etag as string;
      for (const header of [tag, `W/${tag}`, `"x", ${tag}`, '*']) {
        const res = await course(built.courseId, 'BEGINNER', {
          'If-None-Match': header,
        }).expect(304);
        expect(res.headers['cache-control']).toBe('public, no-cache');
        expect(res.headers.etag).toBe(tag);
      }
      await course(built.courseId, 'BEGINNER', {
        'If-None-Match': '"nope"',
      }).expect(200);
      // a different level or resource never shares the tag
      const other = await publishedCourse('etag-other', [[['BEGINNER']]]);
      expect(
        (await course(other.courseId, 'BEGINNER').expect(200)).headers.etag,
      ).not.toBe(tag);
    });

    it('stops showing a course when it is unpublished, and shows it again when republished', async () => {
      const built = await publishedCourse('withdraw', [[['BEGINNER']]]);
      const first = await course(built.courseId, 'BEGINNER').expect(200);
      await post(`${courseWf(built.courseId)}/unpublish`, Role.ADMIN).expect(
        200,
      );
      for (const header of [first.headers.etag, '*']) {
        await course(built.courseId, 'BEGINNER', {
          'If-None-Match': header,
        }).expect(404);
      }
      expect(
        (await listing('BEGINNER').expect(200)).body.courses.map(
          (c: { courseId: string }) => c.courseId,
        ),
      ).not.toContain(built.courseId);
      await post(`${courseWf(built.courseId)}/publish`, Role.ADMIN).expect(200); // unpublish keeps the status
      await course(built.courseId, 'BEGINNER').expect(200);
    });
  });

  describe('lesson delivery is gated by course and module publication', () => {
    it('serves a lesson only while its module and course are published; history is untouched', async () => {
      const built = await publishedCourse('gate', [[['BEGINNER']]]);
      const lessonId = built.modules[0].lessonIds[0];
      const served = await lesson(lessonId, 'BEGINNER').expect(200);

      await post(`${courseWf(built.courseId)}/unpublish`, Role.ADMIN).expect(
        200,
      );
      for (const header of [served.headers.etag, `W/${served.headers.etag}`]) {
        const res = await lesson(lessonId, 'BEGINNER', {
          'If-None-Match': header,
        }).expect(404);
        expect(res.headers['cache-control']).toBe('no-store');
      }
      await navigation(lessonId, 'BEGINNER').expect(404);

      // the lesson's own publication is still active
      const [active] = await dataSource.query(
        `SELECT 1 FROM "lesson_publications" WHERE "lesson_id" = $1 AND "ended_at" IS NULL`,
        [lessonId],
      );
      expect(active).toBeDefined();

      // republishing the course restores access with the same lesson snapshot
      await post(`${courseWf(built.courseId)}/publish`, Role.ADMIN).expect(200);
      const again = await lesson(lessonId, 'BEGINNER').expect(200);
      expect(again.body.contentHash).toBe(served.body.contentHash);
    });

    it('stops serving the lessons of a module when only that module is unpublished', async () => {
      const built = await publishedCourse('module-gate', [
        [['BEGINNER']],
        [['BEGINNER']],
      ]);
      const [first, second] = built.modules;
      await post(
        `${moduleWf(built.courseId, second.moduleId)}/unpublish`,
        Role.ADMIN,
      ).expect(200);
      await lesson(second.lessonIds[0], 'BEGINNER').expect(404);
      await lesson(first.lessonIds[0], 'BEGINNER').expect(200);
      const detail = await course(built.courseId, 'BEGINNER').expect(200);
      expect(detail.body.moduleCount).toBe(1);
      // navigation never enters the unpublished module
      const nav = await navigation(first.lessonIds[0], 'BEGINNER').expect(200);
      expect(nav.body.next).toBeNull();
    });

    it('still requires the lesson itself to be published', async () => {
      const built = await author('lesson-needed', [
        [['BEGINNER'], ['BEGINNER']],
      ]);
      const [published, draft] = built.modules[0].lessonIds;
      await publishLesson(published);
      await cycle(moduleWf(built.courseId, built.modules[0].moduleId));
      await cycle(courseWf(built.courseId), true);
      await lesson(published, 'BEGINNER').expect(200);
      await lesson(draft, 'BEGINNER').expect(404);
      const detail = await course(built.courseId, 'BEGINNER').expect(200);
      expect(detail.body.lessonCount).toBe(1);
    });
  });

  describe('next / previous', () => {
    it('walks the course in order across modules, skips ineligible lessons, and is null at the ends', async () => {
      const built = await publishedCourse('nav', [
        [['BEGINNER'], ['INTERMEDIATE'], ['BEGINNER']],
        [['BEGINNER']],
      ]);
      const [a, skipped, b] = built.modules[0].lessonIds;
      const [c] = built.modules[1].lessonIds;

      const first = await navigation(a, 'BEGINNER').expect(200);
      expect(first.body).toMatchObject({
        courseId: built.courseId,
        previous: null,
        next: { lessonId: b }, // the INTERMEDIATE-only lesson is skipped
      });
      const middle = await navigation(b, 'BEGINNER').expect(200);
      expect(middle.body.previous.lessonId).toBe(a);
      expect(middle.body.next.lessonId).toBe(c); // across the module boundary
      const last = await navigation(c, 'BEGINNER').expect(200);
      expect(last.body.next).toBeNull();
      expect(last.body.previous.lessonId).toBe(b);

      // a lesson with no BEGINNER version has no BEGINNER navigation
      await navigation(skipped, 'BEGINNER').expect(404);
      const other = await navigation(skipped, 'INTERMEDIATE').expect(200);
      expect(other.body).toMatchObject({ previous: null, next: null });

      const tag = middle.headers.etag as string;
      await navigation(b, 'BEGINNER', { 'If-None-Match': tag }).expect(304);
    });

    it('skips a lesson that is unpublished after the catalog version was created', async () => {
      const built = await publishedCourse('nav-skip', [
        [['BEGINNER'], ['BEGINNER'], ['BEGINNER']],
      ]);
      const [a, b, c] = built.modules[0].lessonIds;
      await post(`${lessonWf(b)}/unpublish`, Role.ADMIN).expect(200);
      expect(
        (await navigation(a, 'BEGINNER').expect(200)).body.next,
      ).toMatchObject({ lessonId: c });
      expect(
        (await navigation(c, 'BEGINNER').expect(200)).body.previous,
      ).toMatchObject({ lessonId: a });
      const detail = await course(built.courseId, 'BEGINNER').expect(200);
      expect(detail.body.lessonCount).toBe(2);
      await lesson(b, 'BEGINNER').expect(404);
    });
  });

  describe('public responses do not leak working copies', () => {
    it('keeps showing the published title after the working copy is edited', async () => {
      const built = await publishedCourse('leak', [[['BEGINNER']]]);
      const before = await course(built.courseId, 'BEGINNER').expect(200);
      await http()
        .patch(`${COURSES}/${built.courseId}`)
        .set('Authorization', as(Role.ADMIN))
        .send({ title: title('leak-edited') })
        .expect(200);
      const after = await course(built.courseId, 'BEGINNER').expect(200);
      expect(after.body.title).toBe(before.body.title);
      expect(JSON.stringify(after.body)).not.toContain('edited');
    });
  });

  describe('catalog refresh, approved order and withdrawn modules', () => {
    const addLesson = async (
      courseId: string,
      moduleId: string,
      name: string,
    ) => {
      const created = (
        await http()
          .post(`${COURSES}/${courseId}/modules/${moduleId}/lessons`)
          .set('Authorization', as(Role.ADMIN))
          .send({ title: title(name), levels: ['BEGINNER'] })
          .expect(201)
      ).body;
      await http()
        .post(`${ADMIN_LESSONS}/${created.id}/blocks`)
        .set('Authorization', as(Role.ADMIN))
        .send({
          type: 'RICH_TEXT',
          sharedContent: rich(`text ${name}`),
          levels: ['BEGINNER'],
        })
        .expect(201);
      await publishLesson(created.id);
      return created.id as string;
    };
    const lessonIdsOf = (detail: {
      body: { modules: { lessons: { lessonId: string }[] }[] };
    }) => detail.body.modules.map((m) => m.lessons.map((l) => l.lessonId));
    const reorder = (url: string, key: string, ids: string[]) =>
      http()
        .put(url)
        .set('Authorization', as(Role.ADMIN))
        .send({ [key]: ids })
        .expect(200);

    it('a lesson published after the catalog version is not delivered, listed or navigable until an ADMIN refreshes the course', async () => {
      const built = await publishedCourse('refresh', [[['BEGINNER']]]);
      const [first] = built.modules[0].lessonIds;
      const late = await addLesson(
        built.courseId,
        built.modules[0].moduleId,
        'refresh-late',
      );

      // the three public views agree: the late lesson is not available yet
      await lesson(late, 'BEGINNER').expect(404);
      await navigation(late, 'BEGINNER').expect(404);
      const before = await course(built.courseId, 'BEGINNER').expect(200);
      expect(lessonIdsOf(before)).toEqual([[first]]);
      await lesson(first, 'BEGINNER').expect(200);

      // only an ADMIN may refresh
      for (const role of [Role.EDITOR, Role.REVIEWER]) {
        await post(`${courseWf(built.courseId)}/publish`, role).expect(403);
      }
      const refreshed = await post(
        `${courseWf(built.courseId)}/publish`,
        Role.ADMIN,
      ).expect(200);
      expect(refreshed.body).toMatchObject({
        fromStatus: 'PUBLISHED',
        status: 'PUBLISHED',
      });
      expect(refreshed.body.publication.version).toBe(2);
      expect(refreshed.body.supersededVersion).toBe(1);

      await lesson(late, 'BEGINNER').expect(200);
      const after = await course(built.courseId, 'BEGINNER').expect(200);
      expect(lessonIdsOf(after)).toEqual([[first, late]]);
      expect(
        (await navigation(first, 'BEGINNER').expect(200)).body.next.lessonId,
      ).toBe(late);
      // a validator of the old representation no longer matches
      await course(built.courseId, 'BEGINNER', {
        'If-None-Match': before.headers.etag,
      }).expect(200);

      // version 1 is unchanged history; the refresh is in the audit trail
      const v1 = await get(
        `${COURSES}/${built.courseId}/publications/1/levels/BEGINNER`,
      ).expect(200);
      expect(JSON.stringify(v1.body)).not.toContain(late);
      const events = (
        await get(`${courseWf(built.courseId)}/events`).expect(200)
      ).body;
      expect((events.items ?? events)[0]).toMatchObject({
        action: 'PUBLISH',
        fromStatus: 'PUBLISHED',
        toStatus: 'PUBLISHED',
      });
    });

    it('a refresh that cannot be published fails and the previous version keeps serving', async () => {
      const built = await publishedCourse('refresh-fail', [[['BEGINNER']]]);
      const [only] = built.modules[0].lessonIds;
      await post(`${lessonWf(only)}/unpublish`, Role.ADMIN).expect(200);
      await post(`${courseWf(built.courseId)}/publish`, Role.ADMIN).expect(422);
      const state = (await get(courseWf(built.courseId)).expect(200)).body;
      expect(state).toMatchObject({ status: 'PUBLISHED', published: true });
      expect(state.activePublication.version).toBe(1);
      await post(`${lessonWf(only)}/publish`, Role.ADMIN).expect(200);
      await lesson(only, 'BEGINNER').expect(200); // the old version still lists it
    });

    it('a reorder is an edit: the published order stays until the reordered course is approved and published', async () => {
      const built = await publishedCourse('order', [
        [['BEGINNER'], ['BEGINNER']],
        [['BEGINNER']],
        [['BEGINNER']],
      ]);
      const [m1, m2, m3] = built.modules;
      const initial = lessonIdsOf(
        await course(built.courseId, 'BEGINNER').expect(200),
      );

      await reorder(`${COURSES}/${built.courseId}/modules/order`, 'moduleIds', [
        m2.moduleId,
        m1.moduleId,
        m3.moduleId,
      ]);
      expect(
        (await get(courseWf(built.courseId)).expect(200)).body.status,
      ).toBe('DRAFT');
      // still serving the approved order
      expect(
        lessonIdsOf(await course(built.courseId, 'BEGINNER').expect(200)),
      ).toEqual(initial);

      // an unrelated module is withdrawn and published again: nothing reorders
      await post(
        `${moduleWf(built.courseId, m3.moduleId)}/unpublish`,
        Role.ADMIN,
      ).expect(200);
      await post(
        `${moduleWf(built.courseId, m3.moduleId)}/publish`,
        Role.ADMIN,
      ).expect(200);
      expect(
        lessonIdsOf(await course(built.courseId, 'BEGINNER').expect(200)),
      ).toEqual(initial);
      const nav = await navigation(m1.lessonIds[1], 'BEGINNER').expect(200);
      expect(nav.body.next.lessonId).toBe(m2.lessonIds[0]);

      // approved through the normal workflow, the new order is published
      await cycle(courseWf(built.courseId), true);
      expect(
        lessonIdsOf(await course(built.courseId, 'BEGINNER').expect(200)),
      ).toEqual([m2.lessonIds, m1.lessonIds, m3.lessonIds]);
      const moved = await navigation(m1.lessonIds[0], 'BEGINNER').expect(200);
      expect(moved.body.previous.lessonId).toBe(m2.lessonIds[0]);

      // the lessons of a module: same rule, applied when the module is published
      await reorder(
        `${COURSES}/${built.courseId}/modules/${m1.moduleId}/lessons/order`,
        'lessonIds',
        [m1.lessonIds[1], m1.lessonIds[0]],
      );
      expect(
        (await get(moduleWf(built.courseId, m1.moduleId)).expect(200)).body
          .status,
      ).toBe('DRAFT');
      expect(
        lessonIdsOf(await course(built.courseId, 'BEGINNER').expect(200))[1],
      ).toEqual(m1.lessonIds);
      await cycle(moduleWf(built.courseId, m1.moduleId), true);
      expect(
        lessonIdsOf(await course(built.courseId, 'BEGINNER').expect(200))[1],
      ).toEqual([m1.lessonIds[1], m1.lessonIds[0]]);
    });

    it('a module withdrawn on purpose stays hidden when the course is unpublished and republished', async () => {
      const built = await publishedCourse('withdrawn', [
        [['BEGINNER']],
        [['BEGINNER']],
      ]);
      const [m1, m2] = built.modules;
      await post(
        `${moduleWf(built.courseId, m2.moduleId)}/unpublish`,
        Role.ADMIN,
      ).expect(200);
      await lesson(m2.lessonIds[0], 'BEGINNER').expect(404);
      await post(`${courseWf(built.courseId)}/unpublish`, Role.ADMIN).expect(
        200,
      );
      const again = await post(
        `${courseWf(built.courseId)}/publish`,
        Role.ADMIN,
      ).expect(200);

      expect(again.body.modulesNotIncluded).toEqual([
        { moduleId: m2.moduleId, status: 'APPROVED', reason: 'WITHDRAWN' },
      ]);
      expect(
        lessonIdsOf(await course(built.courseId, 'BEGINNER').expect(200)),
      ).toEqual([m1.lessonIds]);
      await lesson(m1.lessonIds[0], 'BEGINNER').expect(200);
      await lesson(m2.lessonIds[0], 'BEGINNER').expect(404);
      await navigation(m2.lessonIds[0], 'BEGINNER').expect(404);

      // history is intact, and the explicit module publish brings it back
      const events = (
        await get(`${moduleWf(built.courseId, m2.moduleId)}/events`).expect(200)
      ).body;
      expect(
        (events.items ?? events).map((e: { action: string }) => e.action),
      ).toEqual(['UNPUBLISH', 'PUBLISH', 'APPROVE', 'SUBMIT_FOR_REVIEW']);
      await post(
        `${moduleWf(built.courseId, m2.moduleId)}/publish`,
        Role.ADMIN,
      ).expect(200);
      await lesson(m2.lessonIds[0], 'BEGINNER').expect(200);
    });
  });
});
