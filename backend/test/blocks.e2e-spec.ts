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
const emailFor = (name: string) => `e2e-blk-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const COURSES = '/api/v1/admin/courses';
const LESSONS = '/api/v1/admin/lessons';

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});
const textOf = (block: { sharedContent: ReturnType<typeof rich> | null }) =>
  block.sharedContent?.body.content[0].content[0].text ?? null;

describe('Lesson blocks admin API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens = {} as Record<'admin' | 'editor' | 'reviewer', string>;

  const http = () => request(app.getHttpServer());
  const as = (role: keyof typeof tokens) => `Bearer ${tokens[role]}`;

  /** A course > module > lesson created through the API; returns the lesson and its blocks URL. */
  const newLesson = async (name: string) => {
    const course = (
      await http()
        .post(COURSES)
        .set('Authorization', as('editor'))
        .send({ title: title(name) })
        .expect(201)
    ).body;
    const module = (
      await http()
        .post(`${COURSES}/${course.id}/modules`)
        .set('Authorization', as('editor'))
        .send({ title: title(`${name}-module`) })
        .expect(201)
    ).body;
    const lesson = (
      await http()
        .post(`${COURSES}/${course.id}/modules/${module.id}/lessons`)
        .set('Authorization', as('editor'))
        .send({ title: title(`${name}-lesson`) })
        .expect(201)
    ).body;
    return {
      lesson,
      lessonId: lesson.id as string,
      url: `${LESSONS}/${lesson.id}/blocks`,
    };
  };

  const createBlock = async (
    url: string,
    label: string | null,
    extra: object = {},
  ) =>
    (
      await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({
          type: 'RICH_TEXT',
          ...(label === null ? {} : { sharedContent: rich(label) }),
          ...extra,
        })
        .expect(201)
    ).body;

  const blockLayout = async (url: string) =>
    (
      await http().get(url).set('Authorization', as('reviewer')).expect(200)
    ).body.items.map(
      (b: {
        position: number;
        sharedContent: ReturnType<typeof rich> | null;
      }) => [b.position, textOf(b)],
    );

  const getLesson = async (lessonId: string) =>
    (
      await http()
        .get(`${LESSONS}/${lessonId}`)
        .set('Authorization', as('reviewer'))
        .expect(200)
    ).body;

  const cleanup = async () => {
    const like = `e2e-${runId}-%`;
    const modules = `SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;
    const owned = `SELECT "id" FROM "lessons" WHERE "module_id" IN (${modules})`;
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
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-blk-${runId}-%${EMAIL_SUFFIX}`,
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
    const base = `${LESSONS}/${id}/blocks`;
    const routes: [string, string][] = [
      ['get', base],
      ['post', base],
      ['put', `${base}/order`],
      ['get', `${base}/${id}`],
      ['patch', `${base}/${id}`],
      ['post', `${base}/${id}/duplicate`],
      ['delete', `${base}/${id}`],
      ['put', `${base}/${id}/levels/BEGINNER`],
      ['delete', `${base}/${id}/levels/BEGINNER`],
      ['get', `${LESSONS}/${id}/preview?level=BEGINNER`],
    ];

    it.each(routes)('%s %s requires authentication', async (method, path) => {
      const res = await (http() as any)[method](path).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it('lets reviewers read but not write, with 403 in the standard error shape', async () => {
      const { url } = await newLesson('roles');
      const block = await createBlock(url, 'a');

      await http().get(url).set('Authorization', as('reviewer')).expect(200);
      await http()
        .get(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);

      const denied = await http()
        .post(url)
        .set('Authorization', as('reviewer'))
        .send({ type: 'RICH_TEXT' })
        .expect(403);
      expect(denied.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        requestId: expect.any(String),
      });

      await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .send({ sharedContent: null })
        .expect(403);
      await http()
        .post(`${url}/${block.id}/duplicate`)
        .set('Authorization', as('reviewer'))
        .expect(403);
      await http()
        .put(`${url}/order`)
        .set('Authorization', as('reviewer'))
        .send({ blockIds: [] })
        .expect(403);
      await http()
        .delete(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(403);
      expect(await blockLayout(url)).toEqual([[1, 'a']]);
    });

    it('allows ADMIN and EDITOR to create, edit, duplicate and delete', async () => {
      const { url } = await newLesson('roles-write');
      for (const role of ['admin', 'editor'] as const) {
        const block = (
          await http()
            .post(url)
            .set('Authorization', as(role))
            .send({ type: 'RICH_TEXT', sharedContent: rich(role) })
            .expect(201)
        ).body;
        await http()
          .patch(`${url}/${block.id}`)
          .set('Authorization', as(role))
          .send({ sharedContent: rich('edited') })
          .expect(200);
        const copy = (
          await http()
            .post(`${url}/${block.id}/duplicate`)
            .set('Authorization', as(role))
            .expect(201)
        ).body;
        await http()
          .delete(`${url}/${copy.id}`)
          .set('Authorization', as(role))
          .expect(204);
        await http()
          .delete(`${url}/${block.id}`)
          .set('Authorization', as(role))
          .expect(204);
      }
    });
  });

  describe('create and read', () => {
    it('creates a RICH_TEXT block and returns only the public fields', async () => {
      const { url, lessonId } = await newLesson('create');
      const res = await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT', sharedContent: rich('Hello') })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        lessonId,
        type: 'RICH_TEXT',
        position: 1,
        sharedContent: rich('Hello'),
        levels: [],
        version: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('creates an empty draft block when no content is sent', async () => {
      const { url } = await newLesson('empty');
      const block = await createBlock(url, null);
      expect(block.sharedContent).toBeNull();
    });

    it('gets a block, and reports malformed and unknown ids', async () => {
      const { url } = await newLesson('get');
      const block = await createBlock(url, 'a');
      const got = await http()
        .get(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body).toEqual(block);

      const bad = await http()
        .get(`${url}/not-a-uuid`)
        .set('Authorization', as('reviewer'))
        .expect(400);
      expect(bad.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
      const missing = await http()
        .get(`${url}/${randomUUID()}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      expect(missing.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Block not found',
      });

      await http()
        .get(`${LESSONS}/${randomUUID()}/blocks`)
        .set('Authorization', as('reviewer'))
        .expect(404);
      await http()
        .post(`${LESSONS}/${randomUUID()}/blocks`)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT' })
        .expect(404);
      await http()
        .get(`${LESSONS}/nope/blocks`)
        .set('Authorization', as('reviewer'))
        .expect(400);
    });

    it('cannot reach a block through another lesson', async () => {
      const one = await newLesson('cross-1');
      const two = await newLesson('cross-2');
      const block = await createBlock(one.url, 'a');
      const path = `${two.url}/${block.id}`;

      await http().get(path).set('Authorization', as('reviewer')).expect(404);
      await http()
        .patch(path)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('hijack') })
        .expect(404);
      await http()
        .post(`${path}/duplicate`)
        .set('Authorization', as('editor'))
        .expect(404);
      await http().delete(path).set('Authorization', as('editor')).expect(404);
      expect(await blockLayout(one.url)).toEqual([[1, 'a']]);
      expect(await blockLayout(two.url)).toEqual([]);
    });
  });

  describe('block types', () => {
    it('rejects types the guide defines but that are not implemented yet (422)', async () => {
      const { url } = await newLesson('types');
      for (const type of [
        'QUIZ',
        'IMAGE',
        'SCRIPTURE_PASSAGE',
        'CALLOUT',
        'SUMMARY',
        'MAP',
      ]) {
        const res = await http()
          .post(url)
          .set('Authorization', as('editor'))
          .send({ type })
          .expect(422);
        expect(res.body).toMatchObject({
          code: 'BUSINESS_RULE_VIOLATION',
          details: { type, available: ['RICH_TEXT'] },
        });
      }
      expect(await blockLayout(url)).toEqual([]);
    });

    it('rejects identifiers that are not in the guide at all (400)', async () => {
      const { url } = await newLesson('types-bad');
      for (const body of [
        { type: 'HTML' },
        { type: 'rich_text' },
        { type: '' },
        { type: 5 },
        {},
      ]) {
        const res = await http()
          .post(url)
          .set('Authorization', as('editor'))
          .send(body)
          .expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
    });

    it('never lets the type change: it is not accepted on update', async () => {
      const { url } = await newLesson('immutable');
      const block = await createBlock(url, 'a');
      const res = await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ type: 'QUIZ', sharedContent: rich('x') })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(
        (
          await http()
            .get(`${url}/${block.id}`)
            .set('Authorization', as('reviewer'))
            .expect(200)
        ).body,
      ).toEqual(block);
    });
  });

  describe('rich text validation', () => {
    const post = (url: string, sharedContent: unknown) =>
      http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT', sharedContent });

    it('accepts lists, marks and safe links', async () => {
      const { url } = await newLesson('rt-valid');
      const content = {
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
                {
                  type: 'text',
                  text: 'link',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'https://example.com/x?y=1' },
                    },
                  ],
                },
                {
                  type: 'text',
                  text: 'mail',
                  marks: [
                    { type: 'link', attrs: { href: 'mailto:a@example.com' } },
                  ],
                },
              ],
            },
            {
              type: 'orderedList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'one' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
      const res = await post(url, content).expect(201);
      expect(res.body.sharedContent).toEqual(content);
    });

    it('rejects HTML, unknown nodes and marks, markup-like keys and bad link schemes with the problem paths (422)', async () => {
      const { url } = await newLesson('rt-invalid');
      const bad: [string, unknown, string][] = [
        ['html string', { html: '<p>x</p>' }, '.html'],
        ['body as html', { body: '<p>x</p>' }, 'body'],
        [
          'unknown node',
          { body: { type: 'doc', content: [{ type: 'script' }] } },
          'body.content[0].type',
        ],
        [
          'image node',
          { body: { type: 'doc', content: [{ type: 'image', src: 'x' }] } },
          'body.content[0].type',
        ],
        [
          'unknown mark',
          {
            body: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'x', marks: [{ type: 'color' }] },
                  ],
                },
              ],
            },
          },
          'body.content[0].content[0].marks[0].type',
        ],
        [
          'markup-like key',
          {
            body: {
              type: 'doc',
              content: [{ type: 'paragraph', onclick: 'x()' }],
            },
          },
          'body.content[0].onclick',
        ],
        [
          'style key',
          {
            body: {
              type: 'doc',
              content: [{ type: 'paragraph', style: 'color:red' }],
            },
          },
          'body.content[0].style',
        ],
        [
          'javascript link',
          {
            body: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'x',
                      marks: [
                        {
                          type: 'link',
                          attrs: { href: 'javascript:alert(1)' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          'body.content[0].content[0].marks[0].attrs.href',
        ],
        [
          'data link',
          {
            body: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'x',
                      marks: [
                        {
                          type: 'link',
                          attrs: { href: 'data:text/html;base64,AAAA' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          'body.content[0].content[0].marks[0].attrs.href',
        ],
        [
          'relative link',
          {
            body: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'x',
                      marks: [{ type: 'link', attrs: { href: '/admin' } }],
                    },
                  ],
                },
              ],
            },
          },
          'body.content[0].content[0].marks[0].attrs.href',
        ],
        [
          'heading node (not part of the contract)',
          {
            body: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Title' }],
                },
              ],
            },
          },
          'body.content[0].type',
        ],
        [
          'wrong document type',
          { body: { type: 'page', content: [] } },
          'body.type',
        ],
      ];

      for (const [name, content, path] of bad) {
        const res = await post(url, content).expect(422);
        expect(res.body.code, name).toBe('BUSINESS_RULE_VIOLATION');
        expect(
          res.body.details.problems.map((p: { path: string }) => p.path),
          name,
        ).toContain(path);
      }
      expect(await blockLayout(url)).toEqual([]);
    });

    it('rejects content nested too deeply (422), including absurd nesting, without a server error', async () => {
      const { url } = await newLesson('rt-deep');
      let inner: unknown = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'deep' }],
      };
      for (let i = 0; i < 6; i += 1) {
        inner = {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [inner] }],
        };
      }
      await post(url, { body: { type: 'doc', content: [inner] } }).expect(422);

      // ~15,000 levels of nesting, comfortably inside the request size limit
      const absurd =
        '{"body":' + '{"a":'.repeat(15_000) + '1' + '}'.repeat(15_000) + '}';
      const res = await http()
        .post(url)
        .set('Authorization', as('editor'))
        .set('Content-Type', 'application/json')
        .send(`{"type":"RICH_TEXT","sharedContent":${absurd}}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'BODY_TOO_DEEPLY_NESTED' });
      expect(await blockLayout(url)).toEqual([]);
    });

    it('rejects content over the size limit with 413, and a NUL character with 422', async () => {
      const { url } = await newLesson('rt-size');
      const huge = await post(url, rich('x'.repeat(150_000)));
      expect(huge.status).toBe(413);
      expect(huge.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });

      const nul = await post(url, rich('bad\u0000text')).expect(422);
      expect(nul.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('rejects content that is not an object (400)', async () => {
      const { url } = await newLesson('rt-shape');
      for (const sharedContent of ['<p>x</p>', 5, true, [], [rich('x')]]) {
        const res = await post(url, sharedContent).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
    });

    it('validates content on update too, and leaves the block untouched when it is rejected', async () => {
      const { url } = await newLesson('rt-update');
      const block = await createBlock(url, 'keep');
      await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: { html: '<script>x</script>' } })
        .expect(422);
      const got = await http()
        .get(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body).toMatchObject({
        sharedContent: rich('keep'),
        version: 1,
      });
    });
  });

  describe('update', () => {
    it('replaces the content, bumps the version and keeps id, type and position', async () => {
      const { url } = await newLesson('update');
      await createBlock(url, 'a');
      const block = await createBlock(url, 'b');

      const res = await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('b2') })
        .expect(200);
      expect(res.body).toMatchObject({
        id: block.id,
        type: 'RICH_TEXT',
        position: 2,
        sharedContent: rich('b2'),
        version: 2,
      });
    });

    it('clears the content with null', async () => {
      const { url } = await newLesson('clear');
      const block = await createBlock(url, 'a');
      const res = await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: null })
        .expect(200);
      expect(res.body.sharedContent).toBeNull();
    });

    it('rejects an empty update', async () => {
      const { url } = await newLesson('empty-update');
      const block = await createBlock(url, 'a');
      const res = await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({})
        .expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('refuses a stale update with 409', async () => {
      const { url } = await newLesson('stale');
      const block = await createBlock(url, 'a');
      await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('a2') })
        .expect(200);

      const res = await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('a3'), version: 1 })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'CONFLICT',
        details: { currentVersion: 2 },
      });
    });
  });

  describe('ordering', () => {
    it('appends blocks in order and lists them deterministically', async () => {
      const { url } = await newLesson('order');
      await createBlock(url, 'a');
      await createBlock(url, 'b');
      await createBlock(url, 'c');
      const expected = [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ];
      expect(await blockLayout(url)).toEqual(expected);
      expect(await blockLayout(url)).toEqual(expected);
    });

    it('inserts at a position and pushes later blocks down', async () => {
      const { url } = await newLesson('insert');
      await createBlock(url, 'a');
      await createBlock(url, 'b');
      await createBlock(url, 'x', { position: 2 });
      await createBlock(url, 'first', { position: 1 });
      expect(await blockLayout(url)).toEqual([
        [1, 'first'],
        [2, 'a'],
        [3, 'x'],
        [4, 'b'],
      ]);
    });

    it('rejects a position past the end (422) or below 1 (400) without changing anything', async () => {
      const { url } = await newLesson('range');
      await createBlock(url, 'a');
      const past = await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT', position: 9 })
        .expect(422);
      expect(past.body).toMatchObject({
        code: 'BUSINESS_RULE_VIOLATION',
        details: { min: 1, max: 2 },
      });
      await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT', position: 0 })
        .expect(400);
      expect(await blockLayout(url)).toEqual([[1, 'a']]);
    });

    it('closes the gap when a block is deleted', async () => {
      const { url } = await newLesson('gap');
      const a = await createBlock(url, 'a');
      await createBlock(url, 'b');
      await createBlock(url, 'c');
      await http()
        .delete(`${url}/${a.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      expect(await blockLayout(url)).toEqual([
        [1, 'b'],
        [2, 'c'],
      ]);
      await http()
        .get(`${url}/${a.id}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
    });

    it('reorders deterministically and keeps block ids stable', async () => {
      const { url } = await newLesson('reorder');
      const a = await createBlock(url, 'a');
      const b = await createBlock(url, 'b');
      const c = await createBlock(url, 'c');
      const order = (ids: string[]) =>
        http()
          .put(`${url}/order`)
          .set('Authorization', as('editor'))
          .send({ blockIds: ids });

      const first = await order([c.id, a.id, b.id]).expect(200);
      expect(first.body.items.map((x: { id: string }) => x.id)).toEqual([
        c.id,
        a.id,
        b.id,
      ]);
      expect(await blockLayout(url)).toEqual([
        [1, 'c'],
        [2, 'a'],
        [3, 'b'],
      ]);

      const again = await order([c.id, a.id, b.id]).expect(200);
      const summary = (body: { items: { id: string; position: number }[] }) =>
        body.items.map((x) => [x.id, x.position]);
      expect(summary(again.body)).toEqual(summary(first.body));
    });

    it('rejects an incomplete, duplicated or foreign reorder and keeps the order', async () => {
      const one = await newLesson('reorder-bad');
      const two = await newLesson('reorder-bad-other');
      const a = await createBlock(one.url, 'a');
      const b = await createBlock(one.url, 'b');
      const foreign = await createBlock(two.url, 'f');
      const order = (blockIds: unknown) =>
        http()
          .put(`${one.url}/order`)
          .set('Authorization', as('editor'))
          .send({ blockIds });

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
      expect(await blockLayout(one.url)).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
      expect(await blockLayout(two.url)).toEqual([[1, 'f']]);
    });

    it('keeps positions gap-free when blocks are created at the same time', async () => {
      const { url } = await newLesson('concurrent');
      const results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((label) =>
          http()
            .post(url)
            .set('Authorization', as('editor'))
            .send({ type: 'RICH_TEXT', sharedContent: rich(label) }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      expect(
        (await blockLayout(url)).map(([position]: [number]) => position),
      ).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('duplicate', () => {
    it('creates an independent copy right after the original', async () => {
      const { url } = await newLesson('duplicate');
      const a = await createBlock(url, 'a');
      await createBlock(url, 'b');

      const res = await http()
        .post(`${url}/${a.id}/duplicate`)
        .set('Authorization', as('editor'))
        .expect(201);
      expect(res.body).toMatchObject({
        type: 'RICH_TEXT',
        position: 2,
        sharedContent: rich('a'),
        version: 1,
      });
      expect(res.body.id).not.toBe(a.id);
      expect(await blockLayout(url)).toEqual([
        [1, 'a'],
        [2, 'a'],
        [3, 'b'],
      ]);
    });

    it('does not link the copy to the original: editing one leaves the other alone', async () => {
      const { url } = await newLesson('duplicate-independent');
      const a = await createBlock(url, 'a');
      const copy = (
        await http()
          .post(`${url}/${a.id}/duplicate`)
          .set('Authorization', as('editor'))
          .expect(201)
      ).body;

      await http()
        .patch(`${url}/${copy.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('changed') })
        .expect(200);
      const original = (
        await http()
          .get(`${url}/${a.id}`)
          .set('Authorization', as('reviewer'))
          .expect(200)
      ).body;
      expect(original.sharedContent).toEqual(rich('a'));
      expect(original.version).toBe(1);
    });

    it('duplicates a block that has no content yet', async () => {
      const { url } = await newLesson('duplicate-empty');
      const empty = await createBlock(url, null);
      const copy = (
        await http()
          .post(`${url}/${empty.id}/duplicate`)
          .set('Authorization', as('editor'))
          .expect(201)
      ).body;
      expect(copy.sharedContent).toBeNull();
    });
  });

  describe('lesson status and deletion', () => {
    it('puts the lesson back to DRAFT on any block change, without changing the lesson version', async () => {
      const { url, lessonId } = await newLesson('status');
      const before = await getLesson(lessonId);

      const setApproved = () =>
        dataSource.query(
          `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
          [lessonId],
        );

      await setApproved();
      const block = await createBlock(url, 'a');
      expect((await getLesson(lessonId)).status).toBe('DRAFT');

      await setApproved();
      await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('b') })
        .expect(200);
      expect((await getLesson(lessonId)).status).toBe('DRAFT');

      await setApproved();
      const copy = (
        await http()
          .post(`${url}/${block.id}/duplicate`)
          .set('Authorization', as('editor'))
          .expect(201)
      ).body;
      expect((await getLesson(lessonId)).status).toBe('DRAFT');

      await setApproved();
      await http()
        .put(`${url}/order`)
        .set('Authorization', as('editor'))
        .send({ blockIds: [copy.id, block.id] })
        .expect(200);
      expect((await getLesson(lessonId)).status).toBe('DRAFT');

      await setApproved();
      await http()
        .delete(`${url}/${copy.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      const after = await getLesson(lessonId);
      expect(after.status).toBe('DRAFT');
      expect(after.version).toBe(before.version);
    });

    it('does not touch the lesson when a block request is rejected', async () => {
      const { url, lessonId } = await newLesson('status-rejected');
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );
      await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'QUIZ' })
        .expect(422);
      await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT', sharedContent: { html: 'x' } })
        .expect(422);
      expect((await getLesson(lessonId)).status).toBe('APPROVED');
    });

    it('blocks deleting a lesson that has blocks (409) and allows it once they are removed', async () => {
      const { url, lessonId } = await newLesson('lesson-delete');
      const a = await createBlock(url, 'a');
      const b = await createBlock(url, 'b');

      const blocked = await http()
        .delete(`${LESSONS}/${lessonId}`)
        .set('Authorization', as('editor'))
        .expect(409);
      expect(blocked.body).toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        details: { blockCount: 2 },
      });
      expect(blocked.body.message).toMatch(/blocks/i);
      await getLesson(lessonId);
      expect(await blockLayout(url)).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);

      await http()
        .delete(`${url}/${a.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      await http()
        .delete(`${LESSONS}/${lessonId}`)
        .set('Authorization', as('editor'))
        .expect(409);
      await http()
        .delete(`${url}/${b.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      await http()
        .delete(`${LESSONS}/${lessonId}`)
        .set('Authorization', as('editor'))
        .expect(204);
      await http()
        .get(`${LESSONS}/${lessonId}`)
        .set('Authorization', as('reviewer'))
        .expect(404);
    });

    it('keeps the earlier delete rules: a module with lessons and a course with modules stay protected', async () => {
      const { lesson } = await newLesson('chain');
      const module = await dataSource.query(
        `SELECT "module_id", "course_id" FROM "lessons" l JOIN "course_modules" m ON m."id" = l."module_id" WHERE l."id" = $1`,
        [lesson.id],
      );
      const modulePath = `${COURSES}/${module[0].course_id}/modules/${module[0].module_id}`;
      await http()
        .delete(modulePath)
        .set('Authorization', as('editor'))
        .expect(409);
      await http()
        .delete(`${COURSES}/${module[0].course_id}`)
        .set('Authorization', as('admin'))
        .expect(409);
    });
  });

  describe('levels with the real registry (RICH_TEXT variants are unconfirmed)', () => {
    const putLevel = (
      url: string,
      blockId: string,
      level: string,
      body: object,
    ) =>
      http()
        .put(`${url}/${blockId}/levels/${level}`)
        .set('Authorization', as('editor'))
        .send(body);

    const lessonWithLevels = async (name: string, levels: string[]) => {
      const made = await newLesson(name);
      await http()
        .put(`${LESSONS}/${made.lessonId}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels })
        .expect(200);
      return made;
    };

    it('new blocks are hidden everywhere, and existing ones stay hidden until configured', async () => {
      const { url } = await lessonWithLevels('lv-hidden', [
        'BEGINNER',
        'ADVANCED',
      ]);
      const block = await createBlock(url, 'a');
      expect(block.levels).toEqual([]);
    });

    it('can be created visible at chosen levels (a subset of the lesson levels)', async () => {
      const { url } = await lessonWithLevels('lv-create', [
        'BEGINNER',
        'INTERMEDIATE',
      ]);
      const block = await createBlock(url, 'a', {
        levels: ['INTERMEDIATE', 'BEGINNER'],
      });
      expect(block.levels).toEqual([
        { level: 'BEGINNER', content: null },
        { level: 'INTERMEDIATE', content: null },
      ]);
      const outside = await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({ type: 'RICH_TEXT', levels: ['ADVANCED'] })
        .expect(422);
      expect(outside.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('makes a block visible with its shared content, and hides it again', async () => {
      const { url } = await lessonWithLevels('lv-visible', ['BEGINNER']);
      const block = await createBlock(url, 'a');

      const shown = await putLevel(url, block.id, 'BEGINNER', {
        content: null,
      }).expect(200);
      expect(shown.body.levels).toEqual([{ level: 'BEGINNER', content: null }]);
      expect(shown.body.version).toBe(block.version + 1);

      const hidden = await http()
        .delete(`${url}/${block.id}/levels/BEGINNER`)
        .set('Authorization', as('editor'))
        .expect(200);
      expect(hidden.body.levels).toEqual([]);
    });

    it('rejects a variant for RICH_TEXT with 422, because its contract does not confirm variants', async () => {
      const { url } = await lessonWithLevels('lv-variant', ['BEGINNER']);
      const block = await createBlock(url, 'a');
      const res = await putLevel(url, block.id, 'BEGINNER', {
        content: rich('variant'),
      }).expect(422);
      expect(res.body).toMatchObject({
        code: 'BUSINESS_RULE_VIOLATION',
        details: { type: 'RICH_TEXT', variants: 'UNCONFIRMED' },
      });
      const got = await http()
        .get(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body.levels).toEqual([]);
    });

    it('requires an explicit content key, and a valid level in the path', async () => {
      const { url } = await lessonWithLevels('lv-validation', ['BEGINNER']);
      const block = await createBlock(url, 'a');

      for (const body of [
        {},
        { version: 1 },
        { content: 'text' },
        { content: [] },
        { content: 5 },
      ]) {
        const res = await putLevel(url, block.id, 'BEGINNER', body).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      await putLevel(url, block.id, 'beginner', { content: null }).expect(400);
      await putLevel(url, block.id, 'EXPERT', { content: null }).expect(400);
      await http()
        .delete(`${url}/${block.id}/levels/expert`)
        .set('Authorization', as('editor'))
        .expect(400);
      const got = await http()
        .get(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(got.body.levels).toEqual([]);
    });

    it('refuses a level the lesson is not available at (422)', async () => {
      const { url } = await lessonWithLevels('lv-unavailable', ['BEGINNER']);
      const block = await createBlock(url, 'a');
      const res = await putLevel(url, block.id, 'ADVANCED', {
        content: null,
      }).expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('does not bump versions or reset the lesson when nothing changes', async () => {
      const { url, lessonId } = await lessonWithLevels('lv-noop', ['BEGINNER']);
      const block = await createBlock(url, 'a');
      const first = (
        await putLevel(url, block.id, 'BEGINNER', { content: null }).expect(200)
      ).body;

      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );
      const again = (
        await putLevel(url, block.id, 'BEGINNER', { content: null }).expect(200)
      ).body;
      await http()
        .delete(`${url}/${block.id}/levels/ADVANCED`)
        .set('Authorization', as('editor'))
        .expect(200);

      expect(again.version).toBe(first.version);
      expect((await getLesson(lessonId)).status).toBe('APPROVED');
    });

    it('an effective change bumps the block version and resets the lesson, but not the lesson version', async () => {
      const { url, lessonId } = await lessonWithLevels('lv-effective', [
        'BEGINNER',
      ]);
      const block = await createBlock(url, 'a');
      const before = await getLesson(lessonId);
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );

      const res = await putLevel(url, block.id, 'BEGINNER', {
        content: null,
      }).expect(200);
      expect(res.body.version).toBe(block.version + 1);
      const after = await getLesson(lessonId);
      expect(after.status).toBe('DRAFT');
      expect(after.version).toBe(before.version);
    });

    it('refuses a stale version with 409', async () => {
      const { url } = await lessonWithLevels('lv-stale', [
        'BEGINNER',
        'INTERMEDIATE',
      ]);
      const block = await createBlock(url, 'a');
      await putLevel(url, block.id, 'BEGINNER', { content: null }).expect(200);
      const res = await putLevel(url, block.id, 'INTERMEDIATE', {
        content: null,
        version: block.version,
      }).expect(409);
      expect(res.body).toMatchObject({
        code: 'CONFLICT',
        details: { currentVersion: block.version + 1 },
      });
    });

    it('refuses to remove a lesson level that blocks are visible at (409), then allows it once they are hidden', async () => {
      const { url, lessonId } = await lessonWithLevels('lv-remove', [
        'BEGINNER',
        'ADVANCED',
      ]);
      const block = await createBlock(url, 'a', { levels: ['ADVANCED'] });

      const refused = await http()
        .put(`${LESSONS}/${lessonId}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['BEGINNER'] })
        .expect(409);
      expect(refused.body).toMatchObject({
        code: 'CONFLICT',
        details: {
          levels: ['ADVANCED'],
          blocks: [{ blockId: block.id, level: 'ADVANCED' }],
        },
      });
      expect((await getLesson(lessonId)).levels).toEqual([
        'BEGINNER',
        'ADVANCED',
      ]);

      await http()
        .delete(`${url}/${block.id}/levels/ADVANCED`)
        .set('Authorization', as('editor'))
        .expect(200);
      await http()
        .put(`${LESSONS}/${lessonId}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['BEGINNER'] })
        .expect(200);
    });

    it('duplicates level settings with the block, and deletes them with it', async () => {
      const { url } = await lessonWithLevels('lv-copy', [
        'BEGINNER',
        'INTERMEDIATE',
      ]);
      const block = await createBlock(url, 'a', {
        levels: ['BEGINNER', 'INTERMEDIATE'],
      });
      const copy = (
        await http()
          .post(`${url}/${block.id}/duplicate`)
          .set('Authorization', as('editor'))
          .expect(201)
      ).body;
      expect(copy.levels).toEqual(block.levels);

      await http()
        .delete(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .expect(204);
      const rows = await dataSource.query(
        `SELECT 1 FROM "lesson_block_levels" WHERE "block_id" = $1`,
        [block.id],
      );
      expect(rows).toHaveLength(0);
      const kept = await http()
        .get(`${url}/${copy.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(kept.body.levels).toHaveLength(2);
    });

    it('lists blocks with their levels', async () => {
      const { url } = await lessonWithLevels('lv-list', [
        'BEGINNER',
        'ADVANCED',
      ]);
      await createBlock(url, 'a', { levels: ['ADVANCED'] });
      await createBlock(url, 'b');
      const res = await http()
        .get(url)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(
        res.body.items.map((b: { levels: unknown[] }) => b.levels.length),
      ).toEqual([1, 0]);
    });

    it('reviewers cannot change levels (403) but can read them', async () => {
      const { url } = await lessonWithLevels('lv-roles', ['BEGINNER']);
      const block = await createBlock(url, 'a', { levels: ['BEGINNER'] });
      await http()
        .put(`${url}/${block.id}/levels/BEGINNER`)
        .set('Authorization', as('reviewer'))
        .send({ content: null })
        .expect(403);
      await http()
        .delete(`${url}/${block.id}/levels/BEGINNER`)
        .set('Authorization', as('reviewer'))
        .expect(403);
      await http()
        .get(`${url}/${block.id}`)
        .set('Authorization', as('reviewer'))
        .expect(200);
    });

    it('cannot reach the levels of a block through another lesson', async () => {
      const one = await lessonWithLevels('lv-cross-1', ['BEGINNER']);
      const two = await lessonWithLevels('lv-cross-2', ['BEGINNER']);
      const block = await createBlock(one.url, 'a');
      await putLevel(two.url, block.id, 'BEGINNER', { content: null }).expect(
        404,
      );
      await http()
        .delete(`${two.url}/${block.id}/levels/BEGINNER`)
        .set('Authorization', as('editor'))
        .expect(404);
    });
  });

  describe('preview with the real registry', () => {
    it('a variant that is stored for a type without variant support is flagged, never shown, and never replaced by shared content', async () => {
      const made = await newLesson('pv-stored-variant');
      await http()
        .put(`${LESSONS}/${made.lessonId}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['BEGINNER'] })
        .expect(200);
      const block = await createBlock(
        made.url,
        'SHARED-CONTENT-MUST-NOT-APPEAR',
        { levels: ['BEGINNER'] },
      );
      // The API cannot create this state; write it directly, as bad data from elsewhere would be.
      await dataSource.query(
        `UPDATE "lesson_block_levels" SET "content" = $1::jsonb WHERE "block_id" = $2`,
        [JSON.stringify(rich('STORED-VARIANT-MUST-NOT-APPEAR')), block.id],
      );

      const res = await http()
        .get(`${LESSONS}/${made.lessonId}/preview?level=BEGINNER`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(res.body.blocks).toEqual([
        {
          blockId: block.id,
          type: 'RICH_TEXT',
          ordinal: 1,
          source: null,
          content: null,
          unresolved: {
            code: 'BLOCK_VARIANT_NOT_ALLOWED',
            message: expect.any(String),
          },
        },
      ]);
      expect(res.body.diagnostics.map((d: { code: string }) => d.code)).toEqual(
        ['BLOCK_VARIANT_NOT_ALLOWED'],
      );
      expect(JSON.stringify(res.body)).not.toContain('MUST-NOT-APPEAR');
    });

    it('shows shared content for visible blocks and nothing for hidden ones', async () => {
      const made = await newLesson('pv-real');
      await http()
        .put(`${LESSONS}/${made.lessonId}/levels`)
        .set('Authorization', as('editor'))
        .send({ levels: ['BEGINNER', 'ADVANCED'] })
        .expect(200);
      await createBlock(made.url, 'visible at beginner', {
        levels: ['BEGINNER'],
      });
      await createBlock(made.url, 'hidden everywhere');

      const beginner = await http()
        .get(`${LESSONS}/${made.lessonId}/preview?level=BEGINNER`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(
        beginner.body.blocks.map((b: { source: string }) => b.source),
      ).toEqual(['SHARED']);

      const advanced = await http()
        .get(`${LESSONS}/${made.lessonId}/preview?level=ADVANCED`)
        .set('Authorization', as('reviewer'))
        .expect(200);
      expect(
        advanced.body.diagnostics.map((d: { code: string }) => d.code),
      ).toEqual(['NO_VISIBLE_BLOCKS']);
    });
  });

  describe('existing endpoints', () => {
    it('keeps health public and unversioned', async () => {
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });
});
