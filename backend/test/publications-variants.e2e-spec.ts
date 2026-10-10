import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import { BlockTypeRegistry } from './../src/modules/lessons/domain/blocks/registry.js';
import { canonicalJson } from './../src/modules/publishing/domain/snapshot-payload.js';
import { configureApp } from './../src/platform/configure-app.js';
import { deleteWorkflowHistory } from './support/workflow-cleanup.js';
import { VariantEnabledRegistry } from './support/variant-registry.js';

// Per-level snapshots with level variants. The real registry does not allow RICH_TEXT variants
// (their content contract is unconfirmed), so this suite swaps in a registry that does, to prove that
// each published level contains only its own content and never borrows from another level.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-pvr-${runId}-${name}${EMAIL_SUFFIX}`;
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

describe('Publishing with level variants (e2e, variants enabled)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const tokens: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;
  const wf = (id: string) => `${LESSONS}/${id}/workflow`;

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
    return lesson.id as string;
  };

  const addBlock = async (lessonId: string, body: object) =>
    (
      await http()
        .post(`${LESSONS}/${lessonId}/blocks`)
        .set('Authorization', as(Role.EDITOR))
        .send({ type: 'RICH_TEXT', ...body })
        .expect(201)
    ).body.id as string;

  const setVariant = (
    lessonId: string,
    blockId: string,
    level: string,
    content: object | null,
  ) =>
    http()
      .put(`${LESSONS}/${lessonId}/blocks/${blockId}/levels/${level}`)
      .set('Authorization', as(Role.EDITOR))
      .send({ content });

  const approve = async (lessonId: string) => {
    for (const [action, role] of [
      ['submit', Role.EDITOR],
      ['approve', Role.REVIEWER],
    ] as const) {
      await http()
        .post(`${wf(lessonId)}/${action}`)
        .set('Authorization', as(role))
        .send({})
        .expect(200);
    }
  };

  const publish = (lessonId: string) =>
    http()
      .post(`${wf(lessonId)}/publish`)
      .set('Authorization', as(Role.ADMIN))
      .send({});

  const snapshot = async (lessonId: string, level: string) =>
    (
      await http()
        .get(`${LESSONS}/${lessonId}/publications/1/levels/${level}`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(200)
    ).body;

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
      `e2e-pvr-${runId}-%${EMAIL_SUFFIX}`,
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

  it('every level snapshot holds exactly its own variant, or the shared content when it has none', async () => {
    const lessonId = await newLesson('own-variant');
    const blockId = await addBlock(lessonId, {
      sharedContent: rich('SHARED-CONTENT'),
      levels: ALL_LEVELS,
    });
    await setVariant(
      lessonId,
      blockId,
      'BEGINNER',
      rich('BEGINNER-ONLY'),
    ).expect(200);
    await setVariant(
      lessonId,
      blockId,
      'ADVANCED',
      rich('ADVANCED-ONLY'),
    ).expect(200);
    await approve(lessonId);

    await publish(lessonId).expect(200);

    const text = {
      BEGINNER: JSON.stringify(await snapshot(lessonId, 'BEGINNER')),
      INTERMEDIATE: JSON.stringify(await snapshot(lessonId, 'INTERMEDIATE')),
      ADVANCED: JSON.stringify(await snapshot(lessonId, 'ADVANCED')),
    };
    expect(text.BEGINNER).toContain('BEGINNER-ONLY');
    expect(text.BEGINNER).not.toContain('SHARED-CONTENT');
    expect(text.BEGINNER).not.toContain('ADVANCED-ONLY');

    expect(text.INTERMEDIATE).toContain('SHARED-CONTENT'); // no variant: its block's own shared content
    expect(text.INTERMEDIATE).not.toContain('BEGINNER-ONLY');
    expect(text.INTERMEDIATE).not.toContain('ADVANCED-ONLY');

    expect(text.ADVANCED).toContain('ADVANCED-ONLY');
    expect(text.ADVANCED).not.toContain('SHARED-CONTENT');
    expect(text.ADVANCED).not.toContain('BEGINNER-ONLY');

    const sources = Object.fromEntries(
      await Promise.all(
        ALL_LEVELS.map(async (level) => [
          level,
          (await snapshot(lessonId, level)).content.blocks[0].source,
        ]),
      ),
    );
    expect(sources).toEqual({
      BEGINNER: 'VARIANT',
      INTERMEDIATE: 'SHARED',
      ADVANCED: 'VARIANT',
    });
  });

  it('a block hidden at a level is absent from that level, and ordinals are per level', async () => {
    const lessonId = await newLesson('hidden');
    const everywhere = await addBlock(lessonId, {
      sharedContent: rich('EVERYWHERE'),
      levels: ALL_LEVELS,
    });
    const advancedOnly = await addBlock(lessonId, {
      sharedContent: rich('ADVANCED-EXTRA'),
      levels: ['ADVANCED'],
    });
    await approve(lessonId);

    await publish(lessonId).expect(200);

    const beginner = (await snapshot(lessonId, 'BEGINNER')).content;
    const advanced = (await snapshot(lessonId, 'ADVANCED')).content;
    expect(beginner.blocks.map((b: { blockId: string }) => b.blockId)).toEqual([
      everywhere,
    ]);
    expect(advanced.blocks.map((b: { blockId: string }) => b.blockId)).toEqual([
      everywhere,
      advancedOnly,
    ]);
    expect(advanced.blocks.map((b: { ordinal: number }) => b.ordinal)).toEqual([
      1, 2,
    ]);
    expect(JSON.stringify(beginner)).not.toContain('ADVANCED-EXTRA');
  });

  it('refuses a level that would only be resolvable by borrowing another level (422), and publishes nothing', async () => {
    const lessonId = await newLesson('no-borrowing');
    const blockId = await addBlock(lessonId, { levels: ALL_LEVELS }); // no shared content
    await setVariant(lessonId, blockId, 'BEGINNER', rich('B')).expect(200);
    await setVariant(lessonId, blockId, 'ADVANCED', rich('A')).expect(200);
    await approve(lessonId);

    const res = await publish(lessonId).expect(422);

    const issues = res.body.details.report.issues as {
      code: string;
      level?: string;
    }[];
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'BLOCK_NO_CONTENT',
        level: 'INTERMEDIATE',
      }),
    ]);
    const list = (
      await http()
        .get(`${LESSONS}/${lessonId}/publications`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200)
    ).body;
    expect(list.total).toBe(0);
  });

  it('hashes each level separately and the hash matches its stored content', async () => {
    const lessonId = await newLesson('hashes');
    const blockId = await addBlock(lessonId, {
      sharedContent: rich('SAME'),
      levels: ALL_LEVELS,
    });
    await setVariant(lessonId, blockId, 'ADVANCED', rich('DIFFERENT')).expect(
      200,
    );
    await approve(lessonId);
    await publish(lessonId).expect(200);

    const hashes = new Set<string>();
    for (const level of ALL_LEVELS) {
      const stored = await snapshot(lessonId, level);
      const canonical = canonicalJson(stored.content);
      expect(stored.contentHash).toBe(
        createHash('sha256').update(canonical, 'utf8').digest('hex'),
      );
      expect(stored.contentBytes).toBe(Buffer.byteLength(canonical, 'utf8'));
      hashes.add(stored.contentHash);
    }
    expect(hashes.size).toBe(3); // the level is part of each payload, so no two levels share a hash
  });

  it('a later variant edit changes the draft only: published levels keep their content', async () => {
    const lessonId = await newLesson('variant-edit');
    const blockId = await addBlock(lessonId, {
      sharedContent: rich('SHARED'),
      levels: ALL_LEVELS,
    });
    await approve(lessonId);
    await publish(lessonId).expect(200);
    const before = await snapshot(lessonId, 'INTERMEDIATE');

    await setVariant(
      lessonId,
      blockId,
      'INTERMEDIATE',
      rich('NEW-VARIANT'),
    ).expect(200);

    expect(await snapshot(lessonId, 'INTERMEDIATE')).toEqual(before);
    expect(JSON.stringify(before)).not.toContain('NEW-VARIANT');
  });
});
