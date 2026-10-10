import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { BlockTypeRegistry } from './../src/modules/lessons/domain/blocks/registry.js';
import { configureApp } from './../src/platform/configure-app.js';
import { VariantEnabledRegistry } from './support/variant-registry.js';

// Level visibility, variants and preview, end to end. The real registry does not allow RICH_TEXT
// variants (their content contract is unconfirmed), so this suite swaps in a registry that does, to
// exercise the generic machinery. The real-registry behaviour is covered in blocks.e2e-spec.ts.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-lvl-${runId}-${name}${EMAIL_SUFFIX}`;
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

describe('Block levels, variants and preview (e2e, variants enabled)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens = {} as Record<'admin' | 'editor' | 'reviewer', string>;

  const http = () => request(app.getHttpServer());
  const as = (role: keyof typeof tokens) => `Bearer ${tokens[role]}`;

  /** course > module > lesson, available at the given levels. */
  const newLesson = async (name: string, levels: string[] = ALL_LEVELS) => {
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
        .send({ title: title(`${name}-lesson`), levels })
        .expect(201)
    ).body;
    return {
      lessonId: lesson.id as string,
      url: `${LESSONS}/${lesson.id}/blocks`,
    };
  };

  const createBlock = async (
    url: string,
    shared: string | null,
    extra: object = {},
  ) =>
    (
      await http()
        .post(url)
        .set('Authorization', as('editor'))
        .send({
          type: 'RICH_TEXT',
          ...(shared === null ? {} : { sharedContent: rich(shared) }),
          ...extra,
        })
        .expect(201)
    ).body;

  const put = (url: string, blockId: string, level: string, body: object) =>
    http()
      .put(`${url}/${blockId}/levels/${level}`)
      .set('Authorization', as('editor'))
      .send(body);

  const hide = (url: string, blockId: string, level: string, query = '') =>
    http()
      .delete(`${url}/${blockId}/levels/${level}${query}`)
      .set('Authorization', as('editor'));

  const preview = (
    lessonId: string,
    level: string,
    role: keyof typeof tokens = 'reviewer',
  ) =>
    http()
      .get(`${LESSONS}/${lessonId}/preview?level=${level}`)
      .set('Authorization', as(role));

  const getBlock = async (url: string, blockId: string) =>
    (
      await http()
        .get(`${url}/${blockId}`)
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
      `e2e-lvl-${runId}-%${EMAIL_SUFFIX}`,
    ]);
  };

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BlockTypeRegistry)
      .useValue(new VariantEnabledRegistry())
      .compile();
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

  describe('variants (full replacement)', () => {
    it('stores a variant for one level only, and returns levels in canonical order', async () => {
      const { url } = await newLesson('var-store');
      const block = await createBlock(url, 'shared');

      await put(url, block.id, 'ADVANCED', {
        content: rich('advanced'),
      }).expect(200);
      const res = await put(url, block.id, 'BEGINNER', {
        content: null,
      }).expect(200);
      expect(res.body.levels).toEqual([
        { level: 'BEGINNER', content: null },
        { level: 'ADVANCED', content: rich('advanced') },
      ]);
      expect(res.body.sharedContent).toEqual(rich('shared')); // untouched
    });

    it('replaces the variant completely and can go back to the shared content', async () => {
      const { url } = await newLesson('var-replace');
      const block = await createBlock(url, 'shared');
      await put(url, block.id, 'BEGINNER', { content: rich('first') }).expect(
        200,
      );
      await put(url, block.id, 'BEGINNER', { content: rich('second') }).expect(
        200,
      );
      expect((await getBlock(url, block.id)).levels).toEqual([
        { level: 'BEGINNER', content: rich('second') },
      ]);

      await put(url, block.id, 'BEGINNER', { content: null }).expect(200);
      expect((await getBlock(url, block.id)).levels).toEqual([
        { level: 'BEGINNER', content: null },
      ]);
    });

    it('validates a variant exactly like shared content (422, nothing stored)', async () => {
      const { url } = await newLesson('var-invalid');
      const block = await createBlock(url, 'shared');
      const bad: unknown[] = [
        { html: '<p>x</p>' },
        { body: { type: 'doc', content: [{ type: 'script' }] } },
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
                      { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ];
      for (const content of bad) {
        const res = await put(url, block.id, 'BEGINNER', { content }).expect(
          422,
        );
        expect(res.body.details.problems.length).toBeGreaterThan(0);
      }
      expect((await getBlock(url, block.id)).levels).toEqual([]);
    });

    it('editing the shared content leaves every variant alone', async () => {
      const { url } = await newLesson('var-shared-edit');
      const block = await createBlock(url, 'shared');
      await put(url, block.id, 'BEGINNER', { content: rich('variant') }).expect(
        200,
      );
      await http()
        .patch(`${url}/${block.id}`)
        .set('Authorization', as('editor'))
        .send({ sharedContent: rich('new shared') })
        .expect(200);
      expect((await getBlock(url, block.id)).levels).toEqual([
        { level: 'BEGINNER', content: rich('variant') },
      ]);
    });

    it('duplicating a block copies its variants as independent rows', async () => {
      const { url } = await newLesson('var-duplicate');
      const block = await createBlock(url, 'shared');
      await put(url, block.id, 'BEGINNER', {
        content: rich('beginner variant'),
      }).expect(200);

      const copy = (
        await http()
          .post(`${url}/${block.id}/duplicate`)
          .set('Authorization', as('editor'))
          .expect(201)
      ).body;
      expect(copy.levels).toEqual([
        { level: 'BEGINNER', content: rich('beginner variant') },
      ]);

      await put(url, copy.id, 'BEGINNER', {
        content: rich('changed copy'),
      }).expect(200);
      expect((await getBlock(url, block.id)).levels[0].content).toEqual(
        rich('beginner variant'),
      );
    });

    it('rejects an oversized variant with 413', async () => {
      const { url } = await newLesson('var-huge');
      const block = await createBlock(url, 'shared');
      const res = await put(url, block.id, 'BEGINNER', {
        content: rich('x'.repeat(150_000)),
      });
      expect(res.status).toBe(413);
    });
  });

  describe('content revision for variant changes', () => {
    it('moves once per effective variant change, never for a no-op or a refused hide', async () => {
      const { lessonId, url } = await newLesson('rev-variant');
      const block = await createBlock(url, 'shared');
      const revisionOf = async () =>
        (
          await http()
            .get(`${LESSONS}/${lessonId}`)
            .set('Authorization', as('reviewer'))
            .expect(200)
        ).body.contentRevision as number;

      const start = await revisionOf();
      await put(url, block.id, 'BEGINNER', { content: rich('v1') }).expect(200);
      expect(await revisionOf()).toBe(start + 1);

      await put(url, block.id, 'BEGINNER', { content: rich('v1') }).expect(200); // identical
      expect(await revisionOf()).toBe(start + 1);

      await put(url, block.id, 'BEGINNER', { content: rich('v2') }).expect(200); // replaced
      expect(await revisionOf()).toBe(start + 2);

      await hide(url, block.id, 'BEGINNER').expect(409); // refused: would discard the variant
      expect(await revisionOf()).toBe(start + 2);

      await hide(url, block.id, 'BEGINNER', '?discardVariant=true').expect(200);
      expect(await revisionOf()).toBe(start + 3);
    });
  });

  describe('hiding a block that has a variant', () => {
    it('needs an explicit discardVariant=true; anything else keeps the variant', async () => {
      const { url } = await newLesson('hide-variant');
      const block = await createBlock(url, 'shared');
      await put(url, block.id, 'BEGINNER', {
        content: rich('precious'),
      }).expect(200);

      const refused = await hide(url, block.id, 'BEGINNER').expect(409);
      expect(refused.body).toMatchObject({
        code: 'CONFLICT',
        details: { level: 'BEGINNER', hasVariant: true },
      });
      await hide(url, block.id, 'BEGINNER', '?discardVariant=false').expect(
        409,
      );
      const invalid = await hide(
        url,
        block.id,
        'BEGINNER',
        '?discardVariant=maybe',
      ).expect(400);
      expect(invalid.body.code).toBe('VALIDATION_FAILED');
      expect((await getBlock(url, block.id)).levels).toEqual([
        { level: 'BEGINNER', content: rich('precious') },
      ]);

      const done = await hide(
        url,
        block.id,
        'BEGINNER',
        '?discardVariant=true',
      ).expect(200);
      expect(done.body.levels).toEqual([]);
    });

    it('hiding where there is no variant needs no flag', async () => {
      const { url } = await newLesson('hide-plain');
      const block = await createBlock(url, 'shared', {
        levels: ['INTERMEDIATE'],
      });
      await hide(url, block.id, 'INTERMEDIATE').expect(200);
      expect((await getBlock(url, block.id)).levels).toEqual([]);
    });

    it('honours a stale version on delete', async () => {
      const { url } = await newLesson('hide-stale');
      const block = await createBlock(url, 'shared', { levels: ['BEGINNER'] });
      await put(url, block.id, 'INTERMEDIATE', { content: null }).expect(200);
      await hide(url, block.id, 'BEGINNER', `?version=${block.version}`).expect(
        409,
      );
      await hide(
        url,
        block.id,
        'BEGINNER',
        `?version=${block.version + 1}`,
      ).expect(200);
    });
  });

  describe('preview', () => {
    it('is advisory read access for all three roles, and requires authentication', async () => {
      const { lessonId } = await newLesson('prev-roles');
      for (const role of ['admin', 'editor', 'reviewer'] as const) {
        await preview(lessonId, 'BEGINNER', role).expect(200);
      }
      const anon = await http()
        .get(`${LESSONS}/${lessonId}/preview?level=BEGINNER`)
        .expect(401);
      expect(anon.body.code).toBe('UNAUTHORIZED');
    });

    it('requires a valid upper-case level, and an existing lesson', async () => {
      const { lessonId } = await newLesson('prev-input');
      for (const query of [
        '',
        '?level=',
        '?level=beginner',
        '?level=EXPERT',
        '?level=BEGINNER&level=ADVANCED',
      ]) {
        const res = await http()
          .get(`${LESSONS}/${lessonId}/preview${query}`)
          .set('Authorization', as('reviewer'))
          .expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      await http()
        .get(`${LESSONS}/not-a-uuid/preview?level=BEGINNER`)
        .set('Authorization', as('reviewer'))
        .expect(400);
      const missing = await preview(randomUUID(), 'BEGINNER').expect(404);
      expect(missing.body).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Lesson not found',
      });
    });

    it('returns the lesson summary and each visible block resolved for the level, in order', async () => {
      const { lessonId, url } = await newLesson('prev-shape');
      const one = await createBlock(url, 'one shared', {
        levels: ['BEGINNER', 'ADVANCED'],
      });
      await createBlock(url, 'hidden at beginner', { levels: ['ADVANCED'] });
      const three = await createBlock(url, 'three shared', {
        levels: ['BEGINNER'],
      });
      await put(url, one.id, 'BEGINNER', {
        content: rich('one beginner'),
      }).expect(200);

      const res = await preview(lessonId, 'BEGINNER').expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        level: 'BEGINNER',
        available: true,
        lesson: expect.objectContaining({
          id: lessonId,
          title: title('prev-shape-lesson'),
          availableLevels: ALL_LEVELS,
          status: 'DRAFT',
        }),
        blocks: [
          {
            blockId: one.id,
            type: 'RICH_TEXT',
            ordinal: 1,
            source: 'VARIANT',
            content: rich('one beginner'),
          },
          {
            blockId: three.id,
            type: 'RICH_TEXT',
            ordinal: 2,
            source: 'SHARED',
            content: rich('three shared'),
          },
        ],
        diagnostics: [],
      });
    });

    it('follows block order after a reorder', async () => {
      const { lessonId, url } = await newLesson('prev-order');
      const a = await createBlock(url, 'a', { levels: ['BEGINNER'] });
      const b = await createBlock(url, 'b', { levels: ['BEGINNER'] });
      await http()
        .put(`${url}/order`)
        .set('Authorization', as('editor'))
        .send({ blockIds: [b.id, a.id] })
        .expect(200);
      const res = await preview(lessonId, 'BEGINNER').expect(200);
      expect(
        res.body.blocks.map((x: { blockId: string; ordinal: number }) => [
          x.blockId,
          x.ordinal,
        ]),
      ).toEqual([
        [b.id, 1],
        [a.id, 2],
      ]);
    });

    it('a level the lesson is not available at is 200 with available: false and a diagnostic', async () => {
      const { lessonId, url } = await newLesson('prev-unavailable', [
        'BEGINNER',
      ]);
      await createBlock(url, 'x', { levels: ['BEGINNER'] });
      const res = await preview(lessonId, 'ADVANCED').expect(200);
      expect(res.body).toMatchObject({
        level: 'ADVANCED',
        available: false,
        blocks: [],
        diagnostics: [{ code: 'LESSON_NOT_AVAILABLE_AT_LEVEL' }],
      });
    });

    it('NO_VISIBLE_BLOCKS only when nothing is visible; hidden blocks produce no diagnostic', async () => {
      const { lessonId, url } = await newLesson('prev-none');
      await createBlock(url, 'hidden everywhere'); // no level rows
      await createBlock(url, null, { levels: ['ADVANCED'] }); // contentless, but hidden at BEGINNER

      const none = await preview(lessonId, 'BEGINNER').expect(200);
      expect(none.body.blocks).toEqual([]);
      expect(none.body.diagnostics).toEqual([
        { code: 'NO_VISIBLE_BLOCKS', message: expect.any(String) },
      ]);

      const empty = await newLesson('prev-empty');
      const emptyRes = await preview(empty.lessonId, 'INTERMEDIATE').expect(
        200,
      );
      expect(
        emptyRes.body.diagnostics.map((d: { code: string }) => d.code),
      ).toEqual(['NO_VISIBLE_BLOCKS']);
    });

    it('a visible block without content is returned as an unresolved entry, never skipped, and NO_VISIBLE_BLOCKS is not added', async () => {
      const { lessonId, url } = await newLesson('prev-unresolved');
      const empty = await createBlock(url, null, { levels: ['INTERMEDIATE'] });
      const ok = await createBlock(url, 'fine', { levels: ['INTERMEDIATE'] });

      const res = await preview(lessonId, 'INTERMEDIATE').expect(200);
      expect(res.body.blocks).toEqual([
        {
          blockId: empty.id,
          type: 'RICH_TEXT',
          ordinal: 1,
          source: null,
          content: null,
          unresolved: { code: 'BLOCK_NO_CONTENT', message: expect.any(String) },
        },
        {
          blockId: ok.id,
          type: 'RICH_TEXT',
          ordinal: 2,
          source: 'SHARED',
          content: rich('fine'),
        },
      ]);
      expect(res.body.diagnostics).toEqual([
        {
          code: 'BLOCK_NO_CONTENT',
          blockId: empty.id,
          message: expect.any(String),
        },
      ]);
    });

    it('changes nothing: status, lesson version and block versions stay as they were', async () => {
      const { lessonId, url } = await newLesson('prev-readonly');
      const block = await createBlock(url, 'a', { levels: ['BEGINNER'] });
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );
      const lessonBefore = (
        await http()
          .get(`${LESSONS}/${lessonId}`)
          .set('Authorization', as('reviewer'))
          .expect(200)
      ).body;
      const blockBefore = await getBlock(url, block.id);

      for (const level of ALL_LEVELS)
        await preview(lessonId, level).expect(200);

      const lessonAfter = (
        await http()
          .get(`${LESSONS}/${lessonId}`)
          .set('Authorization', as('reviewer'))
          .expect(200)
      ).body;
      expect(lessonAfter).toEqual(lessonBefore);
      expect(lessonAfter.status).toBe('APPROVED');
      expect(await getBlock(url, block.id)).toEqual(blockBefore);
    });
  });

  describe('no content ever crosses levels (real API)', () => {
    const SENTINEL_B = 'SENTINEL-BEGINNER-1f3a';
    const SENTINEL_I = 'SENTINEL-INTERMEDIATE-7c9d';
    const SENTINEL_A = 'SENTINEL-ADVANCED-5b2e';
    const ALL_SENTINELS = [SENTINEL_B, SENTINEL_I, SENTINEL_A];

    const bodyText = (res: { body: unknown }) => JSON.stringify(res.body);
    const others = (own: string) => ALL_SENTINELS.filter((s) => s !== own);

    it('INTERMEDIATE with no variant and no shared content is unresolved: it gets neither the BEGINNER nor the ADVANCED variant', async () => {
      const { lessonId, url } = await newLesson('leak-unresolved');
      const block = await createBlock(url, null); // no shared content at all
      await put(url, block.id, 'BEGINNER', {
        content: rich(SENTINEL_B),
      }).expect(200);
      await put(url, block.id, 'INTERMEDIATE', { content: null }).expect(200);
      await put(url, block.id, 'ADVANCED', {
        content: rich(SENTINEL_A),
      }).expect(200);

      const intermediate = await preview(lessonId, 'INTERMEDIATE').expect(200);
      expect(intermediate.body.blocks).toHaveLength(1);
      expect(intermediate.body.blocks[0]).toMatchObject({
        source: null,
        content: null,
        unresolved: { code: 'BLOCK_NO_CONTENT' },
      });
      for (const sentinel of ALL_SENTINELS)
        expect(bodyText(intermediate)).not.toContain(sentinel);

      // and each of the others sees only its own
      const beginner = await preview(lessonId, 'BEGINNER').expect(200);
      expect(bodyText(beginner)).toContain(SENTINEL_B);
      for (const sentinel of others(SENTINEL_B))
        expect(bodyText(beginner)).not.toContain(sentinel);

      const advanced = await preview(lessonId, 'ADVANCED').expect(200);
      expect(bodyText(advanced)).toContain(SENTINEL_A);
      for (const sentinel of others(SENTINEL_A))
        expect(bodyText(advanced)).not.toContain(sentinel);
    });

    it("a level without a variant gets the block's own shared content, never another level's variant", async () => {
      const { lessonId, url } = await newLesson('leak-shared');
      const block = await createBlock(url, 'NEUTRAL-SHARED-CONTENT');
      await put(url, block.id, 'BEGINNER', {
        content: rich(SENTINEL_B),
      }).expect(200);
      await put(url, block.id, 'INTERMEDIATE', { content: null }).expect(200);
      await put(url, block.id, 'ADVANCED', {
        content: rich(SENTINEL_A),
      }).expect(200);

      const intermediate = await preview(lessonId, 'INTERMEDIATE').expect(200);
      expect(intermediate.body.blocks[0]).toMatchObject({
        source: 'SHARED',
        content: rich('NEUTRAL-SHARED-CONTENT'),
      });
      for (const sentinel of ALL_SENTINELS)
        expect(bodyText(intermediate)).not.toContain(sentinel);
    });

    it('a level that is hidden for the block shows nothing of it, whatever the other levels hold', async () => {
      const { lessonId, url } = await newLesson('leak-hidden');
      const block = await createBlock(url, 'NEUTRAL');
      await put(url, block.id, 'BEGINNER', {
        content: rich(SENTINEL_B),
      }).expect(200);
      await put(url, block.id, 'ADVANCED', {
        content: rich(SENTINEL_A),
      }).expect(200);

      const intermediate = await preview(lessonId, 'INTERMEDIATE').expect(200);
      expect(intermediate.body.blocks).toEqual([]);
      expect(
        intermediate.body.diagnostics.map((d: { code: string }) => d.code),
      ).toEqual(['NO_VISIBLE_BLOCKS']);
      for (const sentinel of ALL_SENTINELS)
        expect(bodyText(intermediate)).not.toContain(sentinel);
    });

    it('a level the lesson is not available at never borrows from the others', async () => {
      const { lessonId, url } = await newLesson('leak-unavailable', [
        'BEGINNER',
        'ADVANCED',
      ]);
      const block = await createBlock(url, 'NEUTRAL');
      await put(url, block.id, 'BEGINNER', {
        content: rich(SENTINEL_B),
      }).expect(200);
      await put(url, block.id, 'ADVANCED', {
        content: rich(SENTINEL_A),
      }).expect(200);

      const res = await preview(lessonId, 'INTERMEDIATE').expect(200);
      expect(res.body).toMatchObject({ available: false, blocks: [] });
      for (const sentinel of ALL_SENTINELS)
        expect(bodyText(res)).not.toContain(sentinel);
    });

    it('every level of a fully varied block returns exactly its own variant', async () => {
      const { lessonId, url } = await newLesson('leak-all');
      const block = await createBlock(url, null);
      await put(url, block.id, 'BEGINNER', {
        content: rich(SENTINEL_B),
      }).expect(200);
      await put(url, block.id, 'INTERMEDIATE', {
        content: rich(SENTINEL_I),
      }).expect(200);
      await put(url, block.id, 'ADVANCED', {
        content: rich(SENTINEL_A),
      }).expect(200);

      const expected: Record<string, string> = {
        BEGINNER: SENTINEL_B,
        INTERMEDIATE: SENTINEL_I,
        ADVANCED: SENTINEL_A,
      };
      for (const level of ALL_LEVELS) {
        const res = await preview(lessonId, level).expect(200);
        expect(res.body.blocks[0]).toMatchObject({
          source: 'VARIANT',
          content: rich(expected[level]),
        });
        for (const sentinel of others(expected[level]))
          expect(bodyText(res)).not.toContain(sentinel);
      }
    });
  });

  describe('concurrency', () => {
    it('parallel writes to different levels of one block all succeed and all persist', async () => {
      const { url } = await newLesson('conc-levels');
      const block = await createBlock(url, 'shared');
      const results = await Promise.all(
        ALL_LEVELS.map((level) =>
          put(url, block.id, level, { content: rich(`variant ${level}`) }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      const after = await getBlock(url, block.id);
      expect(after.levels).toEqual(
        ALL_LEVELS.map((level) => ({
          level,
          content: rich(`variant ${level}`),
        })),
      );
      expect(after.version).toBe(block.version + 3);
    });

    it('parallel writes to the same level never fail with a server error, and one of them wins', async () => {
      const { url } = await newLesson('conc-same');
      const block = await createBlock(url, 'shared');
      const results = await Promise.all(
        ['one', 'two', 'three', 'four'].map((text) =>
          put(url, block.id, 'BEGINNER', { content: rich(text) }),
        ),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      const [level] = (await getBlock(url, block.id)).levels;
      expect(['one', 'two', 'three', 'four'].map(rich)).toContainEqual(
        level.content,
      );
    });

    it('a lesson level cannot be removed while a write that makes a block visible there is in flight', async () => {
      const { lessonId, url } = await newLesson('conc-remove', [
        'BEGINNER',
        'ADVANCED',
      ]);
      const block = await createBlock(url, 'shared');
      const [shown, removed] = await Promise.all([
        put(url, block.id, 'ADVANCED', { content: null }),
        http()
          .put(`${LESSONS}/${lessonId}/levels`)
          .set('Authorization', as('editor'))
          .send({ levels: ['BEGINNER'] }),
      ]);
      expect(
        [shown.status, removed.status].every((status) => status < 500),
      ).toBe(true);
      // Whatever the order, the invariant holds: the block is never visible at a level the lesson lacks.
      const lesson = (
        await http()
          .get(`${LESSONS}/${lessonId}`)
          .set('Authorization', as('reviewer'))
          .expect(200)
      ).body;
      const levels = (await getBlock(url, block.id)).levels.map(
        (l: { level: string }) => l.level,
      );
      for (const level of levels) expect(lesson.levels).toContain(level);
    });
  });

  describe('authorization', () => {
    it('reviewers can preview and read but not write levels; anonymous is 401', async () => {
      const { url } = await newLesson('auth');
      const block = await createBlock(url, 'a', { levels: ['BEGINNER'] });
      await put(url, block.id, 'ADVANCED', { content: null }).expect(200);

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
        .put(`${url}/${block.id}/levels/BEGINNER`)
        .send({ content: null })
        .expect(401);
      await http().delete(`${url}/${block.id}/levels/BEGINNER`).expect(401);
      for (const role of ['admin', 'editor'] as const) {
        await http()
          .put(`${url}/${block.id}/levels/INTERMEDIATE`)
          .set('Authorization', as(role))
          .send({ content: null })
          .expect(200);
      }
    });
  });

  describe('existing endpoints', () => {
    it('keeps health public and unversioned', async () => {
      await http().get('/health').expect(200);
      await http().get('/health/db').expect(200);
    });
  });
});
