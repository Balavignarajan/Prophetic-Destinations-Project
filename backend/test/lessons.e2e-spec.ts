import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-les-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;
const strip = (value: string) => value.replace(`e2e-${runId}-`, '');

const COURSES = '/api/v1/admin/courses';
const LESSONS = '/api/v1/admin/lessons';

describe('Lessons admin API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens = {} as Record<'admin' | 'editor' | 'reviewer', string>;

  const http = () => request(app.getHttpServer());
  const as = (role: keyof typeof tokens) => `Bearer ${tokens[role]}`;

  const createCourse = async (name: string) =>
    (
      await http()
        .post(COURSES)
        .set('Authorization', as('editor'))
        .send({ title: title(name) })
        .expect(201)
    ).body;

  /** A course with one module; returns the ids and the module's lessons URL. */
  const newModule = async (name: string) => {
    const course = await createCourse(name);
    const module = (
      await http()
        .post(`${COURSES}/${course.id}/modules`)
        .set('Authorization', as('editor'))
        .send({ title: title(`${name}-module`) })
        .expect(201)
    ).body;
    return {
      courseId: course.id as string,
      moduleId: module.id as string,
      url: `${COURSES}/${course.id}/modules/${module.id}/lessons`,
    };
  };

  const createLesson = async (url: string, name: string, extra: object = {}) =>
    (
      await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ title: title(name), ...extra })
        .expect(201)
    ).body;

  const lessonTitles = async (url: string) =>
    (
      await http().get(url).set('Authorization', as('reviewer')).expect(200)
    ).body.items.map((l: { position: number; title: string }) => [
      l.position,
      strip(l.title),
    ]);

  const cleanup = async () => {
    const like = `e2e-${runId}-%`;
    const modules = `SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;
    await dataSource.query(
      `DELETE FROM "lesson_levels" WHERE "lesson_id" IN (SELECT "id" FROM "lessons" WHERE "module_id" IN (${modules}))`,
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
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-les-${runId}-%${EMAIL_SUFFIX}`,
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

    const provisioning = app.get(AdminProvisioningService);
    for (const [name, role] of [
      ['admin', Role.ADMIN],
      ['editor', Role.EDITOR],
      ['reviewer', Role.REVIEWER],
    ] as const) {
      await provisioning.create({
        email: emailFor(name),
        password: PASSWORD,
        role,
      });
      const res = await http()
        .post('/api/v1/admin/auth/login')
        .send({ email: emailFor(name), password: PASSWORD })
        .expect(200);
      tokens[name] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('authentication and roles', () => {
    const id = randomUUID();
    const moduleLessons = `${COURSES}/${id}/modules/${id}/lessons`;
    const routes: [string, string][] = [
      ['get', moduleLessons],
      ['post', moduleLessons],
      ['put', `${moduleLessons}/order`],
      ['get', `${LESSONS}/${id}`],
      ['patch', `${LESSONS}/${id}`],
      ['delete', `${LESSONS}/${id}`],
      ['put', `${LESSONS}/${id}/levels`],
    ];

    it.each(routes)('%s %s requires authentication', async (method, path) => {
      const res = await (http() as any)[method](path).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it('lets reviewers read but not write, with 403 in the standard error shape', async () => {
      const { url } = await newModule('roles');
      const lesson = await createLesson(url, 'roles-lesson');

      await http().get(url).set('Authorization', as('reviewer')).expect(200);
      await http()
        .get(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);

      const denied = await http()
        .post(url)
        .set('Authorization', as('reviewer'))
        .send({ title: title('nope') })
        .expect(403);
      expect(denied.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        requestId: expect.any(String),
      });

      await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('reviewer'))
        .send({ title: 'x' })
        .expect(403);
      await http()
        .put(`${LESSONS}/${lesson.id}/levels`)
        .set('Authorization', as('reviewer'))
        .send({ levels: [] })
        .expect(403);
      await http()
        .put(`${url}/order`)
        .set('Authorization', as('reviewer'))
        .send({ lessonIds: [] })
        .expect(403);
      await http()
        .delete(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('reviewer'))
        .expect(403);
      expect(await lessonTitles(url)).toEqual([[1, 'roles-lesson']]);
    });

    it('allows ADMIN and EDITOR to write and delete (same as modules)', async () => {
      const { url } = await newModule('roles-write');
      for (const role of ['admin', 'editor'] as const) {
        const lesson = (
          await http()
            .post(url)
            .set('Authorization', as(role))
            .send({ title: title(`by-${role}`) })
            .expect(201)
        ).body;
        await http()
          .patch(`${LESSONS}/${lesson.id}`)
          .set('Authorization', as(role))
          .send({ subtitle: 'ok' })
          .expect(200);
        await http()
          .delete(`${LESSONS}/${lesson.id}`)
          .set('Authorization', as(role))
          .expect(204);
      }
    });
  });

  describe('create and read', () => {
    it('creates a draft lesson with all fields and returns only the public fields', async () => {
      const { url, moduleId } = await newModule('create');
      const res = await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({
          title: `  ${title('full')}  `,
          shortTitle: 'Short',
          subtitle: 'A subtitle',
          introduction: 'First paragraph.\n\nSecond paragraph.',
          estimatedMinutes: 30,
          levels: ['ADVANCED', 'BEGINNER'],
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        moduleId,
        title: title('full'),
        shortTitle: 'Short',
        subtitle: 'A subtitle',
        introduction: 'First paragraph.\n\nSecond paragraph.',
        coverMediaId: null,
        estimatedMinutes: 30,
        levels: ['BEGINNER', 'ADVANCED'],
        position: 1,
        status: 'DRAFT',
        version: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('starts with no levels and no optional fields when only a title is sent', async () => {
      const { url } = await newModule('minimal');
      const lesson = await createLesson(url, 'minimal-lesson');
      expect(lesson).toMatchObject({
        shortTitle: null,
        subtitle: null,
        introduction: null,
        estimatedMinutes: null,
        coverMediaId: null,
        levels: [],
      });
    });

    it('gets a lesson by id', async () => {
      const { url } = await newModule('get');
      const lesson = await createLesson(url, 'get-lesson', {
        levels: ['INTERMEDIATE'],
      });
      const res = await http()
        .get(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(res.body).toEqual(lesson);
    });

    it('returns 400 for a malformed id and 404 for an unknown one', async () => {
      const bad = await http()
        .get(`${LESSONS}/not-a-uuid`)
        .set('Authorization', as('reviewer'))
        .expect(400);
      expect(bad.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });

      const missing = await http()
        .get(`${LESSONS}/${randomUUID()}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      expect(missing.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Lesson not found',
      });

      await http()
        .patch(`${LESSONS}/${randomUUID()}`)
        .set('Authorization', as('editor'))
        .send({ title: 'x' })
        .expect(404);
      await http()
        .put(`${LESSONS}/${randomUUID()}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: [] })
        .expect(404);
      await http()
        .delete(`${LESSONS}/${randomUUID()}`)
        .set('Authorization', as('editor'))
        .expect(404);
    });

    it('requires an existing module that belongs to the course in the URL', async () => {
      const { courseId, moduleId, url } = await newModule('parents');
      const other = await createCourse('parents-other');

      await http()
        .get(`${COURSES}/${courseId}/modules/${randomUUID()}/lessons`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      await http()
        .get(`${COURSES}/${other.id}/modules/${moduleId}/lessons`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      await http()
        .post(`${COURSES}/${other.id}/modules/${moduleId}/lessons`)
        .set('Authorization', as('editor'))
        .send({ title: title('wrong-parent') })
        .expect(404);
      await http()
        .get(`${COURSES}/nope/modules/${moduleId}/lessons`)
        .set('Authorization', as('reviewer'))
        .expect(400);
      expect(await lessonTitles(url)).toEqual([]);
    });
  });

  describe('validation', () => {
    const post = (url: string, body: object) =>
      http().post(url).set('Authorization', as('editor')).send(body);

    it('rejects invalid lesson data with the standard validation error', async () => {
      const { url } = await newModule('validation');

      const missing = await post(url, {}).expect(400);
      expect(missing.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: [{ field: 'title' }],
      });

      const invalid: object[] = [
        { title: '   ' },
        { title: 123 },
        { title: title('x'), estimatedMinutes: 0 },
        { title: title('x'), estimatedMinutes: -5 },
        { title: title('x'), estimatedMinutes: 1.5 },
        { title: title('x'), estimatedMinutes: 'ten' },
        { title: title('x'), levels: ['EXPERT'] },
        { title: title('x'), levels: ['beginner'] },
        { title: title('x'), levels: ['BEGINNER', 'BEGINNER'] },
        { title: title('x'), levels: 'BEGINNER' },
        { title: title('x'), position: 0 },
        { title: title('x'), position: 1.5 },
        { title: title('x'), status: 'PUBLISHED' }, // status cannot be set here
        { title: title('x'), moduleId: randomUUID() },
        { title: title('x'), id: randomUUID() },
      ];
      for (const body of invalid) {
        const res = await post(url, body).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      expect(await lessonTitles(url)).toEqual([]);
    });

    it('enforces the approved limits and rejects, never truncates', async () => {
      const { url } = await newModule('limits');

      const tooLong: [string, number][] = [
        ['title', 201],
        ['shortTitle', 101],
        ['subtitle', 301],
        ['introduction', 5001],
      ];
      for (const [field, length] of tooLong) {
        const res = await post(url, {
          title: title('limit'),
          [field]: 'x'.repeat(length),
        }).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
        expect(res.body.details[0].field).toBe(field);
      }
      expect(await lessonTitles(url)).toEqual([]); // nothing was stored, not even a truncated copy

      const atLimit = await post(url, {
        title: `e2e-${runId}-`.padEnd(200, 'x'),
        shortTitle: 'x'.repeat(100),
        subtitle: 'x'.repeat(300),
        introduction: 'x'.repeat(5000),
      }).expect(201);
      expect(atLimit.body.title).toHaveLength(200);
      expect(atLimit.body.introduction).toHaveLength(5000);
    });

    it('treats blank optional text as none and keeps paragraphs in the introduction', async () => {
      const { url } = await newModule('text');
      const lesson = await post(url, {
        title: title('text'),
        shortTitle: '   ',
        subtitle: '',
        introduction: 'Para one.\r\n\r\n  Para two.  ',
      }).expect(201);
      expect(lesson.body).toMatchObject({
        shortTitle: null,
        subtitle: null,
        introduction: 'Para one.\n\n  Para two.',
      });
    });

    it('does not accept a cover yet (the Media module does not exist)', async () => {
      const { url } = await newModule('cover');
      const res = await post(url, {
        title: title('cover'),
        coverMediaId: randomUUID(),
      }).expect(400);
      expect(res.body.details[0]).toMatchObject({ field: 'coverMediaId' });
      await post(url, {
        title: title('cover-null'),
        coverMediaId: null,
      }).expect(201);
    });

    it('rejects characters the database cannot store with a client error, not a 500', async () => {
      const { url } = await newModule('nul');
      const res = await post(url, { title: 'bad\u0000title' }).expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('rejects an empty update', async () => {
      const { url } = await newModule('empty-update');
      const lesson = await createLesson(url, 'empty');
      const res = await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .send({})
        .expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });
  });

  describe('update', () => {
    it('updates fields, bumps the version and keeps what was not sent', async () => {
      const { url } = await newModule('update');
      const lesson = await createLesson(url, 'update', {
        subtitle: 'keep',
        levels: ['BEGINNER'],
      });

      const res = await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('update-renamed'), estimatedMinutes: 15 })
        .expect(200);
      expect(res.body).toMatchObject({
        id: lesson.id,
        title: title('update-renamed'),
        subtitle: 'keep',
        estimatedMinutes: 15,
        levels: ['BEGINNER'],
        version: 2,
        status: 'DRAFT',
        position: 1,
      });
    });

    it('clears optional fields with null', async () => {
      const { url } = await newModule('clear');
      const lesson = await createLesson(url, 'clear', {
        shortTitle: 's',
        subtitle: 'x',
        introduction: 'i',
        estimatedMinutes: 9,
      });
      const res = await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .send({
          shortTitle: null,
          subtitle: null,
          introduction: null,
          estimatedMinutes: null,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        shortTitle: null,
        subtitle: null,
        introduction: null,
        estimatedMinutes: null,
      });
    });

    it('refuses a stale update with 409', async () => {
      const { url } = await newModule('stale');
      const lesson = await createLesson(url, 'stale');
      await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('stale-1') })
        .expect(200);

      const res = await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('stale-2'), version: 1 })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'CONFLICT',
        details: { currentVersion: 2 },
      });
    });

    it('puts an edited lesson back to DRAFT', async () => {
      const { url } = await newModule('reset');
      const lesson = await createLesson(url, 'reset');
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lesson.id],
      );

      const res = await http()
        .patch(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('reset-2') })
        .expect(200);
      expect(res.body.status).toBe('DRAFT');
    });
  });

  describe('level availability', () => {
    it('replaces the set of levels, returned in canonical order', async () => {
      const { url } = await newModule('levels');
      const lesson = await createLesson(url, 'levels', {
        levels: ['BEGINNER', 'INTERMEDIATE'],
      });

      const res = await http()
        .put(`${LESSONS}/${lesson.id}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['ADVANCED', 'INTERMEDIATE'] })
        .expect(200);
      expect(res.body.levels).toEqual(['INTERMEDIATE', 'ADVANCED']);
      expect(res.body.version).toBe(2);

      const got = await http()
        .get(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body.levels).toEqual(['INTERMEDIATE', 'ADVANCED']);
    });

    it('can remove every level, and each level is stored once', async () => {
      const { url } = await newModule('levels-clear');
      const lesson = await createLesson(url, 'levels-clear', {
        levels: ['BEGINNER'],
      });
      const res = await http()
        .put(`${LESSONS}/${lesson.id}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: [] })
        .expect(200);
      expect(res.body.levels).toEqual([]);
      const rows = await dataSource.query(
        `SELECT 1 FROM "lesson_levels" WHERE "lesson_id" = $1`,
        [lesson.id],
      );
      expect(rows).toHaveLength(0);
    });

    it('rejects unknown, wrongly cased and duplicate levels without changing anything', async () => {
      const { url } = await newModule('levels-bad');
      const lesson = await createLesson(url, 'levels-bad', {
        levels: ['BEGINNER'],
      });
      const put = (body: object) =>
        http()
          .put(`${LESSONS}/${lesson.id}/levels`)
          .set('Authorization', as('editor'))
          .send(body);

      for (const body of [
        { levels: ['EXPERT'] },
        { levels: ['advanced'] },
        { levels: ['ADVANCED', 'ADVANCED'] },
        { levels: 'ADVANCED' },
        {},
        { levels: ['ADVANCED'], extra: true },
      ]) {
        const res = await put(body).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      const got = await http()
        .get(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body.levels).toEqual(['BEGINNER']);
      expect(got.body.version).toBe(1);
    });

    it('does not copy or promote content between levels: availability is exactly what was set', async () => {
      const { url } = await newModule('levels-exact');
      const lesson = await createLesson(url, 'levels-exact', {
        levels: ['ADVANCED'],
      });
      expect(lesson.levels).toEqual(['ADVANCED']);
      const res = await http()
        .put(`${LESSONS}/${lesson.id}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['BEGINNER'] })
        .expect(200);
      expect(res.body.levels).toEqual(['BEGINNER']);
    });

    it('refuses a stale version and counts as an edit (back to DRAFT)', async () => {
      const { url } = await newModule('levels-stale');
      const lesson = await createLesson(url, 'levels-stale');
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lesson.id],
      );

      const ok = await http()
        .put(`${LESSONS}/${lesson.id}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['BEGINNER'], version: 1 })
        .expect(200);
      expect(ok.body).toMatchObject({ status: 'DRAFT', version: 2 });
      await http()
        .put(`${LESSONS}/${lesson.id}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['ADVANCED'], version: 1 })
        .expect(409);
    });
  });

  describe('ordering', () => {
    it('appends lessons in order and lists them deterministically', async () => {
      const { url } = await newModule('order');
      await createLesson(url, 'a');
      await createLesson(url, 'b');
      await createLesson(url, 'c');

      const expected = [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ];
      expect(await lessonTitles(url)).toEqual(expected);
      expect(await lessonTitles(url)).toEqual(expected);
    });

    it('inserts at a position and pushes later lessons down', async () => {
      const { url } = await newModule('insert');
      await createLesson(url, 'a');
      await createLesson(url, 'b');
      await createLesson(url, 'x', { position: 2 });
      await createLesson(url, 'first', { position: 1 });
      expect(await lessonTitles(url)).toEqual([
        [1, 'first'],
        [2, 'a'],
        [3, 'x'],
        [4, 'b'],
      ]);
    });

    it('rejects a position past the end without changing anything', async () => {
      const { url } = await newModule('range');
      await createLesson(url, 'a');
      const res = await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ title: title('z'), position: 9 })
        .expect(422);
      expect(res.body).toMatchObject({
        code: 'BUSINESS_RULE_VIOLATION',
        details: { min: 1, max: 2 },
      });
      expect(await lessonTitles(url)).toEqual([[1, 'a']]);
    });

    it('keeps modules independent', async () => {
      const one = await newModule('iso-1');
      const two = await newModule('iso-2');
      await createLesson(one.url, 'a');
      await createLesson(two.url, 'z');
      expect(await lessonTitles(one.url)).toEqual([[1, 'a']]);
      expect(await lessonTitles(two.url)).toEqual([[1, 'z']]);
    });

    it('closes the gap when a lesson is deleted', async () => {
      const { url } = await newModule('gap');
      const a = await createLesson(url, 'a');
      await createLesson(url, 'b');
      await createLesson(url, 'c');
      await http()
        .delete(`${LESSONS}/${a.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      expect(await lessonTitles(url)).toEqual([
        [1, 'b'],
        [2, 'c'],
      ]);
      await http()
        .get(`${LESSONS}/${a.id}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
    });

    it('reorders deterministically', async () => {
      const { url } = await newModule('reorder');
      const a = await createLesson(url, 'a');
      const b = await createLesson(url, 'b');
      const c = await createLesson(url, 'c');
      const order = (ids: string[]) =>
        http()
          .put(`${url}/order`)
          .set('Authorization', as('editor'))
          .send({ lessonIds: ids });

      const first = await order([c.id, a.id, b.id]).expect(200);
      expect(
        first.body.items.map((l: { title: string }) => strip(l.title)),
      ).toEqual(['c', 'a', 'b']);
      expect(await lessonTitles(url)).toEqual([
        [1, 'c'],
        [2, 'a'],
        [3, 'b'],
      ]);

      const again = await order([c.id, a.id, b.id]).expect(200);
      const summary = (body: { items: { id: string; position: number }[] }) =>
        body.items.map((l) => [l.id, l.position]);
      expect(summary(again.body)).toEqual(summary(first.body));

      await order([b.id, c.id, a.id]).expect(200);
      expect(await lessonTitles(url)).toEqual([
        [1, 'b'],
        [2, 'c'],
        [3, 'a'],
      ]);
    });

    it('rejects an incomplete, duplicated or foreign reorder and keeps the order', async () => {
      const one = await newModule('reorder-bad');
      const two = await newModule('reorder-bad-other');
      const a = await createLesson(one.url, 'a');
      const b = await createLesson(one.url, 'b');
      const foreign = await createLesson(two.url, 'f');
      const order = (lessonIds: unknown) =>
        http()
          .put(`${one.url}/order`)
          .set('Authorization', as('editor'))
          .send({ lessonIds });

      for (const ids of [
        [a.id],
        [a.id, a.id],
        [a.id, b.id, foreign.id],
        [b.id, foreign.id],
      ]) {
        const res = await order(ids).expect(422);
        expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
      }
      await order(['not-a-uuid']).expect(400);
      await order('nope').expect(400);
      expect(await lessonTitles(one.url)).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
      expect(await lessonTitles(two.url)).toEqual([[1, 'f']]);
    });

    it('keeps positions gap-free when lessons are created at the same time', async () => {
      const { url } = await newModule('concurrent');
      const results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((name) =>
          http()
            .post(url)
            .set('Authorization', as('editor'))
            .send({ title: title(name) }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      const positions = (await lessonTitles(url)).map(
        ([position]: [number]) => position,
      );
      expect(positions).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('deleting', () => {
    it('deletes a lesson together with its level rows', async () => {
      const { url } = await newModule('delete');
      const lesson = await createLesson(url, 'delete', {
        levels: ['BEGINNER', 'ADVANCED'],
      });
      await http()
        .delete(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      const rows = await dataSource.query(
        `SELECT 1 FROM "lesson_levels" WHERE "lesson_id" = $1`,
        [lesson.id],
      );
      expect(rows).toHaveLength(0);
    });

    it('blocks deleting a module that still has lessons, and allows it afterwards', async () => {
      const { courseId, moduleId, url } = await newModule('module-delete');
      const lesson = await createLesson(url, 'a');
      const modulePath = `${COURSES}/${courseId}/modules/${moduleId}`;

      const blocked = await http()
        .delete(modulePath)
        .set('Authorization', as('editor'))
        .expect(409);
      expect(blocked.body).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      expect(blocked.body.message).toMatch(/lessons/i);
      await http()
        .get(modulePath)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(await lessonTitles(url)).toEqual([[1, 'a']]);

      await http()
        .delete(`${LESSONS}/${lesson.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      await http()
        .delete(modulePath)
        .set('Authorization', as('editor'))
        .expect(204);
    });

    it('still blocks deleting a course that has modules (Phase 3D rule unchanged)', async () => {
      const { courseId } = await newModule('course-delete');
      await http()
        .delete(`${COURSES}/${courseId}`)
        .set('Authorization', as('admin'))
        .expect(409);
    });
  });

  describe('existing endpoints', () => {
    it('keeps health public and unversioned', async () => {
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });
});
