import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { deleteCatalogHistory } from '../../../../test/support/catalog-cleanup.js';
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
    await deleteCatalogHistory(
      dataSource,
      `SELECT "id" FROM "courses" WHERE "title" LIKE $1`,
      [like],
    );
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
  /** Where each test lesson sits, so a published course/module can be set up around it. */
  const placement = new Map<
    string,
    { courseId: string; moduleId: string; name: string }
  >();

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
    placement.set(lesson.id, {
      courseId: course.id,
      moduleId: module.id,
      name,
    });
    return lesson.id as string;
  };

  /**
   * Publishes the lesson's course with its module, as the catalog workflow would, by writing the catalog
   * rows directly (the services are covered by catalog.int-spec). Idempotent: does nothing if the course has
   * an active catalog publication.
   */
  const ensureCatalog = async (lessonId: string, listLesson = true) => {
    const where = placement.get(lessonId)!;
    const [active] = await dataSource.query(
      `SELECT "id" FROM "course_publications" WHERE "course_id" = $1 AND "ended_at" IS NULL`,
      [where.courseId],
    );
    if (active) return;
    const [{ next }] = await dataSource.query(
      `SELECT COALESCE(MAX("version"), 0) + 1 AS "next" FROM "course_publications" WHERE "course_id" = $1`,
      [where.courseId],
    );
    const [publication] = await dataSource.query(
      `INSERT INTO "course_publications"
         ("course_id", "version", "cause", "snapshot_schema_version", "course_title", "source_course_version", "published_by")
       VALUES ($1, $2, 'COURSE_PUBLISH', 1, $3, 1, $4) RETURNING "id"`,
      [where.courseId, next, title(where.name), admins.admin.id],
    );
    await dataSource.query(
      `INSERT INTO "course_publication_modules" ("publication_id", "course_id", "module_id", "position", "title")
       VALUES ($1, $2, $3, 1, $4)`,
      [
        publication.id,
        where.courseId,
        where.moduleId,
        title(`${where.name}-module`),
      ],
    );
    // the catalog snapshot lists the lesson at every level it is published at (the delivery gate reads it)
    const levels: { level: string }[] = await dataSource.query(
      `SELECT l."level" FROM "lesson_publications" p
         JOIN "lesson_publication_levels" l ON l."publication_id" = p."id"
        WHERE p."lesson_id" = $1 AND p."ended_at" IS NULL`,
      [lessonId],
    );
    for (const { level } of levels) {
      const content = {
        schemaVersion: 1,
        level,
        course: {
          id: where.courseId,
          title: title(where.name),
          description: null,
        },
        modules: [
          {
            id: where.moduleId,
            title: title(`${where.name}-module`),
            description: null,
            lessons: listLesson
              ? [
                  {
                    id: lessonId,
                    title: title(where.name),
                    shortTitle: null,
                    subtitle: null,
                    estimatedMinutes: null,
                  },
                ]
              : [],
          },
        ],
      };
      const json = JSON.stringify(content);
      await dataSource.query(
        `INSERT INTO "course_publication_levels" ("publication_id", "course_id", "level", "content", "content_hash", "content_bytes")
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          publication.id,
          where.courseId,
          level,
          json,
          createHash('sha256').update(json).digest('hex'),
          Buffer.byteLength(json),
        ],
      );
    }
  };

  /** Withdraws the lesson's course from the catalog (ends its active catalog publication). */
  const withdrawCatalog = (lessonId: string) =>
    dataSource.query(
      `UPDATE "course_publications"
          SET "ended_at" = clock_timestamp(), "ended_by" = $2, "ended_reason" = 'UNPUBLISHED'
        WHERE "course_id" = $1 AND "ended_at" IS NULL`,
      [placement.get(lessonId)!.courseId, admins.admin.id],
    );

  /** What an authoring edit does (the lessons module's job): back to DRAFT, content revision + 1. */
  const simulateEdit = (lessonId: string) =>
    dataSource.query(
      `UPDATE "lessons" SET "status"='DRAFT', "content_revision"="content_revision"+1, "updated_at"=now() WHERE "id"=$1`,
      [lessonId],
    );

  const publish = async (lessonId: string) => {
    const result = await workflow.perform('PUBLISH', lessonId, admins.admin);
    await ensureCatalog(lessonId); // a lesson is only served inside a published module and course
    return result;
  };
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

  describe('course and module gate', () => {
    it("serves nothing while the lesson's course and module are not published, even if the lesson is", async () => {
      const lessonId = await newLesson('gate-unpublished-course');
      await workflow.perform('PUBLISH', lessonId, admins.admin); // no catalog publication
      for (const level of ALL_LEVELS) {
        expect(await facade.findActiveSnapshotInfo(lessonId, level)).toBeNull();
      }
    });

    it('serves it once the module is in an active catalog publication, and stops the moment that ends', async () => {
      const lessonId = await newLesson('gate-withdraw');
      await publish(lessonId);
      const info = (await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'))!;
      expect(info).not.toBeNull();
      expect(
        await facade.readActiveSnapshotContent(info.publicationId, 'BEGINNER'),
      ).not.toBeNull();

      await withdrawCatalog(lessonId);

      // the lesson's own publication is still active ...
      const [still] = await dataSource.query(
        `SELECT 1 FROM "lesson_publications" WHERE "lesson_id" = $1 AND "ended_at" IS NULL`,
        [lessonId],
      );
      expect(still).toBeDefined();
      // ... but neither the info nor the content is available any more
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
      ).toBeNull();
      expect(
        await facade.readActiveSnapshotContent(info.publicationId, 'BEGINNER'),
      ).toBeNull();

      await ensureCatalog(lessonId); // republished: a new catalog version
      expect(await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER')).toEqual(
        info,
      );
    });

    it('does not serve a lesson the active catalog version does not list, even though its module is listed', async () => {
      const lessonId = await newLesson('gate-unlisted');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await ensureCatalog(lessonId, false); // module listed, lesson not in the snapshot
      for (const level of ALL_LEVELS) {
        expect(await facade.findActiveSnapshotInfo(lessonId, level)).toBeNull();
      }
      const [row] = await dataSource.query(
        `SELECT p."id" FROM "lesson_publications" p WHERE p."lesson_id" = $1 AND p."ended_at" IS NULL`,
        [lessonId],
      );
      expect(
        await facade.readActiveSnapshotContent(row.id, 'BEGINNER'),
      ).toBeNull();
      // a new catalog version that lists it makes it deliverable
      await withdrawCatalog(lessonId);
      await ensureCatalog(lessonId);
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
      ).not.toBeNull();
    });

    it('does not serve a lesson whose module is missing from the active catalog version', async () => {
      const lessonId = await newLesson('gate-other-module');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      // the course is published, but with a different module only
      const where = placement.get(lessonId)!;
      const [other] = await dataSource.query(
        `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,2) RETURNING "id"`,
        [where.courseId, title('gate-other-module-two')],
      );
      const [publication] = await dataSource.query(
        `INSERT INTO "course_publications"
           ("course_id", "version", "cause", "snapshot_schema_version", "course_title", "source_course_version", "published_by")
         VALUES ($1, 1, 'COURSE_PUBLISH', 1, 'c', 1, $2) RETURNING "id"`,
        [where.courseId, admins.admin.id],
      );
      await dataSource.query(
        `INSERT INTO "course_publication_modules" ("publication_id", "course_id", "module_id", "position", "title")
         VALUES ($1, $2, $3, 1, 'other')`,
        [publication.id, where.courseId, other.id],
      );
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
      ).toBeNull();
    });
  });
});
