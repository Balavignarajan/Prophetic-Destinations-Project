import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { deleteCatalogHistory } from '../../../../test/support/catalog-cleanup.js';
import { deleteWorkflowHistory } from '../../../../test/support/workflow-cleanup.js';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import {
  BusinessRuleError,
  ConflictError,
  type ContentStatus,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import { CatalogWorkflowService } from '../application/catalog-workflow.service.js';
import { PublishingFacade } from '../application/publishing.facade.js';
import { WorkflowService } from '../application/workflow.service.js';
import { canonicalJson } from '../domain/snapshot-payload.js';
import { PublishingModule } from '../publishing.module.js';
import { CatalogEventRepository } from './catalog-event.repository.js';
import { CatalogPublicationRepository } from './catalog-publication.repository.js';

// Integration: course/module publishing against the development database (DATABASE_URL): the tables and their
// triggers, the real services, rollback, concurrency, the live availability gate and the learner views.
// Everything created here carries a per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;
const emailOf = (name: string) => `cat-${runId}-${name}@int-test.invalid`;
const later = () => new Date(Date.now() + 60 * 60 * 1000);

interface LessonSpec {
  levels?: LearningLevel[];
}
interface ModuleSpec {
  status?: ContentStatus;
  lessons: LessonSpec[];
}
interface Built {
  courseId: string;
  modules: { moduleId: string; lessonIds: string[] }[];
}

// Every test builds its own data on a remote database: allow for round-trip latency.
vi.setConfig({ testTimeout: 180_000 });

describe('course and module publishing (integration)', () => {
  let dataSource: DataSource;
  let lessonWorkflow: WorkflowService;
  let catalog: CatalogWorkflowService;
  let facade: PublishingFacade;
  let catalogRepo: CatalogPublicationRepository;
  let eventRepo: CatalogEventRepository;
  let closeModule: () => Promise<void>;
  const admins: Record<string, AuthenticatedAdmin> = {};

  // Courses are tracked by id: a test renames one, so the title prefix alone would miss it.
  const courseIds: string[] = [];
  const coursesOfRun = `SELECT "id" FROM "courses" WHERE "id" = ANY($1::uuid[])`;
  const lessonsOfRun = `SELECT l."id" FROM "lessons" l
      JOIN "course_modules" m ON m."id" = l."module_id"
      JOIN "courses" c ON c."id" = m."course_id" WHERE c."id" = ANY($1::uuid[])`;

  const cleanup = async () => {
    const like = courseIds;
    await deleteCatalogHistory(dataSource, coursesOfRun, [like]);
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
      `DELETE FROM "course_modules" WHERE "course_id" IN (${coursesOfRun})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "courses" WHERE "id" = ANY($1::uuid[])`,
      [like],
    );
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `cat-${runId}-%@int-test.invalid`,
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

  /**
   * A course with modules and APPROVED, publishable lessons (not yet published). Built with a handful of
   * multi-row statements: the database is remote, so round trips are what make fixtures slow.
   */
  const buildCourse = async (
    name: string,
    modules: ModuleSpec[],
    courseStatus: ContentStatus = 'APPROVED',
  ): Promise<Built> => {
    const [course] = await dataSource.query(
      `INSERT INTO "courses" ("title","description","status") VALUES ($1,$2,$3) RETURNING "id"`,
      [title(name), `about ${name}`, courseStatus],
    );
    courseIds.push(course.id);
    const built: Built = { courseId: course.id, modules: [] };
    if (modules.length === 0) return built;

    const moduleRows: { id: string; position: number }[] =
      await dataSource.query(
        `INSERT INTO "course_modules" ("course_id","title","description","position","status")
         SELECT $1, $2 || '-module-' || g, 'module ' || g, g, (($3::text[])[g])
           FROM generate_series(1, $4::int) g
         RETURNING "id", "position"`,
        [
          course.id,
          title(name),
          modules.map((m) => m.status ?? 'APPROVED'),
          modules.length,
        ],
      );
    moduleRows.sort((a, b) => a.position - b.position);

    const lessonRows: { module: number; position: number; levels: string[] }[] =
      [];
    modules.forEach((spec, m) =>
      spec.lessons.forEach((lesson, l) =>
        lessonRows.push({
          module: m,
          position: l + 1,
          levels: lesson.levels ?? ['BEGINNER'],
        }),
      ),
    );
    const lessonIds: string[] = [];
    if (lessonRows.length > 0) {
      const inserted: { id: string; module_id: string; position: number }[] =
        await dataSource.query(
          `INSERT INTO "lessons" ("module_id","title","position","status")
           SELECT v.module_id, v.title, v.position, 'APPROVED'
             FROM unnest($1::uuid[], $2::text[], $3::int[]) AS v(module_id, title, position)
           RETURNING "id", "module_id", "position"`,
          [
            lessonRows.map((r) => moduleRows[r.module].id),
            lessonRows.map((r) =>
              title(`${name}-m${r.module + 1}-lesson-${r.position}`),
            ),
            lessonRows.map((r) => r.position),
          ],
        );
      const idOf = new Map(
        inserted.map((r) => [`${r.module_id}:${r.position}`, r.id]),
      );
      const lessonLevels: { id: string; level: string }[] = [];
      for (const r of lessonRows) {
        const id = idOf.get(`${moduleRows[r.module].id}:${r.position}`)!;
        lessonIds.push(id);
        for (const level of r.levels) lessonLevels.push({ id, level });
      }
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") SELECT * FROM unnest($1::uuid[], $2::text[])`,
        [lessonLevels.map((x) => x.id), lessonLevels.map((x) => x.level)],
      );
      const blocks: { id: string; lesson_id: string }[] =
        await dataSource.query(
          `INSERT INTO "lesson_blocks" ("lesson_id","type","position","shared_content")
           SELECT v.lesson_id, 'RICH_TEXT', 1, v.content::jsonb
             FROM unnest($1::uuid[], $2::text[]) AS v(lesson_id, content)
           RETURNING "id", "lesson_id"`,
          [
            lessonIds,
            lessonIds.map((_, i) =>
              JSON.stringify(richText(`text ${name} ${i + 1}`)),
            ),
          ],
        );
      const blockOf = new Map(blocks.map((b) => [b.lesson_id, b.id]));
      await dataSource.query(
        `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level")
         SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[])`,
        [
          lessonLevels.map((x) => blockOf.get(x.id)!),
          lessonLevels.map((x) => x.id),
          lessonLevels.map((x) => x.level),
        ],
      );
    }

    let next = 0;
    modules.forEach((spec, m) => {
      built.modules.push({
        moduleId: moduleRows[m].id,
        lessonIds: spec.lessons.map(() => lessonIds[next++]),
      });
    });
    return built;
  };

  const publishLesson = (lessonId: string) =>
    lessonWorkflow.perform('PUBLISH', lessonId, admins.admin);
  const unpublishLesson = (lessonId: string) =>
    lessonWorkflow.perform('UNPUBLISH', lessonId, admins.admin);
  const publishAllLessons = async (built: Built) => {
    await Promise.all(
      built.modules.flatMap((module) =>
        module.lessonIds.map((id) => publishLesson(id)),
      ),
    );
  };

  const perform = (
    built: Built,
    action: Parameters<CatalogWorkflowService['perform']>[1],
    moduleIndex?: number,
    actor = admins.admin,
    input: Parameters<CatalogWorkflowService['perform']>[3] = {},
  ) =>
    catalog.perform(
      {
        courseId: built.courseId,
        moduleId:
          moduleIndex === undefined
            ? undefined
            : built.modules[moduleIndex].moduleId,
      },
      action,
      actor,
      input,
    );

  const pubRows = (courseId: string) =>
    dataSource.query(
      `SELECT * FROM "course_publications" WHERE "course_id" = $1 ORDER BY "version"`,
      [courseId],
    );
  const memberRows = (publicationId: string) =>
    dataSource.query(
      `SELECT * FROM "course_publication_modules" WHERE "publication_id" = $1 ORDER BY "position"`,
      [publicationId],
    );
  const levelRows = (publicationId: string) =>
    dataSource.query(
      `SELECT * FROM "course_publication_levels" WHERE "publication_id" = $1 ORDER BY "level"`,
      [publicationId],
    );
  const eventRows = (courseId: string) =>
    dataSource.query(
      `SELECT * FROM "catalog_workflow_events" WHERE "course_id" = $1 ORDER BY "seq"`,
      [courseId],
    );
  const courseRow = async (id: string) =>
    (
      await dataSource.query(`SELECT * FROM "courses" WHERE "id" = $1`, [id])
    )[0];
  const moduleRow = async (id: string) =>
    (
      await dataSource.query(`SELECT * FROM "course_modules" WHERE "id" = $1`, [
        id,
      ])
    )[0];
  const lessonPubRows = (lessonIds: string[]) =>
    dataSource.query(
      `SELECT * FROM "lesson_publications" WHERE "lesson_id" = ANY($1::uuid[]) ORDER BY "lesson_id", "version"`,
      [lessonIds],
    );
  const allLessonIds = (built: Built) =>
    built.modules.flatMap((m) => m.lessonIds);

  /** A raw publication row, to probe the tables' own constraints. */
  const rawPublication = async (
    courseId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    const values: Record<string, unknown> = {
      course_id: courseId,
      version: 1,
      cause: 'COURSE_PUBLISH',
      snapshot_schema_version: 1,
      course_title: 'c',
      source_course_version: 1,
      published_by: admins.admin.id,
      ...overrides,
    };
    const columns = Object.keys(values);
    const [row] = await dataSource.query(
      `INSERT INTO "course_publications" (${columns.map((c) => `"${c}"`).join(',')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING "id"`,
      Object.values(values),
    );
    return row.id;
  };
  const endRaw = (id: string) =>
    dataSource.query(
      `UPDATE "course_publications" SET "ended_at" = clock_timestamp(), "ended_by" = $2, "ended_reason" = 'UNPUBLISHED' WHERE "id" = $1`,
      [id, admins.admin.id],
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, PublishingModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    lessonWorkflow = moduleRef.get(WorkflowService, { strict: false });
    catalog = moduleRef.get(CatalogWorkflowService, { strict: false });
    facade = moduleRef.get(PublishingFacade, { strict: false });
    catalogRepo = moduleRef.get(CatalogPublicationRepository, {
      strict: false,
    });
    eventRepo = moduleRef.get(CatalogEventRepository, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
    await newAdmin('admin', Role.ADMIN);
    await newAdmin('editor', Role.EDITOR);
    await newAdmin('reviewer', Role.REVIEWER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('tables and triggers', () => {
    it('allows one active catalog publication per course and unique versions', async () => {
      const { courseId } = await buildCourse('t-active', []);
      const first = await rawPublication(courseId, { version: 1 });
      await expect(
        rawPublication(courseId, { version: 2 }),
      ).rejects.toMatchObject({ code: '23505' });
      await endRaw(first);
      const second = await rawPublication(courseId, { version: 2 });
      await endRaw(second);
      await expect(
        rawPublication(courseId, { version: 2 }),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        rawPublication(courseId, { version: 3 }),
      ).resolves.toBeDefined();
    });

    it('validates version, cause, source version and the end fields', async () => {
      const { courseId } = await buildCourse('t-checks', []);
      for (const overrides of [
        { version: 0 },
        { cause: 'MANUAL' },
        { source_course_version: 0 },
        { snapshot_schema_version: 0 },
        { ended_at: later(), ended_by: admins.admin.id }, // no reason
        { ended_reason: 'UNPUBLISHED' }, // reason without end
        {
          ended_at: later(),
          ended_by: admins.admin.id,
          ended_reason: 'DELETED',
        },
        {
          published_at: new Date('2030-01-02'),
          ended_at: new Date('2030-01-01'),
          ended_by: admins.admin.id,
          ended_reason: 'UNPUBLISHED',
        },
      ]) {
        await expect(
          rawPublication(courseId, overrides),
          JSON.stringify(overrides),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('lets a publication be ended once, never reactivated or otherwise changed, and never deleted', async () => {
      const { courseId } = await buildCourse('t-end-once', []);
      const id = await rawPublication(courseId);
      for (const set of [
        `"version" = 9`,
        `"course_title" = 'changed'`,
        `"published_by" = '${admins.editor.id}'`,
      ]) {
        await expect(
          dataSource.query(
            `UPDATE "course_publications" SET ${set} WHERE "id" = $1`,
            [id],
          ),
          set,
        ).rejects.toMatchObject({ code: '23000' });
      }
      await endRaw(id);
      for (const set of [
        `"ended_at" = clock_timestamp()`,
        `"ended_reason" = 'SUPERSEDED'`,
        `"ended_at" = NULL, "ended_by" = NULL, "ended_reason" = NULL`,
      ]) {
        await expect(
          dataSource.query(
            `UPDATE "course_publications" SET ${set} WHERE "id" = $1`,
            [id],
          ),
          set,
        ).rejects.toMatchObject({ code: '23000' });
      }
      await expect(
        dataSource.query(`DELETE FROM "course_publications" WHERE "id" = $1`, [
          id,
        ]),
      ).rejects.toMatchObject({ code: '23000' });
    });

    it('keeps memberships and snapshots immutable, and refuses new ones on an ended publication', async () => {
      const built = await buildCourse('t-immutable', [{ lessons: [] }]);
      const id = await rawPublication(built.courseId);
      const moduleId = built.modules[0].moduleId;
      await dataSource.query(
        `INSERT INTO "course_publication_modules" ("publication_id","course_id","module_id","position","title") VALUES ($1,$2,$3,1,'m')`,
        [id, built.courseId, moduleId],
      );
      await dataSource.query(
        `INSERT INTO "course_publication_levels" ("publication_id","course_id","level","content","content_hash","content_bytes")
         VALUES ($1,$2,'BEGINNER','{"a":1}'::jsonb,$3,7)`,
        [id, built.courseId, 'a'.repeat(64)],
      );
      for (const sql of [
        `UPDATE "course_publication_modules" SET "title" = 'x' WHERE "publication_id" = $1`,
        `DELETE FROM "course_publication_modules" WHERE "publication_id" = $1`,
        `UPDATE "course_publication_levels" SET "content" = '{}'::jsonb WHERE "publication_id" = $1`,
        `DELETE FROM "course_publication_levels" WHERE "publication_id" = $1`,
      ]) {
        await expect(dataSource.query(sql, [id]), sql).rejects.toMatchObject({
          code: '23000',
        });
      }
      await endRaw(id);
      await expect(
        dataSource.query(
          `INSERT INTO "course_publication_levels" ("publication_id","course_id","level","content","content_hash","content_bytes")
           VALUES ($1,$2,'ADVANCED','{"a":1}'::jsonb,$3,7)`,
          [id, built.courseId, 'a'.repeat(64)],
        ),
      ).rejects.toMatchObject({ code: '23000' });
    });

    it('only lets a publication list modules of its own course, once each, in distinct positions', async () => {
      const a = await buildCourse('t-members-a', [
        { lessons: [] },
        { lessons: [] },
      ]);
      const b = await buildCourse('t-members-b', [{ lessons: [] }]);
      const id = await rawPublication(a.courseId);
      const insert = (
        moduleId: string,
        position: number,
        courseId = a.courseId,
      ) =>
        dataSource.query(
          `INSERT INTO "course_publication_modules" ("publication_id","course_id","module_id","position","title") VALUES ($1,$2,$3,$4,'m')`,
          [id, courseId, moduleId, position],
        );
      await expect(insert(b.modules[0].moduleId, 1)).rejects.toMatchObject({
        code: '23503',
      }); // another course's module
      await insert(a.modules[0].moduleId, 1);
      await expect(insert(a.modules[0].moduleId, 2)).rejects.toMatchObject({
        code: '23505',
      }); // twice
      await expect(insert(a.modules[1].moduleId, 1)).rejects.toMatchObject({
        code: '23505',
      }); // same position
      await expect(insert(a.modules[1].moduleId, 0)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('validates snapshot levels, content, hash and size', async () => {
      const { courseId } = await buildCourse('t-levels', []);
      const id = await rawPublication(courseId);
      const insert = (overrides: Record<string, unknown>) => {
        const v = {
          level: 'BEGINNER',
          content: '{"a":1}',
          content_hash: 'a'.repeat(64),
          content_bytes: 7,
          ...overrides,
        };
        return dataSource.query(
          `INSERT INTO "course_publication_levels" ("publication_id","course_id","level","content","content_hash","content_bytes")
           VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
          [id, courseId, v.level, v.content, v.content_hash, v.content_bytes],
        );
      };
      for (const overrides of [
        { level: 'EXPERT' },
        { content: '[1]' },
        { content: 'null' },
        { content_hash: 'A'.repeat(64) },
        { content_hash: 'a'.repeat(63) },
        { content_bytes: 0 },
        { content_bytes: 5242881 },
      ]) {
        await expect(
          insert(overrides),
          JSON.stringify(overrides),
        ).rejects.toThrow();
      }
      await expect(insert({ content_bytes: 5242880 })).resolves.toBeDefined();
      await expect(insert({ content_bytes: 7 })).rejects.toMatchObject({
        code: '23505',
      }); // one per level
    });

    it('records only the approved transition shapes, and publish/unpublish only with a catalog version', async () => {
      const built = await buildCourse('t-events', [{ lessons: [] }]);
      const id = await rawPublication(built.courseId);
      const insert = (overrides: Record<string, unknown>) => {
        const v = {
          course_id: built.courseId,
          module_id: null,
          action: 'SUBMIT_FOR_REVIEW',
          from_status: 'DRAFT',
          to_status: 'READY_FOR_REVIEW',
          actor_admin_id: admins.admin.id,
          actor_role: 'ADMIN',
          note: null,
          subject_version: 1,
          publication_id: null,
          ...overrides,
        };
        const columns = Object.keys(v);
        return dataSource.query(
          `INSERT INTO "catalog_workflow_events" (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`,
          Object.values(v),
        );
      };
      await expect(insert({})).resolves.toBeDefined();
      await expect(
        insert({ module_id: built.modules[0].moduleId }),
      ).resolves.toBeDefined();
      for (const bad of [
        { action: 'APPROVE', from_status: 'DRAFT', to_status: 'APPROVED' },
        {
          action: 'PUBLISH',
          from_status: 'DRAFT',
          to_status: 'PUBLISHED',
          publication_id: id,
        },
        {
          action: 'REQUEST_CHANGES',
          from_status: 'READY_FOR_REVIEW',
          to_status: 'DRAFT',
          note: null,
        },
        {
          action: 'REQUEST_CHANGES',
          from_status: 'READY_FOR_REVIEW',
          to_status: 'DRAFT',
          note: '  ',
        },
        { action: 'PUBLISH', from_status: 'APPROVED', to_status: 'PUBLISHED' }, // needs a publication
        { publication_id: id }, // a review action carries none
        { subject_version: 0 },
        { actor_role: 'SUPERUSER' },
      ]) {
        await expect(insert(bad), JSON.stringify(bad)).rejects.toMatchObject({
          code: '23514',
        });
      }
      // unpublish keeps the status except PUBLISHED -> APPROVED
      for (const shape of [
        { from_status: 'PUBLISHED', to_status: 'APPROVED' },
        { from_status: 'DRAFT', to_status: 'DRAFT' },
        { from_status: 'READY_FOR_REVIEW', to_status: 'READY_FOR_REVIEW' },
        { from_status: 'APPROVED', to_status: 'APPROVED' },
      ]) {
        await expect(
          insert({ action: 'UNPUBLISH', ...shape, publication_id: id }),
        ).resolves.toBeDefined();
      }
      // a module of another course cannot be named
      const other = await buildCourse('t-events-other', [{ lessons: [] }]);
      await expect(
        insert({ module_id: other.modules[0].moduleId }),
      ).rejects.toMatchObject({ code: '23503' });
      // append-only
      await expect(
        dataSource.query(
          `UPDATE "catalog_workflow_events" SET "note" = 'x' WHERE "course_id" = $1`,
          [built.courseId],
        ),
      ).rejects.toMatchObject({ code: '23000' });
      await expect(
        dataSource.query(
          `DELETE FROM "catalog_workflow_events" WHERE "course_id" = $1`,
          [built.courseId],
        ),
      ).rejects.toMatchObject({ code: '23000' });
    });

    it('refuses a PUBLISHED course without an active catalog publication, and accepts every other state with one', async () => {
      const built = await buildCourse('t-consistency', []);
      await expect(
        dataSource.query(
          `UPDATE "courses" SET "status" = 'PUBLISHED' WHERE "id" = $1`,
          [built.courseId],
        ),
      ).rejects.toMatchObject({
        code: '23000',
        message: expect.stringContaining('active catalog publication'),
      });

      const id = await dataSource.transaction(async (m) => {
        await m.query(
          `UPDATE "courses" SET "status" = 'PUBLISHED' WHERE "id" = $1`,
          [built.courseId],
        );
        const [row] = await m.query(
          `INSERT INTO "course_publications" ("course_id","version","cause","snapshot_schema_version","course_title","source_course_version","published_by")
           VALUES ($1,1,'COURSE_PUBLISH',1,'c',1,$2) RETURNING "id"`,
          [built.courseId, admins.admin.id],
        );
        return row.id as string;
      });
      // ending the publication of a PUBLISHED course on its own is refused ...
      await expect(endRaw(id)).rejects.toMatchObject({ code: '23000' });
      // ... but an edited working copy (any other status) may keep an older version active
      for (const status of ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED']) {
        await dataSource.query(
          `UPDATE "courses" SET "status" = $2 WHERE "id" = $1`,
          [built.courseId, status],
        );
      }
      // ... and ending it together with moving the status is fine
      await dataSource.transaction(async (m) => {
        await m.query(
          `UPDATE "course_publications" SET "ended_at" = clock_timestamp(), "ended_by" = $2, "ended_reason" = 'UNPUBLISHED' WHERE "id" = $1`,
          [id, admins.admin.id],
        );
      });
      expect((await courseRow(built.courseId)).status).toBe('APPROVED');
    });

    it('refuses to delete a course or module that has catalog history (restrict)', async () => {
      const built = await buildCourse('t-restrict', [{ lessons: [] }]);
      const id = await rawPublication(built.courseId);
      await dataSource.query(
        `INSERT INTO "course_publication_modules" ("publication_id","course_id","module_id","position","title") VALUES ($1,$2,$3,1,'m')`,
        [id, built.courseId, built.modules[0].moduleId],
      );
      await expect(
        dataSource.query(`DELETE FROM "course_modules" WHERE "id" = $1`, [
          built.modules[0].moduleId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });
      await expect(
        dataSource.query(`DELETE FROM "courses" WHERE "id" = $1`, [
          built.courseId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });
    });
  });

  describe('publishing a course with the real services', () => {
    it('publishes the course, its approved modules and the level snapshots atomically, leaving lessons untouched', async () => {
      const built = await buildCourse('s-publish', [
        {
          lessons: [
            { levels: ['BEGINNER', 'ADVANCED'] },
            { levels: ['BEGINNER'] },
          ],
        },
        { lessons: [{ levels: ['BEGINNER'] }] },
        { status: 'DRAFT', lessons: [{ levels: ['BEGINNER'] }] },
      ]);
      await publishAllLessons(built);
      const lessonsBefore = await lessonPubRows(allLessonIds(built));
      const courseBefore = await courseRow(built.courseId);

      const result = await perform(built, 'PUBLISH');

      expect(result).toMatchObject({
        status: 'PUBLISHED',
        modulesPublished: [
          built.modules[0].moduleId,
          built.modules[1].moduleId,
        ],
      });
      expect(result.modulesNotIncluded).toEqual([
        {
          moduleId: built.modules[2].moduleId,
          status: 'DRAFT',
          reason: 'NOT_APPROVED',
        },
      ]);

      const [publication] = await pubRows(built.courseId);
      expect(publication).toMatchObject({
        version: 1,
        cause: 'COURSE_PUBLISH',
        course_title: title('s-publish'),
        ended_at: null,
        published_by: admins.admin.id,
      });
      expect(
        (await memberRows(publication.id)).map(
          (r: { module_id: string; position: number }) => [
            r.module_id,
            r.position,
          ],
        ),
      ).toEqual([
        [built.modules[0].moduleId, 1],
        [built.modules[1].moduleId, 2],
      ]);
      const levels = await levelRows(publication.id);
      expect(levels.map((l: { level: string }) => l.level)).toEqual([
        'ADVANCED',
        'BEGINNER',
      ]);

      // statuses: the course and the approved modules are published, the draft module is not
      expect((await courseRow(built.courseId)).status).toBe('PUBLISHED');
      expect((await moduleRow(built.modules[0].moduleId)).status).toBe(
        'PUBLISHED',
      );
      expect((await moduleRow(built.modules[1].moduleId)).status).toBe(
        'PUBLISHED',
      );
      expect((await moduleRow(built.modules[2].moduleId)).status).toBe('DRAFT');
      // transitions are not edits: the course's version did not move
      expect((await courseRow(built.courseId)).version).toBe(
        courseBefore.version,
      );
      // lesson publications and lesson statuses are exactly as they were
      expect(await lessonPubRows(allLessonIds(built))).toEqual(lessonsBefore);

      // events: one per published module, then the course, all pointing at the new version
      const events = await eventRows(built.courseId);
      expect(
        events.map(
          (e: {
            module_id: string | null;
            action: string;
            publication_id: string;
          }) => [e.module_id, e.action, e.publication_id],
        ),
      ).toEqual([
        [built.modules[0].moduleId, 'PUBLISH', publication.id],
        [built.modules[1].moduleId, 'PUBLISH', publication.id],
        [null, 'PUBLISH', publication.id],
      ]);
    });

    it("stores a level snapshot whose hash and size match its stored content, listing only that level's lessons in order", async () => {
      const built = await buildCourse('s-snapshot', [
        {
          lessons: [
            { levels: ['BEGINNER'] },
            { levels: ['BEGINNER', 'INTERMEDIATE'] },
          ],
        },
        { lessons: [{ levels: ['INTERMEDIATE'] }] },
      ]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      const [publication] = await pubRows(built.courseId);
      for (const row of await levelRows(publication.id)) {
        const canonical = canonicalJson(row.content);
        expect(row.content_hash.trim()).toBe(
          createHash('sha256').update(canonical, 'utf8').digest('hex'),
        );
        expect(row.content_bytes).toBe(Buffer.byteLength(canonical, 'utf8'));
        expect(row.content).toMatchObject({
          schemaVersion: 1,
          level: row.level,
          course: { id: built.courseId, title: title('s-snapshot') },
        });
      }
      const beginner = (await levelRows(publication.id)).find(
        (l: { level: string }) => l.level === 'BEGINNER',
      ).content;
      expect(
        beginner.modules.map((m: { id: string; lessons: { id: string }[] }) => [
          m.id,
          m.lessons.map((l) => l.id),
        ]),
      ).toEqual([
        [
          built.modules[0].moduleId,
          [built.modules[0].lessonIds[0], built.modules[0].lessonIds[1]],
        ],
      ]);
      const intermediate = (await levelRows(publication.id)).find(
        (l: { level: string }) => l.level === 'INTERMEDIATE',
      ).content;
      expect(
        intermediate.modules.map(
          (m: { id: string; lessons: { id: string }[] }) => [
            m.id,
            m.lessons.map((l) => l.id),
          ],
        ),
      ).toEqual([
        [built.modules[0].moduleId, [built.modules[0].lessonIds[1]]],
        [built.modules[1].moduleId, [built.modules[1].lessonIds[0]]],
      ]);
      expect(JSON.stringify(beginner)).not.toContain(
        built.modules[1].lessonIds[0],
      );
    });

    it('refuses a catalog with no published lesson (422) and writes nothing', async () => {
      const built = await buildCourse('s-nothing', [{ lessons: [{}] }]); // lessons exist but none is published
      const before = await courseRow(built.courseId);
      const error = await perform(built, 'PUBLISH').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).details).toMatchObject({
        report: { ready: false, issues: [{ code: 'NO_PUBLISHED_LESSONS' }] },
      });
      expect(await courseRow(built.courseId)).toEqual(before);
      expect(await pubRows(built.courseId)).toEqual([]);
      expect(await eventRows(built.courseId)).toEqual([]);
      expect((await moduleRow(built.modules[0].moduleId)).status).toBe(
        'APPROVED',
      );
    });

    it('rolls everything back when the final event cannot be recorded (publication, snapshots, module and course status)', async () => {
      const built = await buildCourse('s-rollback-event', [{ lessons: [{}] }]);
      await publishAllLessons(built);
      const original = eventRepo.append.bind(eventRepo);
      let calls = 0;
      vi.spyOn(eventRepo, 'append').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error('course event failed'); // the module event succeeded, the course event fails
        return original(...args);
      });

      await expect(perform(built, 'PUBLISH')).rejects.toThrow(
        'course event failed',
      );

      expect(await pubRows(built.courseId)).toEqual([]);
      expect(await eventRows(built.courseId)).toEqual([]);
      expect((await courseRow(built.courseId)).status).toBe('APPROVED');
      expect((await moduleRow(built.modules[0].moduleId)).status).toBe(
        'APPROVED',
      );
      vi.restoreAllMocks();
      await expect(perform(built, 'PUBLISH')).resolves.toMatchObject({
        publication: { version: 1 },
      }); // no version was consumed
    });

    it('rolls back when the snapshots cannot be stored, and keeps a previous version active', async () => {
      const built = await buildCourse('s-rollback-levels', [{ lessons: [{}] }]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      await perform(built, 'UNPUBLISH');
      await dataSource.query(
        `UPDATE "courses" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [built.courseId],
      );
      vi.spyOn(catalogRepo, 'insertLevels').mockRejectedValueOnce(
        new Error('snapshot storage failed'),
      );
      await expect(perform(built, 'PUBLISH')).rejects.toThrow(
        'snapshot storage failed',
      );
      expect(
        (await pubRows(built.courseId)).map(
          (p: { version: number }) => p.version,
        ),
      ).toEqual([1]);
      expect((await courseRow(built.courseId)).status).toBe('APPROVED');
    });

    it('a failing foreign key (an unknown actor) leaves nothing behind', async () => {
      const built = await buildCourse('s-rollback-fk', [{ lessons: [{}] }]);
      await publishAllLessons(built);
      const ghost: AuthenticatedAdmin = {
        id: randomUUID(),
        email: 'ghost@int-test.invalid',
        role: Role.ADMIN,
      };
      await expect(
        perform(built, 'PUBLISH', undefined, ghost),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
      expect(await pubRows(built.courseId)).toEqual([]);
      expect((await courseRow(built.courseId)).status).toBe('APPROVED');
      expect((await moduleRow(built.modules[0].moduleId)).status).toBe(
        'APPROVED',
      );
    });
  });

  describe('module actions and versions', () => {
    async function published(name: string) {
      const built = await buildCourse(name, [
        { lessons: [{}, {}] },
        { status: 'DRAFT', lessons: [{}] },
      ]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      return built;
    }

    it('publishes an approved module into a published course as a new version, carrying the rest over', async () => {
      const built = await published('m-publish');
      await dataSource.query(
        `UPDATE "courses" SET "title" = 'Unapproved new title', "status" = 'DRAFT' WHERE "id" = $1`,
        [built.courseId],
      );
      await dataSource.query(
        `UPDATE "course_modules" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [built.modules[1].moduleId],
      );

      const result = await perform(built, 'PUBLISH', 1);

      expect(result).toMatchObject({
        moduleId: built.modules[1].moduleId,
        status: 'PUBLISHED',
        supersededPublication: { version: 1 },
      });
      const rows = await pubRows(built.courseId);
      expect(
        rows.map(
          (p: {
            version: number;
            ended_reason: string | null;
            cause: string;
          }) => [p.version, p.ended_reason, p.cause],
        ),
      ).toEqual([
        [1, 'SUPERSEDED', 'COURSE_PUBLISH'],
        [2, null, 'MODULE_PUBLISH'],
      ]);
      expect(rows[1].course_title).toBe(title('m-publish')); // the published title, not the working copy's
      expect(
        (await memberRows(rows[1].id)).map(
          (r: { module_id: string }) => r.module_id,
        ),
      ).toEqual([built.modules[0].moduleId, built.modules[1].moduleId]);
      expect((await courseRow(built.courseId)).status).toBe('DRAFT'); // a module action never moves the course
    });

    it('unpublishing a module creates a version without it; its lessons stop being served, the others do not', async () => {
      const built = await published('m-unpublish');
      const [first] = built.modules;
      expect(
        await facade.findActiveSnapshotInfo(first.lessonIds[0], 'BEGINNER'),
      ).not.toBeNull();

      const result = await perform(built, 'UNPUBLISH', 0);

      expect(result).toMatchObject({
        fromStatus: 'PUBLISHED',
        status: 'APPROVED',
        publication: { version: 2, cause: 'MODULE_UNPUBLISH' },
      });
      expect(
        await facade.findActiveSnapshotInfo(first.lessonIds[0], 'BEGINNER'),
      ).toBeNull();
      expect(
        await facade.findActiveSnapshotInfo(first.lessonIds[1], 'BEGINNER'),
      ).toBeNull();
      // lesson publications are untouched: only the gate closed
      const [lessonPub] = await lessonPubRows([first.lessonIds[0]]);
      expect(lessonPub.ended_at).toBeNull();
    });

    it('republishing a module restores its lessons', async () => {
      const built = await published('m-republish');
      await perform(built, 'UNPUBLISH', 0);
      await perform(built, 'PUBLISH', 0);
      expect(
        await facade.findActiveSnapshotInfo(
          built.modules[0].lessonIds[0],
          'BEGINNER',
        ),
      ).not.toBeNull();
      expect(
        (await pubRows(built.courseId)).map(
          (p: { version: number }) => p.version,
        ),
      ).toEqual([1, 2, 3]);
    });

    it('keeps the earlier published entry of an edited module when the course is withdrawn and published again', async () => {
      const built = await published('m-carry');
      await dataSource.query(
        `UPDATE "course_modules" SET "status" = 'DRAFT', "title" = 'Unapproved module edit' WHERE "id" = $1`,
        [built.modules[0].moduleId],
      );
      await perform(built, 'UNPUBLISH');
      await dataSource.query(
        `UPDATE "courses" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [built.courseId],
      );
      await perform(built, 'PUBLISH');
      const [, second] = await pubRows(built.courseId);
      const modules = await memberRows(second.id);
      expect(
        modules.find(
          (m: { module_id: string }) =>
            m.module_id === built.modules[0].moduleId,
        ).title,
      ).toBe(title('m-carry-module-1'));
      expect((await moduleRow(built.modules[0].moduleId)).status).toBe('DRAFT'); // still the unapproved working copy
    });

    it('unpublishing the course ends the version once, creates no new one, and changes no module status', async () => {
      const built = await published('m-course-unpublish');
      const before = (await moduleRow(built.modules[0].moduleId)).status;
      await perform(built, 'UNPUBLISH');
      const rows = await pubRows(built.courseId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        ended_reason: 'UNPUBLISHED',
        ended_by: admins.admin.id,
      });
      expect((await moduleRow(built.modules[0].moduleId)).status).toBe(before);
      await expect(perform(built, 'UNPUBLISH')).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe('availability gate (lesson delivery depends on the course and module)', () => {
    it('serves a lesson only while its course and module are published AND the lesson is published', async () => {
      const built = await buildCourse('g-gate', [
        { lessons: [{ levels: ['BEGINNER'] }, { levels: ['BEGINNER'] }] },
      ]);
      const [lessonA, lessonB] = built.modules[0].lessonIds;
      const served = async (id: string) =>
        (await facade.findActiveSnapshotInfo(id, 'BEGINNER')) !== null;

      await publishAllLessons(built);
      expect(await served(lessonA)).toBe(false); // lessons published, course not yet
      await perform(built, 'PUBLISH');
      expect(await served(lessonA)).toBe(true);
      expect(await served(lessonB)).toBe(true);

      await unpublishLesson(lessonB); // the lesson's own publication is still required
      expect(await served(lessonA)).toBe(true);
      expect(await served(lessonB)).toBe(false);

      await perform(built, 'UNPUBLISH'); // withdrawing the course closes the gate for everything
      expect(await served(lessonA)).toBe(false);
      expect((await lessonPubRows([lessonA]))[0].ended_at).toBeNull(); // yet lesson A's own publication is still active
    });

    it('never serves a lesson at a level it was not published at, whatever the catalog says', async () => {
      const built = await buildCourse('g-levels', [
        { lessons: [{ levels: ['INTERMEDIATE'] }] },
      ]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      const id = built.modules[0].lessonIds[0];
      expect(
        await facade.findActiveSnapshotInfo(id, 'INTERMEDIATE'),
      ).not.toBeNull();
      expect(await facade.findActiveSnapshotInfo(id, 'BEGINNER')).toBeNull();
      expect(await facade.findActiveSnapshotInfo(id, 'ADVANCED')).toBeNull();
    });
  });

  describe('the learner catalog', () => {
    async function twoModuleCourse(name: string) {
      const built = await buildCourse(name, [
        {
          lessons: [
            { levels: ['BEGINNER', 'ADVANCED'] },
            { levels: ['BEGINNER'] },
          ],
        },
        {
          lessons: [
            { levels: ['BEGINNER'] },
            { levels: ['BEGINNER', 'ADVANCED'] },
          ],
        },
      ]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      return built;
    }
    const flat = (built: Built) => built.modules.flatMap((m) => m.lessonIds);

    it("shows the course at a level with its modules and lessons in order, and each lesson's neighbours", async () => {
      const built = await twoModuleCourse('c-view');
      const [a, b, c, d] = flat(built);
      const view = (await facade.findPublishedCourse(
        built.courseId,
        'BEGINNER',
      ))!;
      expect(view).toMatchObject({
        courseId: built.courseId,
        level: 'BEGINNER',
        catalogVersion: 1,
        moduleCount: 2,
        lessonCount: 4,
      });
      expect(
        view.modules
          .flatMap((m) => m.lessons)
          .map((l) => [l.lessonId, l.previousLessonId, l.nextLessonId]),
      ).toEqual([
        [a, null, b],
        [b, a, c],
        [c, b, d],
        [d, c, null],
      ]);
    });

    it('lists only the lessons available at the requested level, with no fallback', async () => {
      const built = await twoModuleCourse('c-levels');
      const [a, , , d] = flat(built);
      const advanced = (await facade.findPublishedCourse(
        built.courseId,
        'ADVANCED',
      ))!;
      expect(
        advanced.modules.flatMap((m) => m.lessons).map((l) => l.lessonId),
      ).toEqual([a, d]);
      expect(advanced.lessonCount).toBe(2);
      expect(
        await facade.findPublishedCourse(built.courseId, 'INTERMEDIATE'),
      ).toBeNull();
    });

    it('skips a withdrawn lesson in the view and in navigation, across a module boundary, as soon as it is withdrawn', async () => {
      const built = await twoModuleCourse('c-skip');
      const [a, b, c, d] = flat(built);
      await unpublishLesson(b);
      await unpublishLesson(c);

      const view = (await facade.findPublishedCourse(
        built.courseId,
        'BEGINNER',
      ))!;
      expect(view.lessonCount).toBe(2);
      expect(JSON.stringify(view)).not.toMatch(new RegExp(`${b}|${c}`));
      expect(
        (await facade.findLessonNavigation(a, 'BEGINNER'))!.next,
      ).toMatchObject({ lessonId: d, moduleId: built.modules[1].moduleId });
      expect(
        (await facade.findLessonNavigation(d, 'BEGINNER'))!.previous,
      ).toMatchObject({ lessonId: a });
      expect(await facade.findLessonNavigation(b, 'BEGINNER')).toBeNull(); // not deliverable itself
    });

    it('omits a module that has no eligible lesson left, and counts only what is shown', async () => {
      const built = await twoModuleCourse('c-empty-module');
      await unpublishLesson(built.modules[1].lessonIds[0]);
      await unpublishLesson(built.modules[1].lessonIds[1]);
      const view = (await facade.findPublishedCourse(
        built.courseId,
        'BEGINNER',
      ))!;
      expect(view.modules.map((m) => m.moduleId)).toEqual([
        built.modules[0].moduleId,
      ]);
      expect(view).toMatchObject({ moduleCount: 1, lessonCount: 2 });
    });

    it('has nothing for a course that is not published or has been withdrawn, and its lessons have no navigation', async () => {
      const draft = await buildCourse('c-draft', [{ lessons: [{}] }]);
      await publishAllLessons(draft);
      expect(
        await facade.findPublishedCourse(draft.courseId, 'BEGINNER'),
      ).toBeNull();
      expect(
        await facade.findLessonNavigation(
          draft.modules[0].lessonIds[0],
          'BEGINNER',
        ),
      ).toBeNull();

      const built = await twoModuleCourse('c-withdrawn');
      await perform(built, 'UNPUBLISH');
      expect(
        await facade.findPublishedCourse(built.courseId, 'BEGINNER'),
      ).toBeNull();
      expect(
        await facade.findLessonNavigation(flat(built)[0], 'BEGINNER'),
      ).toBeNull();
      expect(
        (await facade.listPublishedCourses('BEGINNER')).map((c) => c.courseId),
      ).not.toContain(built.courseId);
    });

    it('lists published courses, but only those with something to show at the level', async () => {
      const both = await twoModuleCourse('c-list-both');
      const beginnerOnly = await buildCourse('c-list-beginner', [
        { lessons: [{ levels: ['BEGINNER'] }] },
      ]);
      await publishAllLessons(beginnerOnly);
      await perform(beginnerOnly, 'PUBLISH');

      const ids = async (level: LearningLevel) =>
        (await facade.listPublishedCourses(level))
          .map((c) => c.courseId)
          .filter((id) => [both.courseId, beginnerOnly.courseId].includes(id));
      expect(await ids('BEGINNER')).toEqual([
        both.courseId,
        beginnerOnly.courseId,
      ]); // first-published order
      expect(await ids('ADVANCED')).toEqual([both.courseId]);
      expect(await ids('INTERMEDIATE')).toEqual([]);
    });

    it('does not deliver, list or navigate a lesson published after the catalog version, until a refresh lists it', async () => {
      const built = await buildCourse('c-late', [{ lessons: [{}, {}] }]);
      await publishLesson(built.modules[0].lessonIds[0]);
      await perform(built, 'PUBLISH');
      const [first, late] = built.modules[0].lessonIds;
      await publishLesson(late);

      // the active catalog version is the one authority: direct delivery, detail and navigation agree
      expect(await facade.findActiveSnapshotInfo(late, 'BEGINNER')).toBeNull();
      expect(await facade.findLessonNavigation(late, 'BEGINNER')).toBeNull();
      const view = (await facade.findPublishedCourse(
        built.courseId,
        'BEGINNER',
      ))!;
      expect(view.lessonCount).toBe(1);
      expect(
        await facade.findActiveSnapshotInfo(first, 'BEGINNER'),
      ).not.toBeNull();
      const [v1] = await pubRows(built.courseId);
      const v1Levels = await dataSource.query(
        `SELECT "level", "content_hash" FROM "course_publication_levels" WHERE "publication_id" = $1`,
        [v1.id],
      );

      // a refresh (PUBLISH of the published course) creates version 2 with no outage
      const refresh = await perform(built, 'PUBLISH');
      expect(refresh).toMatchObject({
        fromStatus: 'PUBLISHED',
        status: 'PUBLISHED',
      });
      expect(refresh.publication).toMatchObject({ version: 2 });
      expect(
        await facade.findActiveSnapshotInfo(late, 'BEGINNER'),
      ).not.toBeNull();
      expect(
        (await facade.findPublishedCourse(built.courseId, 'BEGINNER'))!
          .lessonCount,
      ).toBe(2);
      const nav = (await facade.findLessonNavigation(first, 'BEGINNER'))!;
      expect(nav.next?.lessonId).toBe(late);

      // version 1 is untouched and ended as SUPERSEDED
      expect(
        await dataSource.query(
          `SELECT "level", "content_hash" FROM "course_publication_levels" WHERE "publication_id" = $1`,
          [v1.id],
        ),
      ).toEqual(v1Levels);
      const rows = await pubRows(built.courseId);
      expect(rows.map((p: { version: number }) => p.version)).toEqual([1, 2]);
      expect(rows[0].ended_reason).toBe('SUPERSEDED');
      expect(rows[1].ended_at).toBeNull();
    });

    it('a lesson republished with an additional level is delivered at that level only after a refresh', async () => {
      const built = await buildCourse('c-newlevel', [
        { lessons: [{ levels: ['BEGINNER', 'ADVANCED'] }] },
      ]);
      const [lessonId] = built.modules[0].lessonIds;
      await dataSource.query(
        `UPDATE "lesson_levels" SET "level" = "level" WHERE "lesson_id" = $1`,
        [lessonId],
      );
      // publish at BEGINNER only first: drop ADVANCED from the working copy, publish, then re-add and republish
      await dataSource.query(
        `DELETE FROM "lesson_block_levels" WHERE "lesson_id" = $1 AND "level" = 'ADVANCED'`,
        [lessonId],
      );
      await dataSource.query(
        `DELETE FROM "lesson_levels" WHERE "lesson_id" = $1 AND "level" = 'ADVANCED'`,
        [lessonId],
      );
      await publishLesson(lessonId);
      await perform(built, 'PUBLISH');
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'ADVANCED'),
      ).toBeNull();

      await lessonWorkflow.perform('UNPUBLISH', lessonId, admins.admin);
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,'ADVANCED')`,
        [lessonId],
      );
      await dataSource.query(
        `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level")
         SELECT "id", "lesson_id", 'ADVANCED' FROM "lesson_blocks" WHERE "lesson_id" = $1`,
        [lessonId],
      );
      await dataSource.query(
        `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [lessonId],
      );
      await publishLesson(lessonId);

      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
      ).not.toBeNull();
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'ADVANCED'),
      ).toBeNull();
      await perform(built, 'PUBLISH');
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'ADVANCED'),
      ).not.toBeNull();
      expect(
        (await facade.findPublishedCourse(built.courseId, 'ADVANCED'))!
          .lessonCount,
      ).toBe(1);
    });
  });

  describe('refresh, withdrawn modules and approved order', () => {
    const publishedCourseOf = async (name: string, layout: ModuleSpec[]) => {
      const built = await buildCourse(name, layout);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      return built;
    };
    const activeVersion = async (courseId: string) =>
      (await pubRows(courseId)).filter(
        (p: { ended_at: Date | null }) => p.ended_at === null,
      );
    const orderOf = async (courseId: string, version?: number) => {
      const rows = await pubRows(courseId);
      const row = version
        ? rows.find((p: { version: number }) => p.version === version)
        : rows.at(-1);
      const [level] = await dataSource.query(
        `SELECT "content" FROM "course_publication_levels" WHERE "publication_id" = $1 AND "level" = 'BEGINNER'`,
        [row.id],
      );
      return (
        level.content.modules as { id: string; lessons: { id: string }[] }[]
      ).map((m) => [m.id, m.lessons.map((l) => l.id)] as const);
    };

    it('only an ADMIN may refresh, and the refresh keeps the course published throughout', async () => {
      const built = await publishedCourseOf('r-auth', [{ lessons: [{}] }]);
      for (const who of [admins.editor, admins.reviewer]) {
        await expect(
          perform(built, 'PUBLISH', undefined, who),
        ).rejects.toMatchObject({
          name: expect.stringMatching(/Forbidden/),
        });
      }
      expect(await activeVersion(built.courseId)).toHaveLength(1);
      const [lessonId] = built.modules[0].lessonIds;
      await perform(built, 'PUBLISH'); // an admin can
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
      ).not.toBeNull();
      expect((await courseRow(built.courseId)).status).toBe('PUBLISHED');
    });

    it('a failed refresh leaves the previous version active, delivering and unchanged', async () => {
      const built = await publishedCourseOf('r-fail', [{ lessons: [{}] }]);
      const [lessonId] = built.modules[0].lessonIds;
      const events = (await eventRows(built.courseId)).length;
      await unpublishLesson(lessonId); // nothing left to list: the refresh is not ready
      await expect(perform(built, 'PUBLISH')).rejects.toBeInstanceOf(
        BusinessRuleError,
      );
      const rows = await pubRows(built.courseId);
      expect(rows).toHaveLength(1);
      expect(rows[0].ended_at).toBeNull();
      expect((await eventRows(built.courseId)).length).toBe(events);
      expect((await courseRow(built.courseId)).status).toBe('PUBLISHED');
      // once the lesson is published again the old version delivers it again (it still lists it)
      await publishLesson(lessonId);
      expect(
        await facade.findActiveSnapshotInfo(lessonId, 'BEGINNER'),
      ).not.toBeNull();
    });

    it('a module withdrawn on purpose stays out when the course is unpublished and republished', async () => {
      const built = await publishedCourseOf('r-withdrawn', [
        { lessons: [{}] },
        { lessons: [{}] },
      ]);
      const [m1, m2] = built.modules;
      await perform(built, 'UNPUBLISH', 1);
      await perform(built, 'UNPUBLISH');
      const again = await perform(built, 'PUBLISH');

      expect(again.publication!.modules.map((m) => m.moduleId)).toEqual([
        m1.moduleId,
      ]);
      expect(again.modulesNotIncluded).toEqual([
        { moduleId: m2.moduleId, status: 'APPROVED', reason: 'WITHDRAWN' },
      ]);
      expect(
        await facade.findActiveSnapshotInfo(m1.lessonIds[0], 'BEGINNER'),
      ).not.toBeNull();
      expect(
        await facade.findActiveSnapshotInfo(m2.lessonIds[0], 'BEGINNER'),
      ).toBeNull();
      // history is intact: the first version still lists both modules, the module keeps its events
      const [v1] = await pubRows(built.courseId);
      expect(await memberRows(v1.id)).toHaveLength(2);
      const actions = (await eventRows(built.courseId))
        .filter(
          (e: { module_id: string | null }) => e.module_id === m2.moduleId,
        )
        .map((e: { action: string }) => e.action);
      expect(actions).toEqual(['PUBLISH', 'UNPUBLISH']);
      // the explicit module publish brings it back
      await perform(built, 'PUBLISH', 1);
      expect(
        await facade.findActiveSnapshotInfo(m2.lessonIds[0], 'BEGINNER'),
      ).not.toBeNull();
    });

    it('keeps the published order through unrelated catalog versions and applies a changed order only once approved', async () => {
      const built = await publishedCourseOf('r-order', [
        { lessons: [{}, {}] },
        { lessons: [{}] },
        { lessons: [{}] },
      ]);
      const [m1, m2, m3] = built.modules;
      expect(await orderOf(built.courseId)).toEqual([
        [m1.moduleId, m1.lessonIds],
        [m2.moduleId, m2.lessonIds],
        [m3.moduleId, m3.lessonIds],
      ]);

      // authoring-only reorder of the modules (1<->2) and of the lessons of module 1
      await dataSource.query(
        `UPDATE "course_modules" SET "position" = "position" + 10 WHERE "course_id" = $1`,
        [built.courseId],
      );
      await dataSource.query(
        `UPDATE "course_modules" SET "position" = 1 WHERE "id" = $1`,
        [m2.moduleId],
      );
      await dataSource.query(
        `UPDATE "course_modules" SET "position" = 2 WHERE "id" = $1`,
        [m1.moduleId],
      );
      await dataSource.query(
        `UPDATE "course_modules" SET "position" = 3 WHERE "id" = $1`,
        [m3.moduleId],
      );
      await dataSource.query(
        `UPDATE "lessons" SET "position" = "position" + 10 WHERE "module_id" = $1`,
        [m1.moduleId],
      );
      await dataSource.query(
        `UPDATE "lessons" SET "position" = 1 WHERE "id" = $1`,
        [m1.lessonIds[1]],
      );
      await dataSource.query(
        `UPDATE "lessons" SET "position" = 2 WHERE "id" = $1`,
        [m1.lessonIds[0]],
      );

      // an unrelated module is unpublished and published again: the published order does not move
      await perform(built, 'UNPUBLISH', 2);
      await perform(built, 'PUBLISH', 2);
      expect(await orderOf(built.courseId)).toEqual([
        [m1.moduleId, m1.lessonIds],
        [m2.moduleId, m2.lessonIds],
        [m3.moduleId, m3.lessonIds],
      ]);
      // navigation follows the published order, across the module boundary
      const nav = (await facade.findLessonNavigation(
        m1.lessonIds[1],
        'BEGINNER',
      ))!;
      expect(nav.next?.lessonId).toBe(m2.lessonIds[0]);
      expect(nav.previous?.lessonId).toBe(m1.lessonIds[0]);

      // the reorder is an edit: the course and module 1 go through review again, then the course is published
      await dataSource.query(
        `UPDATE "courses" SET "status" = 'DRAFT' WHERE "id" = $1`,
        [built.courseId],
      );
      await dataSource.query(
        `UPDATE "course_modules" SET "status" = 'DRAFT' WHERE "id" = $1`,
        [m1.moduleId],
      );
      await perform(built, 'SUBMIT_FOR_REVIEW', 0, admins.editor);
      await perform(built, 'APPROVE', 0, admins.reviewer);
      await perform(built, 'SUBMIT_FOR_REVIEW', undefined, admins.editor);
      await perform(built, 'APPROVE', undefined, admins.reviewer);
      const before = (await pubRows(built.courseId)).length;
      await perform(built, 'PUBLISH');

      expect(await orderOf(built.courseId)).toEqual([
        [m2.moduleId, m2.lessonIds],
        [m1.moduleId, [m1.lessonIds[1], m1.lessonIds[0]]],
        [m3.moduleId, m3.lessonIds],
      ]);
      // the version that existed before is unchanged
      expect(await orderOf(built.courseId, before)).toEqual([
        [m1.moduleId, m1.lessonIds],
        [m2.moduleId, m2.lessonIds],
        [m3.moduleId, m3.lessonIds],
      ]);
      const after = (await facade.findLessonNavigation(
        m1.lessonIds[1],
        'BEGINNER',
      ))!;
      expect(after.previous?.lessonId).toBe(m2.lessonIds[0]);
      expect(after.next?.lessonId).toBe(m1.lessonIds[0]);
    });
  });

  describe('concurrency', () => {
    it('simultaneous course publishes are serialized: each creates its own version and exactly one stays active', async () => {
      const built = await buildCourse('x-race-publish', [{ lessons: [{}] }]);
      await publishAllLessons(built);
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => perform(built, 'PUBLISH')),
      );
      // the first is the publish, the others are refreshes of the then-published course
      const won = results.filter((r) => r.status === 'fulfilled').length;
      expect(won).toBeGreaterThanOrEqual(1);
      // a publish that waited longer than the lock timeout on this remote database is refused cleanly
      for (const failed of results.filter((r) => r.status === 'rejected')) {
        expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
      }
      const rows = await pubRows(built.courseId);
      expect(rows.map((p: { version: number }) => p.version)).toEqual(
        Array.from({ length: won }, (_, i) => i + 1),
      );
      expect(
        rows.filter((p: { ended_at: Date | null }) => p.ended_at === null),
      ).toHaveLength(1);
      const published = (await eventRows(built.courseId)).filter(
        (e: { action: string; module_id: string | null }) =>
          e.action === 'PUBLISH' && e.module_id === null,
      );
      expect(published).toHaveLength(won);
      expect(
        published.filter(
          (e: { from_status: string }) => e.from_status === 'APPROVED',
        ),
      ).toHaveLength(1);
    });

    it('simultaneous republishes after a withdrawal allocate distinct consecutive versions', async () => {
      const built = await buildCourse('x-race-version', [{ lessons: [{}] }]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      await perform(built, 'UNPUBLISH');
      await dataSource.query(
        `UPDATE "courses" SET "status" = 'APPROVED' WHERE "id" = $1`,
        [built.courseId],
      );
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => perform(built, 'PUBLISH')),
      );
      const won = results.filter((r) => r.status === 'fulfilled').length;
      expect(won).toBeGreaterThanOrEqual(1);
      for (const failed of results.filter((r) => r.status === 'rejected')) {
        expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
      }
      const rows = await pubRows(built.courseId);
      expect(rows.map((p: { version: number }) => p.version)).toEqual(
        Array.from({ length: won + 1 }, (_, i) => i + 1),
      );
      expect(
        rows.filter((p: { ended_at: Date | null }) => p.ended_at === null),
      ).toHaveLength(1);
    });

    it('module publish racing module unpublish and a course unpublish never leaves two active versions or a PUBLISHED course without one', async () => {
      const built = await buildCourse('x-race-mixed', [
        { lessons: [{}] },
        { lessons: [{}] },
      ]);
      await publishAllLessons(built);
      await perform(built, 'PUBLISH');
      for (let round = 0; round < 3; round += 1) {
        await Promise.allSettled([
          perform(built, 'UNPUBLISH', 0),
          perform(built, 'PUBLISH', 0),
          perform(built, 'UNPUBLISH', 1),
          perform(built, 'UNPUBLISH'),
          perform(built, 'PUBLISH', 1),
        ]);
        const rows = await pubRows(built.courseId);
        const active = rows.filter(
          (p: { ended_at: Date | null }) => p.ended_at === null,
        );
        expect(active.length).toBeLessThanOrEqual(1);
        expect(
          new Set(rows.map((p: { version: number }) => p.version)).size,
        ).toBe(rows.length);
        if ((await courseRow(built.courseId)).status === 'PUBLISHED')
          expect(active).toHaveLength(1);
        // bring the course back for the next round
        await dataSource.query(
          `UPDATE "courses" SET "status" = 'APPROVED' WHERE "id" = $1 AND "status" <> 'PUBLISHED'`,
          [built.courseId],
        );
        for (const m of built.modules) {
          await dataSource.query(
            `UPDATE "course_modules" SET "status" = 'APPROVED' WHERE "id" = $1 AND "status" <> 'PUBLISHED'`,
            [m.moduleId],
          );
        }
        if (!active.length)
          await perform(built, 'PUBLISH').catch(() => undefined);
      }
    });

    it('a course publish waits for a module being edited and then leaves the edited module out', async () => {
      const built = await buildCourse('x-race-edit', [
        { lessons: [{}] },
        { lessons: [{}] },
      ]);
      await publishAllLessons(built);
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      try {
        await holder.query(
          `SELECT "id" FROM "course_modules" WHERE "id" = $1 FOR UPDATE`,
          [built.modules[1].moduleId],
        );
        const publishing = perform(built, 'PUBLISH').then(
          (r) => r,
          (e: unknown) => e,
        );
        await waitUntilSomeoneWaitsForALock(dataSource);
        // the edit commits first: it resets the module to DRAFT (as every module edit does)
        await holder.query(
          `UPDATE "course_modules" SET "status" = 'DRAFT', "title" = 'edited' WHERE "id" = $1`,
          [built.modules[1].moduleId],
        );
        await holder.commitTransaction();
        const outcome = (await publishing) as Awaited<
          ReturnType<typeof perform>
        >;
        expect(outcome.modulesNotIncluded).toEqual([
          {
            moduleId: built.modules[1].moduleId,
            status: 'DRAFT',
            reason: 'NOT_APPROVED',
          },
        ]);
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
      }
      const [publication] = await pubRows(built.courseId);
      expect(
        (await memberRows(publication.id)).map(
          (r: { module_id: string }) => r.module_id,
        ),
      ).toEqual([built.modules[0].moduleId]);
      expect((await moduleRow(built.modules[1].moduleId)).status).toBe('DRAFT'); // never published behind the edit's back
    });
  });
});

/** Polls until some backend is blocked on a lock (the publish waiting for the module row). */
async function waitUntilSomeoneWaitsForALock(dataSource: DataSource) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await dataSource.query(
      `SELECT count(*)::int AS "waiting" FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
