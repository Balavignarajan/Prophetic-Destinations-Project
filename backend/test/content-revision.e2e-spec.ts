import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { configureApp } from './../src/platform/configure-app.js';

// Audits every authoring mutation path through the real API: content_revision must move exactly once
// for each effective change and not at all for no-ops, rejected requests, reordering lessons, or
// anything outside the lesson's own content. lessons.version keeps its existing meaning.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-rev-${runId}-${name}${EMAIL_SUFFIX}`;
const title = (name: string) => `e2e-${runId}-${name}`;

const COURSES = '/api/v1/admin/courses';
const LESSONS = '/api/v1/admin/lessons';

const rich = (text: string) => ({
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

describe('Lesson content revision (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = () => `Bearer ${token}`;

  /** course > module > lesson available at BEGINNER and ADVANCED. */
  const setup = async (name: string) => {
    const course = (
      await http()
        .post(COURSES)
        .set('Authorization', auth())
        .send({ title: title(name) })
        .expect(201)
    ).body;
    const module = (
      await http()
        .post(`${COURSES}/${course.id}/modules`)
        .set('Authorization', auth())
        .send({ title: title(`${name}-module`) })
        .expect(201)
    ).body;
    const lessonsUrl = `${COURSES}/${course.id}/modules/${module.id}/lessons`;
    const lesson = (
      await http()
        .post(lessonsUrl)
        .set('Authorization', auth())
        .send({
          title: title(`${name}-lesson`),
          levels: ['BEGINNER', 'ADVANCED'],
        })
        .expect(201)
    ).body;
    return {
      courseId: course.id as string,
      moduleId: module.id as string,
      lessonId: lesson.id as string,
      lessonsUrl,
      blocksUrl: `${LESSONS}/${lesson.id}/blocks`,
    };
  };

  const getLesson = async (lessonId: string) =>
    (
      await http()
        .get(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .expect(200)
    ).body;

  const revision = async (lessonId: string) =>
    (await getLesson(lessonId)).contentRevision as number;

  /** Runs an action and returns how far content_revision moved. */
  const delta = async (lessonId: string, action: () => Promise<unknown>) => {
    const before = await revision(lessonId);
    await action();
    return (await revision(lessonId)) - before;
  };

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
      `e2e-rev-${runId}-%${EMAIL_SUFFIX}`,
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

    await app.get(AdminProvisioningService).create({
      email: emailFor('admin'),
      password: PASSWORD,
      role: Role.ADMIN,
    });
    const res = await http()
      .post('/api/v1/admin/auth/login')
      .send({ email: emailFor('admin'), password: PASSWORD })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('a new lesson starts at revision 1 and exposes it', async () => {
    const { lessonId } = await setup('start');
    expect(await revision(lessonId)).toBe(1);
  });

  describe('lesson metadata', () => {
    it('moves once for an effective change, however many fields change at once', async () => {
      const { lessonId } = await setup('meta');
      const patch = (body: object) =>
        http()
          .patch(`${LESSONS}/${lessonId}`)
          .set('Authorization', auth())
          .send(body)
          .expect(200);

      expect(
        await delta(lessonId, () => patch({ title: title('renamed') })),
      ).toBe(1);
      expect(
        await delta(lessonId, () =>
          patch({
            subtitle: 'S',
            shortTitle: 'ST',
            introduction: 'I',
            estimatedMinutes: 9,
          }),
        ),
      ).toBe(1);
      expect(await delta(lessonId, () => patch({ subtitle: null }))).toBe(1);
    });

    it('does not move, bump the version or reset the status when nothing changes', async () => {
      const { lessonId } = await setup('meta-noop');
      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ subtitle: 'S' })
        .expect(200);
      const before = await getLesson(lessonId);

      const same = (
        await http()
          .patch(`${LESSONS}/${lessonId}`)
          .set('Authorization', auth())
          .send({ subtitle: 'S', title: before.title })
          .expect(200)
      ).body;
      expect(same).toEqual(before);

      const clearEmpty = await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ shortTitle: null })
        .expect(200);
      expect(clearEmpty.body).toEqual(before);
    });
  });

  describe('level availability', () => {
    it('moves once when the set changes, not when it is set to what it already is', async () => {
      const { lessonId } = await setup('levels');
      const put = (levels: string[]) =>
        http()
          .put(`${LESSONS}/${lessonId}/levels`)
          .set('Authorization', auth())
          .send({ levels })
          .expect(200);

      expect(await delta(lessonId, () => put(['BEGINNER', 'ADVANCED']))).toBe(
        0,
      );
      expect(
        await delta(lessonId, () =>
          put(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
        ),
      ).toBe(1);
      expect(await delta(lessonId, () => put(['ADVANCED']))).toBe(1);
      expect(await delta(lessonId, () => put([]))).toBe(1);
    });
  });

  describe('blocks', () => {
    it('moves exactly once for create, including a block created visible at several levels', async () => {
      const { lessonId, blocksUrl } = await setup('block-create');
      const create = (extra: object = {}) =>
        http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('x'), ...extra })
          .expect(201);

      expect(await delta(lessonId, () => create())).toBe(1);
      expect(
        await delta(lessonId, () =>
          create({ levels: ['BEGINNER', 'ADVANCED'] }),
        ),
      ).toBe(1);
    });

    it('moves once for a content change, and not for identical content', async () => {
      const { lessonId, blocksUrl } = await setup('block-update');
      const block = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;
      const patch = (sharedContent: unknown) =>
        http()
          .patch(`${blocksUrl}/${block.id}`)
          .set('Authorization', auth())
          .send({ sharedContent })
          .expect(200);

      expect(await delta(lessonId, () => patch(rich('a')))).toBe(0);
      expect(await delta(lessonId, () => patch(rich('b')))).toBe(1);
      expect(await delta(lessonId, () => patch(null))).toBe(1);
      expect(await delta(lessonId, () => patch(null))).toBe(0);
    });

    it('moves once for duplicate and once for delete', async () => {
      const { lessonId, blocksUrl } = await setup('block-copy-delete');
      const block = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;

      let copyId = '';
      expect(
        await delta(lessonId, async () => {
          copyId = (
            await http()
              .post(`${blocksUrl}/${block.id}/duplicate`)
              .set('Authorization', auth())
              .expect(201)
          ).body.id;
        }),
      ).toBe(1);
      expect(
        await delta(lessonId, () =>
          http()
            .delete(`${blocksUrl}/${copyId}`)
            .set('Authorization', auth())
            .expect(204),
        ),
      ).toBe(1);
    });

    it('moves for a reorder that changes the order, and not for one that does not', async () => {
      const { lessonId, blocksUrl } = await setup('block-order');
      const a = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;
      const b = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('b') })
          .expect(201)
      ).body;
      const order = (ids: string[]) =>
        http()
          .put(`${blocksUrl}/order`)
          .set('Authorization', auth())
          .send({ blockIds: ids })
          .expect(200);

      expect(await delta(lessonId, () => order([a.id, b.id]))).toBe(0);
      expect(await delta(lessonId, () => order([b.id, a.id]))).toBe(1);
      expect(await delta(lessonId, () => order([b.id, a.id]))).toBe(0);
    });
  });

  describe('visibility', () => {
    it('moves once for each effective visibility change and never for a no-op', async () => {
      const { lessonId, blocksUrl } = await setup('visibility');
      const block = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;
      const show = (level: string) =>
        http()
          .put(`${blocksUrl}/${block.id}/levels/${level}`)
          .set('Authorization', auth())
          .send({ content: null })
          .expect(200);
      const hide = (level: string) =>
        http()
          .delete(`${blocksUrl}/${block.id}/levels/${level}`)
          .set('Authorization', auth())
          .expect(200);

      expect(await delta(lessonId, () => show('BEGINNER'))).toBe(1);
      expect(await delta(lessonId, () => show('BEGINNER'))).toBe(0);
      expect(await delta(lessonId, () => show('ADVANCED'))).toBe(1);
      expect(await delta(lessonId, () => hide('BEGINNER'))).toBe(1);
      expect(await delta(lessonId, () => hide('BEGINNER'))).toBe(0);
      expect(await delta(lessonId, () => hide('INTERMEDIATE'))).toBe(0);
    });
  });

  describe('what must not move it', () => {
    it('rejected requests', async () => {
      const { lessonId, blocksUrl } = await setup('rejected');
      const block = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;

      const before = await revision(lessonId);
      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ title: '   ' })
        .expect(400);
      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({})
        .expect(422);
      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ title: 'x', version: 999 })
        .expect(409);
      await http()
        .put(`${LESSONS}/${lessonId}/levels`)
        .set('Authorization', auth())
        .send({ levels: ['EXPERT'] })
        .expect(400);
      await http()
        .post(blocksUrl)
        .set('Authorization', auth())
        .send({ type: 'QUIZ' })
        .expect(422);
      await http()
        .post(blocksUrl)
        .set('Authorization', auth())
        .send({ type: 'RICH_TEXT', sharedContent: { html: 'x' } })
        .expect(422);
      await http()
        .post(blocksUrl)
        .set('Authorization', auth())
        .send({ type: 'RICH_TEXT', levels: ['INTERMEDIATE'] })
        .expect(422);
      await http()
        .patch(`${blocksUrl}/${block.id}`)
        .set('Authorization', auth())
        .send({ sharedContent: { html: 'x' } })
        .expect(422);
      await http()
        .put(`${blocksUrl}/order`)
        .set('Authorization', auth())
        .send({ blockIds: [] })
        .expect(422);
      await http()
        .put(`${blocksUrl}/${block.id}/levels/INTERMEDIATE`)
        .set('Authorization', auth())
        .send({ content: null })
        .expect(422);
      await http()
        .put(`${blocksUrl}/${block.id}/levels/BEGINNER`)
        .set('Authorization', auth())
        .send({ content: rich('variant') })
        .expect(422);
      await http()
        .get(`${LESSONS}/${randomUUID()}`)
        .set('Authorization', auth())
        .expect(404);
      expect(await revision(lessonId)).toBe(before);
    });

    it('reordering lessons, creating or deleting sibling lessons, and editing the module or course', async () => {
      const { lessonId, courseId, moduleId, lessonsUrl } =
        await setup('outside');
      const before = await revision(lessonId);

      const sibling = (
        await http()
          .post(lessonsUrl)
          .set('Authorization', auth())
          .send({ title: title('outside-sibling'), position: 1 })
          .expect(201)
      ).body;
      await http()
        .put(`${lessonsUrl}/order`)
        .set('Authorization', auth())
        .send({ lessonIds: [lessonId, sibling.id] })
        .expect(200);
      await http()
        .delete(`${LESSONS}/${sibling.id}`)
        .set('Authorization', auth())
        .expect(204);
      await http()
        .patch(`${COURSES}/${courseId}/modules/${moduleId}`)
        .set('Authorization', auth())
        .send({ title: title('outside-module-2') })
        .expect(200);
      await http()
        .patch(`${COURSES}/${courseId}`)
        .set('Authorization', auth())
        .send({ title: title('outside-course-2') })
        .expect(200);

      expect(await revision(lessonId)).toBe(before);
    });

    it('reading, previewing and reading blocks', async () => {
      const { lessonId, blocksUrl } = await setup('reads');
      await http()
        .post(blocksUrl)
        .set('Authorization', auth())
        .send({
          type: 'RICH_TEXT',
          sharedContent: rich('a'),
          levels: ['BEGINNER'],
        })
        .expect(201);
      const before = await revision(lessonId);

      await http().get(blocksUrl).set('Authorization', auth()).expect(200);
      await http()
        .get(`${LESSONS}/${lessonId}/preview?level=BEGINNER`)
        .set('Authorization', auth())
        .expect(200);
      expect(await revision(lessonId)).toBe(before);
    });
  });

  describe('requests that change nothing leave status and both versions alone', () => {
    const NON_DRAFT = ['READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'] as const;

    it.each(NON_DRAFT)(
      'in a %s lesson, through every authoring path',
      async (status) => {
        const { lessonId, blocksUrl } = await setup(
          `noop-${status.toLowerCase()}`,
        );
        const first = (
          await http()
            .post(blocksUrl)
            .set('Authorization', auth())
            .send({
              type: 'RICH_TEXT',
              sharedContent: rich('one'),
              levels: ['BEGINNER'],
            })
            .expect(201)
        ).body;
        const second = (
          await http()
            .post(blocksUrl)
            .set('Authorization', auth())
            .send({ type: 'RICH_TEXT', sharedContent: rich('two') })
            .expect(201)
        ).body;
        await dataSource.query(
          `UPDATE "lessons" SET "status" = $2 WHERE "id" = $1`,
          [lessonId, status],
        );

        const lessonBefore = await getLesson(lessonId);
        const blocksBefore = (
          await http().get(blocksUrl).set('Authorization', auth()).expect(200)
        ).body;

        const lesson = (body: object) =>
          http()
            .patch(`${LESSONS}/${lessonId}`)
            .set('Authorization', auth())
            .send(body)
            .expect(200);
        await lesson({ title: lessonBefore.title });
        await lesson({
          title: `  ${lessonBefore.title}  `,
          subtitle: null,
          shortTitle: null,
        });
        await http()
          .put(`${LESSONS}/${lessonId}/levels`)
          .set('Authorization', auth())
          .send({ levels: ['ADVANCED', 'BEGINNER'] })
          .expect(200);
        await http()
          .patch(`${blocksUrl}/${first.id}`)
          .set('Authorization', auth())
          .send({ sharedContent: rich('one') })
          .expect(200);
        await http()
          .patch(`${blocksUrl}/${first.id}`)
          .set('Authorization', auth())
          .send({
            sharedContent: {
              body: { content: rich('one').body.content, type: 'doc' },
            },
          })
          .expect(200);
        await http()
          .put(`${blocksUrl}/order`)
          .set('Authorization', auth())
          .send({ blockIds: [first.id, second.id] })
          .expect(200);
        await http()
          .put(`${blocksUrl}/${first.id}/levels/BEGINNER`)
          .set('Authorization', auth())
          .send({ content: null })
          .expect(200);
        await http()
          .delete(`${blocksUrl}/${first.id}/levels/ADVANCED`)
          .set('Authorization', auth())
          .expect(200);

        const lessonAfter = await getLesson(lessonId);
        expect(lessonAfter).toEqual(lessonBefore); // status, version, contentRevision, updatedAt: everything
        expect(lessonAfter.status).toBe(status);
        const blocksAfter = (
          await http().get(blocksUrl).set('Authorization', auth()).expect(200)
        ).body;
        expect(blocksAfter).toEqual(blocksBefore); // block versions, positions, updatedAt, levels
      },
    );

    it.each(NON_DRAFT)(
      'while a genuine change to a %s lesson still resets it and bumps both',
      async (status) => {
        const { lessonId, blocksUrl } = await setup(
          `real-${status.toLowerCase()}`,
        );
        const block = (
          await http()
            .post(blocksUrl)
            .set('Authorization', auth())
            .send({ type: 'RICH_TEXT', sharedContent: rich('one') })
            .expect(201)
        ).body;

        const changes: [string, () => Promise<unknown>][] = [
          [
            'metadata',
            () =>
              http()
                .patch(`${LESSONS}/${lessonId}`)
                .set('Authorization', auth())
                .send({ subtitle: `s ${status}` })
                .expect(200),
          ],
          [
            'levels',
            () =>
              http()
                .put(`${LESSONS}/${lessonId}/levels`)
                .set('Authorization', auth())
                .send({ levels: ['BEGINNER'] })
                .expect(200),
          ],
          [
            'block content',
            () =>
              http()
                .patch(`${blocksUrl}/${block.id}`)
                .set('Authorization', auth())
                .send({ sharedContent: rich(`new ${status}`) })
                .expect(200),
          ],
          [
            'visibility',
            () =>
              http()
                .put(`${blocksUrl}/${block.id}/levels/BEGINNER`)
                .set('Authorization', auth())
                .send({ content: null })
                .expect(200),
          ],
        ];
        for (const [name, change] of changes) {
          await dataSource.query(
            `UPDATE "lessons" SET "status" = $2 WHERE "id" = $1`,
            [lessonId, status],
          );
          const before = await getLesson(lessonId);
          await change();
          const after = await getLesson(lessonId);
          expect(after.status, `${name} resets the status`).toBe('DRAFT');
          expect(after.contentRevision, `${name} moves the revision`).toBe(
            before.contentRevision + 1,
          );
        }
      },
    );

    it('a genuine block reorder resets the lesson, but re-sending the order does not', async () => {
      const { lessonId, blocksUrl } = await setup('noop-order');
      const a = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;
      const b = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('b') })
          .expect(201)
      ).body;
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );

      await http()
        .put(`${blocksUrl}/order`)
        .set('Authorization', auth())
        .send({ blockIds: [a.id, b.id] })
        .expect(200);
      expect((await getLesson(lessonId)).status).toBe('APPROVED');

      await http()
        .put(`${blocksUrl}/order`)
        .set('Authorization', auth())
        .send({ blockIds: [b.id, a.id] })
        .expect(200);
      expect((await getLesson(lessonId)).status).toBe('DRAFT');
    });

    it('a stale version is still refused when the request would change nothing', async () => {
      const { lessonId, blocksUrl } = await setup('noop-stale');
      const block = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;
      const lesson = await getLesson(lessonId);

      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ title: lesson.title, version: lesson.version + 1 })
        .expect(409);
      await http()
        .put(`${LESSONS}/${lessonId}/levels`)
        .set('Authorization', auth())
        .send({ levels: lesson.levels, version: lesson.version + 1 })
        .expect(409);
      await http()
        .patch(`${blocksUrl}/${block.id}`)
        .set('Authorization', auth())
        .send({ sharedContent: rich('a'), version: block.version + 1 })
        .expect(409);
      await http()
        .put(`${blocksUrl}/${block.id}/levels/BEGINNER`)
        .set('Authorization', auth())
        .send({ content: null, version: block.version + 1 })
        .expect(409);

      // the current versions are accepted
      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ title: lesson.title, version: lesson.version })
        .expect(200);
      await http()
        .patch(`${blocksUrl}/${block.id}`)
        .set('Authorization', auth())
        .send({ sharedContent: rich('a'), version: block.version })
        .expect(200);
    });
  });

  describe('lessons.version keeps its meaning', () => {
    it('moves for lesson fields and level availability, and not for block changes', async () => {
      const { lessonId, blocksUrl } = await setup('version');
      const start = (await getLesson(lessonId)).version;

      await http()
        .post(blocksUrl)
        .set('Authorization', auth())
        .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
        .expect(201);
      expect((await getLesson(lessonId)).version).toBe(start);

      await http()
        .patch(`${LESSONS}/${lessonId}`)
        .set('Authorization', auth())
        .send({ subtitle: 'S' })
        .expect(200);
      expect((await getLesson(lessonId)).version).toBe(start + 1);
    });
  });

  describe('every effective change resets the lesson to DRAFT', () => {
    it('so a status of APPROVED always means the content has not changed since approval', async () => {
      const { lessonId, blocksUrl } = await setup('reset');
      const block = (
        await http()
          .post(blocksUrl)
          .set('Authorization', auth())
          .send({ type: 'RICH_TEXT', sharedContent: rich('a') })
          .expect(201)
      ).body;

      const approve = () =>
        dataSource.query(
          `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
          [lessonId],
        );
      const mutations: [string, () => Promise<unknown>][] = [
        [
          'metadata',
          () =>
            http()
              .patch(`${LESSONS}/${lessonId}`)
              .set('Authorization', auth())
              .send({ subtitle: 'changed' }),
        ],
        [
          'levels',
          () =>
            http()
              .put(`${LESSONS}/${lessonId}/levels`)
              .set('Authorization', auth())
              .send({ levels: ['BEGINNER'] }),
        ],
        [
          'block content',
          () =>
            http()
              .patch(`${blocksUrl}/${block.id}`)
              .set('Authorization', auth())
              .send({ sharedContent: rich('changed') }),
        ],
        [
          'visibility',
          () =>
            http()
              .put(`${blocksUrl}/${block.id}/levels/BEGINNER`)
              .set('Authorization', auth())
              .send({ content: null }),
        ],
        [
          'hide',
          () =>
            http()
              .delete(`${blocksUrl}/${block.id}/levels/BEGINNER`)
              .set('Authorization', auth()),
        ],
        [
          'new block',
          () =>
            http()
              .post(blocksUrl)
              .set('Authorization', auth())
              .send({ type: 'RICH_TEXT' }),
        ],
        [
          'duplicate',
          () =>
            http()
              .post(`${blocksUrl}/${block.id}/duplicate`)
              .set('Authorization', auth()),
        ],
      ];
      for (const [name, mutate] of mutations) {
        await approve();
        const before = await revision(lessonId);
        await mutate();
        const after = await getLesson(lessonId);
        expect(after.status, `${name} resets the status`).toBe('DRAFT');
        expect(after.contentRevision, `${name} moves the revision`).toBe(
          before + 1,
        );
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
