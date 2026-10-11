import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { deleteWorkflowHistory } from '../../../../test/support/workflow-cleanup.js';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import { WorkflowService } from '../application/workflow.service.js';
import { PublishingFacade } from '../application/publishing.facade.js';
import { PublishingModule } from '../publishing.module.js';

// Integration: the facade Delivery uses, against the development database (DATABASE_URL). It must only
// ever return the ACTIVE publication's stored snapshot of the requested level. Everything created here
// carries a per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;
const emailOf = (name: string) => `facade-${runId}-${name}@int-test.invalid`;
const ALL_LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

describe('PublishingFacade (integration)', () => {
  let dataSource: DataSource;
  let workflow: WorkflowService;
  let facade: PublishingFacade;
  let closeModule: () => Promise<void>;
  const admins: Record<string, AuthenticatedAdmin> = {};

  const lessonsOfRun = `SELECT l."id" FROM "lessons" l
      JOIN "course_modules" m ON m."id" = l."module_id"
      JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;

  const cleanup = async () => {
    const like = `int-${runId}-%`;
    await deleteWorkflowHistory(dataSource, lessonsOfRun, [like]);
    for (const table of [
      'lesson_block_levels',
      'lesson_blocks',
      'lesson_levels',
    ]) {
      await dataSource.query(
        `DELETE FROM "${table}" WHERE "lesson_id" IN (${lessonsOfRun})`,
        [like],
      );
    }
    await dataSource.query(
      `DELETE FROM "lessons" WHERE "id" IN (${lessonsOfRun})`,
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
      `facade-${runId}-%@int-test.invalid`,
    ]);
  };

  const newAdmin = async (name: string, role: Role) => {
    const [row] = await dataSource.query(
      `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'not-a-real-hash',$2) RETURNING "id"`,
      [emailOf(name), role],
    );
    admins[name] = { id: row.id, email: emailOf(name), role };
  };

  const richText = (text: string) => ({
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  });

  /** An APPROVED, publishable lesson with one text block visible at the given levels. */
  const newLesson = async (name: string, levels: string[] = ALL_LEVELS) => {
    const [course] = await dataSource.query(
      `INSERT INTO "courses" ("title") VALUES ($1) RETURNING "id"`,
      [title(name)],
    );
    const [module] = await dataSource.query(
      `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,1) RETURNING "id"`,
      [course.id, title(`${name}-module`)],
    );
    const [lesson] = await dataSource.query(
      `INSERT INTO "lessons" ("module_id","title","position","status") VALUES ($1,$2,1,'APPROVED') RETURNING "id"`,
      [module.id, title(`${name}-lesson`)],
    );
    for (const level of levels) {
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,$2)`,
        [lesson.id, level],
      );
    }
    const [block] = await dataSource.query(
      `INSERT INTO "lesson_blocks" ("lesson_id","type","position","shared_content") VALUES ($1,'RICH_TEXT',1,$2::jsonb) RETURNING "id"`,
      [lesson.id, JSON.stringify(richText(`text of ${name}`))],
    );
    for (const level of levels) {
      await dataSource.query(
        `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,$3)`,
        [block.id, lesson.id, level],
      );
    }
    return lesson.id as string;
  };

  /** What an authoring edit does (the lessons module's job): back to DRAFT, content revision + 1. */
  const simulateEdit = (lessonId: string) =>
    dataSource.query(
      `UPDATE "lessons" SET "status"='DRAFT', "content_revision"="content_revision"+1, "updated_at"=now() WHERE "id"=$1`,
      [lessonId],
    );

  const publish = (lessonId: string) =>
    workflow.perform('PUBLISH', lessonId, admins.admin);
  const unpublish = (lessonId: string) =>
    workflow.perform('UNPUBLISH', lessonId, admins.admin);
  const republishAfterEdit = async (lessonId: string) => {
    await simulateEdit(lessonId);
    await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
    await workflow.perform('APPROVE', lessonId, admins.reviewer);
    return publish(lessonId);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, PublishingModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    workflow = moduleRef.get(WorkflowService, { strict: false });
    facade = moduleRef.get(PublishingFacade, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
    await newAdmin('admin', Role.ADMIN);
    await newAdmin('editor', Role.EDITOR);
    await newAdmin('reviewer', Role.REVIEWER);
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  it('returns the active publication, version and hash of the requested level, then its stored content', async () => {
    const lessonId = await newLesson('active');
    const published = await publish(lessonId);

    for (const level of ALL_LEVELS) {
      const info = await facade.findActiveSnapshotInfo(lessonId, level);
      expect(info).toEqual({
        lessonId,
        level,
        publicationId: published.publication!.id,
        publicationVersion: 1,
        contentHash: published.publication!.levels.find(
          (l) => l.level === level,
        )!.contentHash,
      });
      const content = await facade.readActiveSnapshotContent(
        info!.publicationId,
        level,
      );
      expect(content).toMatchObject({
        schemaVersion: 1,
        level,
        lesson: { id: lessonId },
        blocks: [{ type: 'RICH_TEXT', content: richText('text of active') }],
      });
    }
  });

  it('returns the stored snapshot exactly: same content as the admin read, same hash', async () => {
    const lessonId = await newLesson('exact');
    await publish(lessonId);
    const [stored] = await dataSource.query(
      `SELECT l."content", l."content_hash" FROM "lesson_publication_levels" l WHERE l."lesson_id" = $1 AND l."level" = 'BEGINNER'`,
      [lessonId],
    );
    const info = await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER');
    expect(info!.contentHash).toBe(stored.content_hash.trim());
    expect(
      await facade.readActiveSnapshotContent(info!.publicationId, 'BEGINNER'),
    ).toEqual(stored.content);
  });

  it('knows nothing about a lesson that was never published', async () => {
    const lessonId = await newLesson('draft-only');
    for (const level of ALL_LEVELS) {
      expect(await facade.findActiveSnapshotInfo(lessonId, level)).toBeNull();
    }
    expect(
      await facade.findActiveSnapshotInfo(randomUUID(), 'BEGINNER'),
    ).toBeNull();
  });

  it('has no snapshot for a level the lesson was not published at, and never falls back to another level', async () => {
    const lessonId = await newLesson('one-level', ['INTERMEDIATE']);
    await publish(lessonId);
    expect(
      await facade.findActiveSnapshotInfo(lessonId, 'INTERMEDIATE'),
    ).not.toBeNull();
    expect(
      await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
    ).toBeNull();
    expect(
      await facade.findActiveSnapshotInfo(lessonId, 'ADVANCED'),
    ).toBeNull();
  });

  it('the content of one publication/level is never returned for another level or another publication id', async () => {
    const lessonId = await newLesson('isolation', ['BEGINNER']);
    await publish(lessonId);
    const info = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    expect(
      await facade.readActiveSnapshotContent(info.publicationId, 'ADVANCED'),
    ).toBeNull();
    expect(
      await facade.readActiveSnapshotContent(randomUUID(), 'BEGINNER'),
    ).toBeNull();
  });

  it('keeps serving the older publication after an authoring edit, and ignores the working copy completely', async () => {
    const lessonId = await newLesson('edited');
    await publish(lessonId);
    const before = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    const contentBefore = await facade.readActiveSnapshotContent(
      before.publicationId,
      'BEGINNER',
    );

    await simulateEdit(lessonId);
    await dataSource.query(
      `UPDATE "lessons" SET "title" = $2 WHERE "id" = $1`,
      [lessonId, title('edited-renamed')],
    );
    await dataSource.query(
      `UPDATE "lesson_blocks" SET "shared_content" = $2::jsonb WHERE "lesson_id" = $1`,
      [lessonId, JSON.stringify(richText('NEW DRAFT TEXT'))],
    );

    const after = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    expect(after).toEqual(before);
    const contentAfter = await facade.readActiveSnapshotContent(
      after.publicationId,
      'BEGINNER',
    );
    expect(contentAfter).toEqual(contentBefore);
    expect(JSON.stringify(contentAfter)).not.toContain('NEW DRAFT TEXT');
  });

  it('stops answering the moment the publication is unpublished, but leaves the snapshot rows untouched', async () => {
    const lessonId = await newLesson('withdrawn');
    await publish(lessonId);
    const info = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    const rowsBefore = await dataSource.query(
      `SELECT * FROM "lesson_publication_levels" WHERE "lesson_id" = $1 ORDER BY "level"`,
      [lessonId],
    );

    await unpublish(lessonId);

    for (const level of ALL_LEVELS) {
      expect(await facade.findActiveSnapshotInfo(lessonId, level)).toBeNull();
    }
    // the withdrawn publication's content cannot be read through the facade either
    expect(
      await facade.readActiveSnapshotContent(info.publicationId, 'BEGINNER'),
    ).toBeNull();
    // ... but history is exactly as it was
    expect(
      await dataSource.query(
        `SELECT * FROM "lesson_publication_levels" WHERE "lesson_id" = $1 ORDER BY "level"`,
        [lessonId],
      ),
    ).toEqual(rowsBefore);
  });

  it('serves the new version after a republish and never the superseded one', async () => {
    const lessonId = await newLesson('republish');
    await publish(lessonId);
    const v1 = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    await dataSource.query(
      `UPDATE "lesson_blocks" SET "shared_content" = $2::jsonb WHERE "lesson_id" = $1`,
      [lessonId, JSON.stringify(richText('second version'))],
    );
    await republishAfterEdit(lessonId);

    const v2 = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    expect(v2.publicationVersion).toBe(2);
    expect(v2.publicationId).not.toBe(v1.publicationId);
    expect(v2.contentHash).not.toBe(v1.contentHash);
    expect(
      JSON.stringify(
        await facade.readActiveSnapshotContent(v2.publicationId, 'BEGINNER'),
      ),
    ).toContain('second version');
    // version 1 is an ended publication: unreadable here
    expect(
      await facade.readActiveSnapshotContent(v1.publicationId, 'BEGINNER'),
    ).toBeNull();
  });

  it('republishing identical content as a new version gives a new version number (the same hash)', async () => {
    const lessonId = await newLesson('same-content');
    await publish(lessonId);
    const v1 = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    await unpublish(lessonId);
    await publish(lessonId);
    const v2 = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    expect(v2.publicationVersion).toBe(2);
    expect(v2.contentHash).toBe(v1.contentHash);
  });

  it("a lesson never returns another lesson's snapshot", async () => {
    const one = await newLesson('lesson-one', ['BEGINNER']);
    const two = await newLesson('lesson-two', ['BEGINNER']);
    await publish(one);
    await publish(two);
    const infoOne = (await facade.findActiveSnapshotInfo(one, 'BEGINNER'))!;
    const infoTwo = (await facade.findActiveSnapshotInfo(two, 'BEGINNER'))!;
    expect(infoOne.publicationId).not.toBe(infoTwo.publicationId);
    expect(infoOne.lessonId).toBe(one);
    expect(infoTwo.lessonId).toBe(two);
    const contentOne = (await facade.readActiveSnapshotContent(
      infoOne.publicationId,
      'BEGINNER',
    )) as {
      lesson: { id: string };
    };
    expect(contentOne.lesson.id).toBe(one);
  });

  it('reads only the publication tables: the working copy can be deleted without changing the answer', async () => {
    const lessonId = await newLesson('no-authoring');
    await publish(lessonId);
    const before = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
    await simulateEdit(lessonId);
    await dataSource.query(
      `DELETE FROM "lesson_block_levels" WHERE "lesson_id" = $1`,
      [lessonId],
    );
    await dataSource.query(
      `DELETE FROM "lesson_blocks" WHERE "lesson_id" = $1`,
      [lessonId],
    );
    await dataSource.query(
      `DELETE FROM "lesson_levels" WHERE "lesson_id" = $1`,
      [lessonId],
    );
    expect(await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER')).toEqual(
      before,
    );
    expect(
      await facade.readActiveSnapshotContent(before.publicationId, 'BEGINNER'),
    ).not.toBeNull();
  });
});
