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
const emailFor = (name: string) => `e2e-curr-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const COURSES = '/api/v1/admin/courses';

describe('Curriculum admin API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens = {} as Record<'admin' | 'editor' | 'reviewer', string>;

  const http = () => request(app.getHttpServer());
  const as = (role: keyof typeof tokens) => `Bearer ${tokens[role]}`;

  const createCourse = async (name: string, extra: object = {}) =>
    (
      await http()
        .post(COURSES)
        .set('Authorization', as('editor'))
        .send({ title: title(name), ...extra })
        .expect(201)
    ).body;

  const createModule = async (
    courseId: string,
    name: string,
    extra: object = {},
  ) =>
    (
      await http()
        .post(`${COURSES}/${courseId}/modules`)
        .set('Authorization', as('editor'))
        .send({ title: title(name), ...extra })
        .expect(201)
    ).body;

  const moduleTitles = async (courseId: string) =>
    (
      await http()
        .get(`${COURSES}/${courseId}/modules`)
        .set('Authorization', as('reviewer'))
        .expect(200)
    ).body.items.map((m: { position: number; title: string }) => [
      m.position,
      m.title.replace(`e2e-${runId}-`, ''),
    ]);

  const cleanup = async () => {
    await dataSource.query(
      `DELETE FROM "course_modules" WHERE "course_id" IN (SELECT "id" FROM "courses" WHERE "title" LIKE $1)`,
      [`e2e-${runId}-%`],
    );
    await dataSource.query(`DELETE FROM "courses" WHERE "title" LIKE $1`, [
      `e2e-${runId}-%`,
    ]);
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-curr-${runId}-%${EMAIL_SUFFIX}`,
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
    const someId = randomUUID();
    const routes: [string, string][] = [
      ['get', COURSES],
      ['post', COURSES],
      ['get', `${COURSES}/${someId}`],
      ['patch', `${COURSES}/${someId}`],
      ['delete', `${COURSES}/${someId}`],
      ['get', `${COURSES}/${someId}/modules`],
      ['post', `${COURSES}/${someId}/modules`],
      ['put', `${COURSES}/${someId}/modules/order`],
      ['get', `${COURSES}/${someId}/modules/${someId}`],
      ['patch', `${COURSES}/${someId}/modules/${someId}`],
      ['delete', `${COURSES}/${someId}/modules/${someId}`],
    ];

    it.each(routes)('%s %s requires authentication', async (method, path) => {
      const res = await (http() as any)[method](path).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it('rejects a role that may not write with 403 in the standard error shape', async () => {
      const res = await http()
        .post(COURSES)
        .set('Authorization', as('reviewer'))
        .send({ title: title('forbidden') })
        .expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        requestId: expect.any(String),
      });

      const course = await createCourse('role-target');
      await http()
        .patch(`${COURSES}/${course.id}`)
        .set('Authorization', as('reviewer'))
        .send({ title: title('hacked') })
        .expect(403);
      await http()
        .post(`${COURSES}/${course.id}/modules`)
        .set('Authorization', as('reviewer'))
        .send({ title: title('m') })
        .expect(403);
      await http()
        .put(`${COURSES}/${course.id}/modules/order`)
        .set('Authorization', as('reviewer'))
        .send({ moduleIds: [] })
        .expect(403);
    });

    it('lets reviewers read', async () => {
      const course = await createCourse('reviewer-read');
      await http()
        .get(COURSES)
        .set('Authorization', as('reviewer'))
        .expect(200);
      await http()
        .get(`${COURSES}/${course.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
    });

    it('lets only ADMIN delete a course', async () => {
      const course = await createCourse('role-delete');
      await http()
        .delete(`${COURSES}/${course.id}`)
        .set('Authorization', as('editor'))
        .expect(403);
      await http()
        .delete(`${COURSES}/${course.id}`)
        .set('Authorization', as('reviewer'))
        .expect(403);
      await http()
        .get(`${COURSES}/${course.id}`)
        .set('Authorization', as('admin'))
        .expect(200);
      await http()
        .delete(`${COURSES}/${course.id}`)
        .set('Authorization', as('admin'))
        .expect(204);
    });
  });

  describe('courses', () => {
    it('creates a draft course and returns only the public fields', async () => {
      const res = await http()
        .post(COURSES)
        .set('Authorization', as('editor'))
        .send({
          title: `  ${title('create')}  `,
          description: 'About this course',
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        title: title('create'),
        description: 'About this course',
        status: 'DRAFT',
        version: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('lists courses with pagination info', async () => {
      const a = await createCourse('list-a');
      const b = await createCourse('list-b');

      const res = await http()
        .get(COURSES)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(res.body).toMatchObject({
        total: expect.any(Number),
        limit: 50,
        offset: 0,
      });

      // Other suites share this database and create courses at the same time, so walk the
      // pages (oldest first) until both of ours have appeared.
      const ids: string[] = [];
      for (
        let offset = 0;
        !(ids.includes(a.id) && ids.includes(b.id));
        offset += 100
      ) {
        const pageRes = await http()
          .get(`${COURSES}?limit=100&offset=${offset}`)
          .set('Authorization', as('reviewer'))
          .expect(200);
        ids.push(...pageRes.body.items.map((c: { id: string }) => c.id));
        expect(pageRes.body.items.length).toBeGreaterThan(0);
      }
      expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));

      const page = await http()
        .get(`${COURSES}?limit=1&offset=0`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.limit).toBe(1);
    });

    it('rejects invalid paging parameters with a validation error', async () => {
      for (const query of ['limit=0', 'limit=101', 'limit=abc', 'offset=-1']) {
        const res = await http()
          .get(`${COURSES}?${query}`)
          .set('Authorization', as('reviewer'))
          .expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
    });

    it('gets a course by id', async () => {
      const course = await createCourse('get');
      const res = await http()
        .get(`${COURSES}/${course.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(res.body).toEqual(course);
    });

    it('updates a course, bumps its version and keeps unsent fields', async () => {
      const course = await createCourse('update', { description: 'keep me' });
      const res = await http()
        .patch(`${COURSES}/${course.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('update-renamed') })
        .expect(200);
      expect(res.body).toMatchObject({
        id: course.id,
        title: title('update-renamed'),
        description: 'keep me',
        version: 2,
        status: 'DRAFT',
      });
    });

    it('clears the description with null', async () => {
      const course = await createCourse('clear', {
        description: 'to be cleared',
      });
      const res = await http()
        .patch(`${COURSES}/${course.id}`)
        .set('Authorization', as('editor'))
        .send({ description: null })
        .expect(200);
      expect(res.body.description).toBeNull();
    });

    it('refuses a stale update with 409', async () => {
      const course = await createCourse('stale');
      await http()
        .patch(`${COURSES}/${course.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('stale-1') })
        .expect(200);

      const res = await http()
        .patch(`${COURSES}/${course.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('stale-2'), version: 1 })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'CONFLICT',
        details: { currentVersion: 2 },
      });
    });

    it('returns 400 for a malformed course id and 404 for an unknown one', async () => {
      const bad = await http()
        .get(`${COURSES}/not-a-uuid`)
        .set('Authorization', as('reviewer'))
        .expect(400);
      expect(bad.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });

      const missing = await http()
        .get(`${COURSES}/${randomUUID()}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      expect(missing.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Course not found',
      });

      await http()
        .patch(`${COURSES}/${randomUUID()}`)
        .set('Authorization', as('editor'))
        .send({ title: 'x' })
        .expect(404);
      await http()
        .delete(`${COURSES}/${randomUUID()}`)
        .set('Authorization', as('admin'))
        .expect(404);
    });

    it('returns validation errors for invalid course data', async () => {
      const post = (body: object) =>
        http().post(COURSES).set('Authorization', as('editor')).send(body);

      const missingTitle = await post({}).expect(400);
      expect(missingTitle.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: [{ field: 'title' }],
      });
      await post({ title: '   ' }).expect(400);
      await post({ title: 'x'.repeat(201) }).expect(400);
      await post({ title: 123 }).expect(400);
      await post({ title: title('x'), description: 'y'.repeat(5001) }).expect(
        400,
      );
      await post({ title: title('x'), status: 'PUBLISHED' }).expect(400); // status cannot be set here
      await post({ title: title('x'), id: randomUUID() }).expect(400);
    });

    it('rejects an empty update', async () => {
      const course = await createCourse('empty-update');
      const res = await http()
        .patch(`${COURSES}/${course.id}`)
        .set('Authorization', as('editor'))
        .send({})
        .expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('does not leak persistence details or secrets', async () => {
      const course = await createCourse('no-leak');
      const text = JSON.stringify(
        (
          await http()
            .get(`${COURSES}/${course.id}`)
            .set('Authorization', as('admin'))
            .expect(200)
        ).body,
      );
      expect(Object.keys(JSON.parse(text)).sort()).toEqual([
        'createdAt',
        'description',
        'id',
        'status',
        'title',
        'updatedAt',
        'version',
      ]);
    });
  });

  describe('modules', () => {
    it('creates a module that belongs to the right course', async () => {
      const course = await createCourse('mod-create');
      const other = await createCourse('mod-create-other');

      const module = await createModule(course.id, 'm1', {
        description: 'first',
      });
      expect(module).toEqual({
        id: expect.any(String),
        courseId: course.id,
        title: title('m1'),
        description: 'first',
        status: 'DRAFT',
        position: 1,
        version: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      expect(await moduleTitles(course.id)).toEqual([[1, 'm1']]);
      expect(await moduleTitles(other.id)).toEqual([]);
    });

    it('appends in order and returns modules in a deterministic order', async () => {
      const course = await createCourse('mod-order');
      await createModule(course.id, 'a');
      await createModule(course.id, 'b');
      await createModule(course.id, 'c');

      const expected = [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ];
      expect(await moduleTitles(course.id)).toEqual(expected);
      expect(await moduleTitles(course.id)).toEqual(expected); // repeatable
    });

    it('inserts at a position and pushes the following modules down', async () => {
      const course = await createCourse('mod-insert');
      await createModule(course.id, 'a');
      await createModule(course.id, 'b');
      await createModule(course.id, 'x', { position: 2 });
      await createModule(course.id, 'first', { position: 1 });

      expect(await moduleTitles(course.id)).toEqual([
        [1, 'first'],
        [2, 'a'],
        [3, 'x'],
        [4, 'b'],
      ]);
    });

    it('rejects an out-of-range position without changing anything', async () => {
      const course = await createCourse('mod-range');
      await createModule(course.id, 'a');
      const res = await http()
        .post(`${COURSES}/${course.id}/modules`)
        .set('Authorization', as('editor'))
        .send({ title: title('z'), position: 9 })
        .expect(422);
      expect(res.body).toMatchObject({
        code: 'BUSINESS_RULE_VIOLATION',
        details: { min: 1, max: 2 },
      });
      expect(await moduleTitles(course.id)).toEqual([[1, 'a']]);
    });

    it('returns validation errors for invalid module data', async () => {
      const course = await createCourse('mod-invalid');
      const post = (body: object) =>
        http()
          .post(`${COURSES}/${course.id}/modules`)
          .set('Authorization', as('editor'))
          .send(body);

      const res = await post({}).expect(400);
      expect(res.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'title' }],
      });
      await post({ title: '  ' }).expect(400);
      await post({ title: 'x'.repeat(201) }).expect(400);
      await post({ title: title('x'), position: 0 }).expect(400);
      await post({ title: title('x'), position: 1.5 }).expect(400);
      await post({ title: title('x'), position: 'first' }).expect(400);
      await post({ title: title('x'), courseId: randomUUID() }).expect(400);
      expect(await moduleTitles(course.id)).toEqual([]);
    });

    it('requires an existing course, and a valid course id', async () => {
      await http()
        .post(`${COURSES}/${randomUUID()}/modules`)
        .set('Authorization', as('editor'))
        .send({ title: title('m') })
        .expect(404);
      await http()
        .get(`${COURSES}/${randomUUID()}/modules`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      const res = await http()
        .post(`${COURSES}/nope/modules`)
        .set('Authorization', as('editor'))
        .send({ title: title('m') })
        .expect(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });

    it('gets, updates and deletes a module, closing the gap in the order', async () => {
      const course = await createCourse('mod-crud');
      const a = await createModule(course.id, 'a');
      const b = await createModule(course.id, 'b');
      await createModule(course.id, 'c');

      const got = await http()
        .get(`${COURSES}/${course.id}/modules/${b.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body).toEqual(b);

      const updated = await http()
        .patch(`${COURSES}/${course.id}/modules/${b.id}`)
        .set('Authorization', as('editor'))
        .send({ title: title('b2') })
        .expect(200);
      expect(updated.body).toMatchObject({
        title: title('b2'),
        position: 2,
        version: 2,
      });

      await http()
        .delete(`${COURSES}/${course.id}/modules/${a.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      expect(await moduleTitles(course.id)).toEqual([
        [1, 'b2'],
        [2, 'c'],
      ]);

      await http()
        .get(`${COURSES}/${course.id}/modules/${a.id}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
    });

    it('does not allow reaching a module through a different course', async () => {
      const course = await createCourse('mod-cross-1');
      const other = await createCourse('mod-cross-2');
      const module = await createModule(course.id, 'a');
      const path = `${COURSES}/${other.id}/modules/${module.id}`;

      await http().get(path).set('Authorization', as('reviewer')).expect(404);
      await http()
        .patch(path)
        .set('Authorization', as('editor'))
        .send({ title: title('hijack') })
        .expect(404);
      await http().delete(path).set('Authorization', as('editor')).expect(404);
      expect(await moduleTitles(course.id)).toEqual([[1, 'a']]);
    });

    it('reorders modules deterministically', async () => {
      const course = await createCourse('mod-reorder');
      const a = await createModule(course.id, 'a');
      const b = await createModule(course.id, 'b');
      const c = await createModule(course.id, 'c');

      const order = (ids: string[]) =>
        http()
          .put(`${COURSES}/${course.id}/modules/order`)
          .set('Authorization', as('editor'))
          .send({ moduleIds: ids });

      const first = await order([c.id, a.id, b.id]).expect(200);
      expect(first.body.items.map((m: { title: string }) => m.title)).toEqual([
        title('c'),
        title('a'),
        title('b'),
      ]);
      expect(await moduleTitles(course.id)).toEqual([
        [1, 'c'],
        [2, 'a'],
        [3, 'b'],
      ]);

      const again = await order([c.id, a.id, b.id]).expect(200);
      const summary = (body: { items: { id: string; position: number }[] }) =>
        body.items.map((m) => [m.id, m.position]);
      expect(summary(again.body)).toEqual(summary(first.body));

      await order([b.id, c.id, a.id]).expect(200);
      expect(await moduleTitles(course.id)).toEqual([
        [1, 'b'],
        [2, 'c'],
        [3, 'a'],
      ]);
    });

    it('rejects an incomplete, duplicated or foreign reorder and keeps the current order', async () => {
      const course = await createCourse('mod-reorder-bad');
      const other = await createCourse('mod-reorder-bad-other');
      const a = await createModule(course.id, 'a');
      const b = await createModule(course.id, 'b');
      const foreign = await createModule(other.id, 'f');

      const order = (moduleIds: unknown) =>
        http()
          .put(`${COURSES}/${course.id}/modules/order`)
          .set('Authorization', as('editor'))
          .send({ moduleIds });

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

      expect(await moduleTitles(course.id)).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
      expect(await moduleTitles(other.id)).toEqual([[1, 'f']]);
    });
  });

  describe('deleting a course', () => {
    it('is refused with 409 while the course has modules, and nothing is lost', async () => {
      const course = await createCourse('del-blocked');
      await createModule(course.id, 'a');
      await createModule(course.id, 'b');

      const res = await http()
        .delete(`${COURSES}/${course.id}`)
        .set('Authorization', as('admin'))
        .expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        details: { moduleCount: 2 },
      });

      await http()
        .get(`${COURSES}/${course.id}`)
        .set('Authorization', as('admin'))
        .expect(200);
      expect(await moduleTitles(course.id)).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
    });

    it('succeeds once the modules have been removed', async () => {
      const course = await createCourse('del-ok');
      const module = await createModule(course.id, 'a');

      await http()
        .delete(`${COURSES}/${course.id}/modules/${module.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      await http()
        .delete(`${COURSES}/${course.id}`)
        .set('Authorization', as('admin'))
        .expect(204);
      await http()
        .get(`${COURSES}/${course.id}`)
        .set('Authorization', as('admin'))
        .expect(404);
    });
  });

  describe('existing endpoints', () => {
    it('keeps health public and unversioned', async () => {
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });
});
