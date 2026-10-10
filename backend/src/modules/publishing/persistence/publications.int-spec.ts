import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { deleteWorkflowHistory } from '../../../../test/support/workflow-cleanup.js';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import {
  BusinessRuleError,
  ConflictError,
  type ContentStatus,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import { PublicationService } from '../application/publication.service.js';
import { WorkflowService } from '../application/workflow.service.js';
import { canonicalJson } from '../domain/snapshot-payload.js';
import { PublishingModule } from '../publishing.module.js';
import { PublicationRepository } from './publication.repository.js';
import { WorkflowEventRepository } from './workflow-event.repository.js';

// Integration: the real publishing services, repositories, triggers and constraints against the
// development database (DATABASE_URL). Everything created here carries a per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;
const emailOf = (name: string) => `pubint-${runId}-${name}@int-test.invalid`;
const HASH = 'a'.repeat(64);
const ALL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

describe('publications (integration)', () => {
  let dataSource: DataSource;
  let workflow: WorkflowService;
  let publications: PublicationService;
  let publicationRepo: PublicationRepository;
  let eventRepo: WorkflowEventRepository;
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
      `pubint-${runId}-%@int-test.invalid`,
    ]);
  };

  const newAdmin = async (
    name: string,
    role: Role,
  ): Promise<AuthenticatedAdmin> => {
    const [row] = await dataSource.query(
      `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'not-a-real-hash',$2) RETURNING "id"`,
      [emailOf(name), role],
    );
    return (admins[name] = { id: row.id, email: emailOf(name), role });
  };

  /**
   * A lesson that can actually be published: levels, and one RICH_TEXT block per lesson
   * (shared content) visible at every level.
   */
  const newLesson = async (
    name: string,
    status: ContentStatus = 'APPROVED',
    levels: string[] = ALL_LEVELS,
  ) => {
    const [course] = await dataSource.query(
      `INSERT INTO "courses" ("title") VALUES ($1) RETURNING "id"`,
      [title(name)],
    );
    const [module] = await dataSource.query(
      `INSERT INTO "course_modules" ("course_id","title","position") VALUES ($1,$2,1) RETURNING "id"`,
      [course.id, title(`${name}-module`)],
    );
    const [lesson] = await dataSource.query(
      `INSERT INTO "lessons" ("module_id","title","position","status") VALUES ($1,$2,1,$3) RETURNING "id"`,
      [module.id, title(`${name}-lesson`), status],
    );
    for (const level of levels) {
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,$2)`,
        [lesson.id, level],
      );
    }
    const [block] = await dataSource.query(
      `INSERT INTO "lesson_blocks" ("lesson_id","type","position","shared_content")
       VALUES ($1,'RICH_TEXT',1,$2::jsonb) RETURNING "id"`,
      [lesson.id, JSON.stringify(richText(`shared text of ${name}`))],
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
  const simulateEdit = (lessonId: string, manager = dataSource.manager) =>
    manager.query(
      `UPDATE "lessons" SET "status"='DRAFT', "content_revision"="content_revision"+1, "updated_at"=now() WHERE "id"=$1`,
      [lessonId],
    );

  const lessonRow = async (id: string) =>
    (
      await dataSource.query(
        `SELECT "status", "version", "content_revision" AS rev FROM "lessons" WHERE "id" = $1`,
        [id],
      )
    )[0] as { status: string; version: number; rev: number };

  const pubRows = (lessonId: string) =>
    dataSource.query(
      `SELECT * FROM "lesson_publications" WHERE "lesson_id" = $1 ORDER BY "version"`,
      [lessonId],
    );
  const levelRows = (lessonId: string) =>
    dataSource.query(
      `SELECT * FROM "lesson_publication_levels" WHERE "lesson_id" = $1 ORDER BY "publication_id", "level"`,
      [lessonId],
    );
  const eventRows = (lessonId: string) =>
    dataSource.query(
      `SELECT * FROM "lesson_workflow_events" WHERE "lesson_id" = $1 ORDER BY "seq"`,
      [lessonId],
    );

  /** Raw rows, to probe the tables' own constraints. */
  const insertPublication = async (
    lessonId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    const values: Record<string, unknown> = {
      lesson_id: lessonId,
      version: 1,
      module_id: randomUUID(),
      source_content_revision: 1,
      snapshot_schema_version: 1,
      published_by: admins.admin.id,
      ...overrides,
    };
    const columns = Object.keys(values);
    const [row] = await dataSource.query(
      `INSERT INTO "lesson_publications" (${columns.map((c) => `"${c}"`).join(',')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING "id"`,
      Object.values(values),
    );
    return row.id;
  };

  const insertLevel = (
    publicationId: string,
    lessonId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const values: Record<string, unknown> = {
      publication_id: publicationId,
      lesson_id: lessonId,
      level: 'BEGINNER',
      content: '{"a":1}',
      content_hash: HASH,
      content_bytes: 7,
      ...overrides,
    };
    const columns = Object.keys(values);
    return dataSource.query(
      `INSERT INTO "lesson_publication_levels" (${columns.map((c) => `"${c}"`).join(',')})
       VALUES (${columns.map((c, i) => (c === 'content' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(',')})`,
      Object.values(values),
    );
  };

  const insertEvent = (
    lessonId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const values: Record<string, unknown> = {
      lesson_id: lessonId,
      action: 'SUBMIT_FOR_REVIEW',
      from_status: 'DRAFT',
      to_status: 'READY_FOR_REVIEW',
      actor_admin_id: admins.admin.id,
      actor_role: 'ADMIN',
      content_revision: 1,
      ...overrides,
    };
    const columns = Object.keys(values);
    return dataSource.query(
      `INSERT INTO "lesson_workflow_events" (${columns.map((c) => `"${c}"`).join(',')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`,
      Object.values(values),
    );
  };

  const endPublication = (id: string, by = admins.admin.id) =>
    dataSource.query(
      `UPDATE "lesson_publications" SET "ended_at"=clock_timestamp(), "ended_by"=$2, "ended_reason"='UNPUBLISHED' WHERE "id"=$1`,
      [id, by],
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, PublishingModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    workflow = moduleRef.get(WorkflowService, { strict: false });
    publications = moduleRef.get(PublicationService, { strict: false });
    publicationRepo = moduleRef.get(PublicationRepository, { strict: false });
    eventRepo = moduleRef.get(WorkflowEventRepository, { strict: false });
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

  describe('lesson_publications integrity', () => {
    it('allows only one active publication per lesson, but any number of ended ones', async () => {
      const lessonId = await newLesson('one-active');
      const first = await insertPublication(lessonId, { version: 1 });
      await expect(
        insertPublication(lessonId, { version: 2 }),
      ).rejects.toMatchObject({ code: '23505' });

      await endPublication(first);
      const second = await insertPublication(lessonId, { version: 2 });
      await endPublication(second);
      await expect(
        insertPublication(lessonId, { version: 3 }),
      ).resolves.toBeDefined();
    });

    it('keeps versions unique per lesson, and independent between lessons', async () => {
      const a = await newLesson('version-a');
      const b = await newLesson('version-b');
      const first = await insertPublication(a, { version: 1 });
      await endPublication(first);
      await expect(insertPublication(a, { version: 1 })).rejects.toMatchObject({
        code: '23505',
      });
      await expect(insertPublication(b, { version: 1 })).resolves.toBeDefined();
    });

    it('validates version, revisions, schema version and end fields', async () => {
      const lessonId = await newLesson('checks');
      for (const overrides of [
        { version: 0 },
        { source_content_revision: 0 },
        { snapshot_schema_version: 0 },
        { ended_at: new Date(), ended_by: admins.admin.id }, // no reason
        { ended_at: new Date(), ended_reason: 'UNPUBLISHED' }, // no actor
        { ended_reason: 'UNPUBLISHED' }, // reason without end
        {
          ended_at: new Date(),
          ended_by: admins.admin.id,
          ended_reason: 'DELETED', // not a valid reason
        },
        {
          published_at: new Date('2030-01-02'),
          ended_at: new Date('2030-01-01'), // ends before it starts
          ended_by: admins.admin.id,
          ended_reason: 'UNPUBLISHED',
        },
      ]) {
        await expect(
          insertPublication(lessonId, overrides),
          JSON.stringify(overrides),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('requires an existing lesson and existing admins (foreign keys)', async () => {
      const lessonId = await newLesson('fks');
      await expect(insertPublication(randomUUID())).rejects.toMatchObject({
        code: '23503',
      });
      await expect(
        insertPublication(lessonId, { published_by: randomUUID() }),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertPublication(lessonId, {
          ended_at: new Date(),
          ended_by: randomUUID(),
          ended_reason: 'UNPUBLISHED',
        }),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('lets a publication be ended once, and never changed again', async () => {
      const lessonId = await newLesson('end-once');
      const id = await insertPublication(lessonId);

      await endPublication(id);
      const [ended] = await pubRows(lessonId);
      expect(ended.ended_reason).toBe('UNPUBLISHED');
      expect(ended.ended_at).toBeInstanceOf(Date);

      for (const set of [
        `"ended_at" = clock_timestamp()`, // ended twice
        `"ended_reason" = 'SUPERSEDED'`, // end reason rewritten
        `"ended_at" = NULL, "ended_by" = NULL, "ended_reason" = NULL`, // reactivated
        `"version" = 9`,
      ]) {
        await expect(
          dataSource.query(
            `UPDATE "lesson_publications" SET ${set} WHERE "id" = $1`,
            [id],
          ),
          set,
        ).rejects.toMatchObject({ code: '23000' });
      }
      expect((await pubRows(lessonId))[0]).toEqual(ended);
    });

    it('does not let an active publication change in any way except being ended', async () => {
      const lessonId = await newLesson('active-immutable');
      const id = await insertPublication(lessonId);
      for (const set of [
        `"version" = 2`,
        `"source_content_revision" = 2`,
        `"snapshot_schema_version" = 2`,
        `"published_by" = '${admins.editor.id}'`,
        `"module_id" = '${randomUUID()}'`,
        `"published_at" = now()`,
      ]) {
        await expect(
          dataSource.query(
            `UPDATE "lesson_publications" SET ${set} WHERE "id" = $1`,
            [id],
          ),
          set,
        ).rejects.toMatchObject({ code: '23000' });
      }
    });

    it('rejects DELETE and TRUNCATE', async () => {
      const lessonId = await newLesson('no-delete');
      const id = await insertPublication(lessonId);
      await expect(
        dataSource.query(`DELETE FROM "lesson_publications" WHERE "id" = $1`, [
          id,
        ]),
      ).rejects.toMatchObject({ code: '23000' });

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        // PostgreSQL may refuse first because the table is referenced by foreign keys; either way it cannot happen
        await expect(
          runner.query(`TRUNCATE "lesson_publications"`),
        ).rejects.toBeDefined();
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      expect(await pubRows(lessonId)).toHaveLength(1);
    });

    it('keeps lessons and admins with publication history from being deleted', async () => {
      const lessonId = await newLesson('restrict');
      const temp = await newAdmin('temp-publisher', Role.ADMIN);
      await insertPublication(lessonId, { published_by: temp.id });
      await expect(
        dataSource.query(`DELETE FROM "lessons" WHERE "id" = $1`, [lessonId]),
      ).rejects.toMatchObject({ code: '23001' });
      await expect(
        dataSource.query(`DELETE FROM "admins" WHERE "id" = $1`, [temp.id]),
      ).rejects.toMatchObject({ code: '23001' });
    });
  });

  describe('lesson_publication_levels integrity', () => {
    it('only attaches to a publication of the same lesson (composite foreign key)', async () => {
      const a = await newLesson('level-fk-a');
      const b = await newLesson('level-fk-b');
      const publicationOfA = await insertPublication(a);
      await expect(insertLevel(publicationOfA, a)).resolves.toBeDefined();
      await expect(
        insertLevel(publicationOfA, b, { level: 'ADVANCED' }),
      ).rejects.toMatchObject({
        code: '23503',
      });
      await expect(insertLevel(randomUUID(), a)).rejects.toMatchObject({
        code: '23503',
      });
    });

    it('stores one snapshot per level of a publication', async () => {
      const lessonId = await newLesson('level-pk');
      const id = await insertPublication(lessonId);
      await insertLevel(id, lessonId, { level: 'INTERMEDIATE' });
      await expect(
        insertLevel(id, lessonId, { level: 'INTERMEDIATE' }),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('validates level, content, hash and size', async () => {
      const lessonId = await newLesson('level-checks');
      const id = await insertPublication(lessonId);
      for (const overrides of [
        { level: 'EXPERT' },
        { level: 'beginner' },
        { content: '[1,2]' },
        { content: '"text"' },
        { content: 'null' },
        { content_hash: 'A'.repeat(64) },
        { content_hash: 'a'.repeat(63) },
        { content_hash: 'g'.repeat(64) },
        { content_bytes: 0 },
        { content_bytes: 5242881 },
      ]) {
        await expect(
          insertLevel(id, lessonId, overrides),
          JSON.stringify(overrides),
        ).rejects.toThrow();
      }
      await expect(
        insertLevel(id, lessonId, { content_bytes: 5242880 }),
      ).resolves.toBeDefined();
    });

    it('makes snapshots immutable: no UPDATE, no DELETE, no TRUNCATE', async () => {
      const lessonId = await newLesson('level-immutable');
      const id = await insertPublication(lessonId);
      await insertLevel(id, lessonId, { content: '{"keep":"me"}' });

      for (const statement of [
        `UPDATE "lesson_publication_levels" SET "content" = '{"x":1}'::jsonb WHERE "publication_id" = $1`,
        `UPDATE "lesson_publication_levels" SET "content_hash" = '${'b'.repeat(64)}' WHERE "publication_id" = $1`,
        `UPDATE "lesson_publication_levels" SET "level" = 'ADVANCED' WHERE "publication_id" = $1`,
        `DELETE FROM "lesson_publication_levels" WHERE "publication_id" = $1`,
      ]) {
        await expect(
          dataSource.query(statement, [id]),
          statement,
        ).rejects.toMatchObject({
          code: '23000',
        });
      }
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await expect(
          runner.query(`TRUNCATE "lesson_publication_levels"`),
        ).rejects.toMatchObject({ code: '23000' });
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      const rows = await levelRows(lessonId);
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toEqual({ keep: 'me' });
    });

    it('does not accept snapshots for a publication that has already ended', async () => {
      const lessonId = await newLesson('level-after-end');
      const id = await insertPublication(lessonId);
      await insertLevel(id, lessonId, { level: 'BEGINNER' });
      await endPublication(id);
      await expect(
        insertLevel(id, lessonId, { level: 'ADVANCED' }),
      ).rejects.toMatchObject({ code: '23000' });
      expect(await levelRows(lessonId)).toHaveLength(1);
    });
  });

  describe('workflow events link to publications', () => {
    it('records PUBLISH and UNPUBLISH only with a publication of the same lesson', async () => {
      const lessonId = await newLesson('event-link');
      const other = await newLesson('event-link-other');
      const publicationId = await insertPublication(lessonId);
      const foreign = await insertPublication(other);

      const publish = {
        action: 'PUBLISH',
        from_status: 'APPROVED',
        to_status: 'PUBLISHED',
      };
      await expect(insertEvent(lessonId, publish)).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        insertEvent(lessonId, { ...publish, publication_id: foreign }),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        insertEvent(lessonId, { ...publish, publication_id: publicationId }),
      ).resolves.toBeDefined();

      // unpublish keeps the status, except that PUBLISHED becomes APPROVED
      const unpublishes = [
        { from_status: 'PUBLISHED', to_status: 'APPROVED' },
        { from_status: 'DRAFT', to_status: 'DRAFT' },
        { from_status: 'READY_FOR_REVIEW', to_status: 'READY_FOR_REVIEW' },
        { from_status: 'APPROVED', to_status: 'APPROVED' },
      ];
      for (const shape of unpublishes) {
        await expect(
          insertEvent(lessonId, {
            action: 'UNPUBLISH',
            ...shape,
            publication_id: publicationId,
          }),
        ).resolves.toBeDefined();
      }
      const impossible = [
        { from_status: 'PUBLISHED', to_status: 'PUBLISHED' },
        { from_status: 'PUBLISHED', to_status: 'DRAFT' },
        { from_status: 'DRAFT', to_status: 'APPROVED' },
        { from_status: 'APPROVED', to_status: 'DRAFT' },
        { from_status: 'READY_FOR_REVIEW', to_status: 'APPROVED' },
        { from_status: 'DRAFT', to_status: 'PUBLISHED' },
      ];
      for (const shape of impossible) {
        await expect(
          insertEvent(lessonId, {
            action: 'UNPUBLISH',
            ...shape,
            publication_id: publicationId,
          }),
          JSON.stringify(shape),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('does not let review actions carry a publication', async () => {
      const lessonId = await newLesson('event-review');
      const publicationId = await insertPublication(lessonId);
      await expect(
        insertEvent(lessonId, { publication_id: publicationId }),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('keeps a publication with events from being deleted', async () => {
      const lessonId = await newLesson('event-restrict');
      const publicationId = await insertPublication(lessonId);
      await insertEvent(lessonId, {
        action: 'PUBLISH',
        from_status: 'APPROVED',
        to_status: 'PUBLISHED',
        publication_id: publicationId,
      });
      await expect(
        dataSource.query(`DELETE FROM "lesson_publications" WHERE "id" = $1`, [
          publicationId,
        ]),
      ).rejects.toMatchObject({ code: '23000' });
    });
  });

  describe('publishing and unpublishing with the real services', () => {
    it('publishes: status, publication, per-level snapshots and event commit together', async () => {
      const lessonId = await newLesson('publish');
      const before = await lessonRow(lessonId);

      const result = await workflow.perform('PUBLISH', lessonId, admins.admin, {
        note: 'go live',
      });

      expect(result).toMatchObject({
        fromStatus: 'APPROVED',
        status: 'PUBLISHED',
      });
      const [publication] = await pubRows(lessonId);
      expect(publication).toMatchObject({
        version: 1,
        source_content_revision: before.rev,
        snapshot_schema_version: 1,
        published_by: admins.admin.id,
        ended_at: null,
        ended_by: null,
        ended_reason: null,
      });
      expect(publication.published_at).toBeInstanceOf(Date);

      const levels = await levelRows(lessonId);
      expect(levels.map((l: { level: string }) => l.level).sort()).toEqual(
        [...ALL_LEVELS].sort(),
      );
      for (const row of levels) {
        expect(row.content).toMatchObject({
          schemaVersion: 1,
          level: row.level,
          lesson: { id: lessonId },
          blocks: [
            {
              type: 'RICH_TEXT',
              ordinal: 1,
              source: 'SHARED',
              content: richText('shared text of publish'),
            },
          ],
        });
      }

      const [event] = await eventRows(lessonId);
      expect(event).toMatchObject({
        action: 'PUBLISH',
        from_status: 'APPROVED',
        to_status: 'PUBLISHED',
        publication_id: publication.id,
        actor_admin_id: admins.admin.id,
        actor_role: 'ADMIN',
        note: 'go live',
        content_revision: before.rev,
      });

      const after = await lessonRow(lessonId);
      expect(after.status).toBe('PUBLISHED');
      expect(after.version).toBe(before.version);
      expect(after.rev).toBe(before.rev);
    });

    it('stores a hash and size that match the stored content exactly', async () => {
      const lessonId = await newLesson('hash');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const rows = await levelRows(lessonId);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        // the database stores jsonb (key order and whitespace are normalized), so recompute from the canonical form
        const canonical = canonicalJson(row.content);
        expect(row.content_hash).toBe(
          createHash('sha256').update(canonical, 'utf8').digest('hex'),
        );
        expect(row.content_bytes).toBe(Buffer.byteLength(canonical, 'utf8'));
      }
    });

    it('readable history: list, version, and level snapshot, with the same hash as stored', async () => {
      const lessonId = await newLesson('history');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await workflow.perform('UNPUBLISH', lessonId, admins.admin);
      await workflow.perform('PUBLISH', lessonId, admins.admin);

      const list = await publications.list(lessonId, 10, 0);
      expect(list.total).toBe(2);
      expect(list.items.map((p) => p.version)).toEqual([2, 1]);
      expect(list.items[0].endedAt).toBeNull();
      expect(list.items[1]).toMatchObject({ endedReason: 'UNPUBLISHED' });
      expect(list.items[0].levels.map((l) => l.level)).toEqual(ALL_LEVELS);

      const one = await publications.get(lessonId, 1);
      expect(one.id).toBe(list.items[1].id);
      const snapshot = await publications.getSnapshot(lessonId, 1, 'ADVANCED');
      expect(snapshot).toMatchObject({ version: 1, level: 'ADVANCED' });
      expect(snapshot.contentHash).toBe(
        one.levels.find((l) => l.level === 'ADVANCED')!.contentHash,
      );
      await expect(publications.get(lessonId, 7)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(
        publications.getSnapshot(lessonId, 3, 'BEGINNER'),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        publications.list(randomUUID(), 10, 0),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('unpublishes: PUBLISHED becomes APPROVED, the publication ends once, snapshots stay', async () => {
      const lessonId = await newLesson('unpublish');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const snapshotsBefore = await levelRows(lessonId);

      await workflow.perform('UNPUBLISH', lessonId, admins.admin, {
        note: 'why',
      });

      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
      const [publication] = await pubRows(lessonId);
      expect(publication).toMatchObject({
        ended_by: admins.admin.id,
        ended_reason: 'UNPUBLISHED',
      });
      expect(await levelRows(lessonId)).toEqual(snapshotsBefore);
      const events = await eventRows(lessonId);
      expect(events.map((e: { action: string }) => e.action)).toEqual([
        'PUBLISH',
        'UNPUBLISH',
      ]);
      expect(events[1].publication_id).toBe(publication.id);

      await expect(
        workflow.perform('UNPUBLISH', lessonId, admins.admin),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await eventRows(lessonId)).toHaveLength(2);
    });

    // While a publication is active the working copy can be in any status. Unpublishing ends the
    // publication in every case; only PUBLISHED moves (to APPROVED).
    const WORKING_COPY = [
      ['PUBLISHED', 'APPROVED'],
      ['DRAFT', 'DRAFT'],
      ['READY_FOR_REVIEW', 'READY_FOR_REVIEW'],
      ['APPROVED', 'APPROVED'],
    ] as const;

    /** Publishes a lesson, then brings its working copy to `status` through real edits and reviews. */
    const publishedWith = async (name: string, status: ContentStatus) => {
      const lessonId = await newLesson(name);
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      if (status !== 'PUBLISHED') {
        await simulateEdit(lessonId);
        if (status !== 'DRAFT') {
          await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
        }
        if (status === 'APPROVED') {
          await workflow.perform('APPROVE', lessonId, admins.reviewer);
        }
      }
      expect((await lessonRow(lessonId)).status).toBe(status);
      return lessonId;
    };

    /** Everything about a lesson that unpublishing must not touch, as stored. */
    const authoringState = async (lessonId: string) => ({
      lesson: (
        await dataSource.query(`SELECT * FROM "lessons" WHERE "id" = $1`, [
          lessonId,
        ])
      )[0],
      levels: await dataSource.query(
        `SELECT * FROM "lesson_levels" WHERE "lesson_id" = $1 ORDER BY "level"`,
        [lessonId],
      ),
      blocks: await dataSource.query(
        `SELECT * FROM "lesson_blocks" WHERE "lesson_id" = $1 ORDER BY "position"`,
        [lessonId],
      ),
      blockLevels: await dataSource.query(
        `SELECT * FROM "lesson_block_levels" WHERE "lesson_id" = $1 ORDER BY "block_id", "level"`,
        [lessonId],
      ),
    });

    it.each(WORKING_COPY)(
      'a %s working copy: unpublish ends the publication and leaves the working copy %s, untouched',
      async (status, expected) => {
        const lessonId = await publishedWith(`unpublish-${status}`, status);
        const authoringBefore = await authoringState(lessonId);
        const snapshotsBefore = await levelRows(lessonId);
        const [publicationBefore] = await pubRows(lessonId);
        const eventsBefore = (await eventRows(lessonId)).length;

        const result = await workflow.perform(
          'UNPUBLISH',
          lessonId,
          admins.admin,
          { note: 'withdrawn' },
        );

        expect(result).toMatchObject({ fromStatus: status, status: expected });
        // the working copy: byte-for-byte the same, apart from PUBLISHED -> APPROVED
        const authoringAfter = await authoringState(lessonId);
        if (status === 'PUBLISHED') {
          expect(authoringAfter.lesson.status).toBe('APPROVED');
          expect({
            ...authoringAfter.lesson,
            status: 'PUBLISHED',
            updated_at: null,
          }).toEqual({
            ...authoringBefore.lesson,
            updated_at: null,
          });
        } else {
          expect(authoringAfter.lesson).toEqual(authoringBefore.lesson); // not even updated_at
        }
        expect(authoringAfter.lesson.version).toBe(
          authoringBefore.lesson.version,
        );
        expect(authoringAfter.lesson.content_revision).toBe(
          authoringBefore.lesson.content_revision,
        );
        expect(authoringAfter.levels).toEqual(authoringBefore.levels);
        expect(authoringAfter.blocks).toEqual(authoringBefore.blocks);
        expect(authoringAfter.blockLevels).toEqual(authoringBefore.blockLevels);
        // the publication ended, once, and nothing else about it changed
        const rows = await pubRows(lessonId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          ended_by: admins.admin.id,
          ended_reason: 'UNPUBLISHED',
        });
        expect(rows[0].ended_at).toBeInstanceOf(Date);
        expect({
          ...rows[0],
          ended_at: null,
          ended_by: null,
          ended_reason: null,
        }).toEqual({
          ...publicationBefore,
          ended_at: null,
          ended_by: null,
          ended_reason: null,
        });
        // snapshot history is immutable
        expect(await levelRows(lessonId)).toEqual(snapshotsBefore);
        // exactly one new event, linked to the publication
        const events = await eventRows(lessonId);
        expect(events).toHaveLength(eventsBefore + 1);
        expect(events.at(-1)).toMatchObject({
          action: 'UNPUBLISH',
          from_status: status,
          to_status: expected,
          publication_id: publicationBefore.id,
          actor_admin_id: admins.admin.id,
          content_revision: authoringBefore.lesson.content_revision,
          note: 'withdrawn',
        });
        // a second unpublish has nothing to end
        const again = await workflow
          .perform('UNPUBLISH', lessonId, admins.admin)
          .catch((e: unknown) => e);
        expect(again).toBeInstanceOf(ConflictError);
        expect((again as ConflictError).message).toMatch(
          /no active publication/,
        );
        expect(await eventRows(lessonId)).toHaveLength(eventsBefore + 1);
        expect(await authoringState(lessonId)).toEqual(authoringAfter);
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy: simultaneous unpublishes end the publication exactly once',
      async (status, expected) => {
        const lessonId = await publishedWith(
          `unpublish-race-${status}`,
          status,
        );
        const authoringBefore = await authoringState(lessonId);
        const snapshotsBefore = await levelRows(lessonId);

        const results = await Promise.allSettled(
          Array.from({ length: 5 }, () =>
            workflow.perform('UNPUBLISH', lessonId, admins.admin),
          ),
        );

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        for (const failed of results.filter((r) => r.status === 'rejected')) {
          expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
            ConflictError,
          );
        }
        const rows = await pubRows(lessonId);
        expect(
          rows.filter((r: { ended_at: Date | null }) => r.ended_at),
        ).toHaveLength(1);
        expect(
          (await eventRows(lessonId)).filter(
            (e: { action: string }) => e.action === 'UNPUBLISH',
          ),
        ).toHaveLength(1);
        const after = await authoringState(lessonId);
        expect(after.lesson.status).toBe(expected);
        expect(after.lesson.version).toBe(authoringBefore.lesson.version);
        expect(after.lesson.content_revision).toBe(
          authoringBefore.lesson.content_revision,
        );
        expect(after.blocks).toEqual(authoringBefore.blocks);
        expect(await levelRows(lessonId)).toEqual(snapshotsBefore);
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy: a failing event insert rolls the unpublish back',
      async (status) => {
        const lessonId = await publishedWith(
          `unpublish-rollback-${status}`,
          status,
        );
        const authoringBefore = await authoringState(lessonId);
        const eventsBefore = (await eventRows(lessonId)).length;
        vi.spyOn(eventRepo, 'append').mockRejectedValueOnce(
          new Error('event storage failed'),
        );

        await expect(
          workflow.perform('UNPUBLISH', lessonId, admins.admin),
        ).rejects.toThrow('event storage failed');

        expect((await pubRows(lessonId))[0].ended_at).toBeNull();
        expect(await authoringState(lessonId)).toEqual(authoringBefore);
        expect(await eventRows(lessonId)).toHaveLength(eventsBefore);
      },
    );

    it('the published version still serves after an edit, until it is unpublished or replaced', async () => {
      const lessonId = await publishedWith('serves-until-unpublished', 'DRAFT');
      expect((await pubRows(lessonId))[0].ended_at).toBeNull();
      await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
      expect((await pubRows(lessonId))[0].ended_at).toBeNull();
    });

    it('republishing after an edit supersedes the old version and keeps it unchanged', async () => {
      const lessonId = await newLesson('supersede');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const v1Levels = await levelRows(lessonId);

      await simulateEdit(lessonId);
      await dataSource.query(
        `UPDATE "lesson_blocks" SET "shared_content" = $2::jsonb WHERE "lesson_id" = $1`,
        [lessonId, JSON.stringify(richText('second version text'))],
      );
      await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
      await workflow.perform('APPROVE', lessonId, admins.reviewer);
      const result = await workflow.perform('PUBLISH', lessonId, admins.admin);

      expect(result.supersededPublication).toMatchObject({ version: 1 });
      const rows = await pubRows(lessonId);
      expect(rows.map((r: { version: number }) => r.version)).toEqual([1, 2]);
      expect(rows[0]).toMatchObject({
        ended_reason: 'SUPERSEDED',
        ended_by: admins.admin.id,
      });
      expect(rows[1].ended_at).toBeNull();
      expect(rows[1].source_content_revision).toBe(
        rows[0].source_content_revision + 1,
      );

      const all = await levelRows(lessonId);
      expect(
        all.filter(
          (r: { publication_id: string }) => r.publication_id === rows[0].id,
        ),
      ).toEqual(v1Levels); // version 1 is exactly as it was
      const v2 = all.find(
        (r: { publication_id: string; level: string }) =>
          r.publication_id === rows[1].id && r.level === 'BEGINNER',
      );
      expect(JSON.stringify(v2.content)).toContain('second version text');
      expect(JSON.stringify(v1Levels[0].content)).not.toContain(
        'second version text',
      );
    });

    it('a published snapshot does not change when the lesson is edited afterwards', async () => {
      const lessonId = await newLesson('frozen');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const before = await levelRows(lessonId);

      await simulateEdit(lessonId);
      await dataSource.query(
        `UPDATE "lessons" SET "title" = $2 WHERE "id" = $1`,
        [lessonId, title('frozen-renamed')],
      );
      await dataSource.query(
        `DELETE FROM "lesson_block_levels" WHERE "lesson_id" = $1`,
        [lessonId],
      );
      await dataSource.query(
        `DELETE FROM "lesson_blocks" WHERE "lesson_id" = $1`,
        [lessonId],
      );

      expect(await levelRows(lessonId)).toEqual(before);
    });

    it('refuses a lesson that is not ready, with the report, and writes nothing', async () => {
      const lessonId = await newLesson('not-ready');
      await dataSource.query(
        `UPDATE "lesson_blocks" SET "shared_content" = NULL WHERE "lesson_id" = $1`,
        [lessonId],
      );

      const error = (await workflow
        .perform('PUBLISH', lessonId, admins.admin)
        .catch((e: unknown) => e)) as BusinessRuleError;

      expect(error).toBeInstanceOf(BusinessRuleError);
      const { report } = error.details as {
        report: { ready: boolean; issues: { code: string; level?: string }[] };
      };
      expect(report.ready).toBe(false);
      expect(report.issues.map((i) => i.code)).toContain('BLOCK_NO_CONTENT');
      expect(new Set(report.issues.map((i) => i.level))).toEqual(
        new Set(ALL_LEVELS),
      );
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
      expect(await pubRows(lessonId)).toEqual([]);
      expect(await eventRows(lessonId)).toEqual([]);
    });

    it('refuses publication of a lesson with no levels', async () => {
      const lessonId = await newLesson('no-levels', 'APPROVED', []);
      const error = (await workflow
        .perform('PUBLISH', lessonId, admins.admin)
        .catch((e: unknown) => e)) as BusinessRuleError;
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect(
        (
          error.details as { report: { issues: { code: string }[] } }
        ).report.issues.map((i) => i.code),
      ).toContain('LESSON_HAS_NO_LEVELS');
    });

    it('refuses an oversized level snapshot (over 5 MiB serialized) and publishes nothing', async () => {
      const lessonId = await newLesson('too-big', 'APPROVED', ['BEGINNER']);
      // a single block is capped at 200 KB, so exceed 5 MiB with many blocks
      await dataSource.query(
        `INSERT INTO "lesson_blocks" ("lesson_id","type","position","shared_content")
         SELECT $1, 'RICH_TEXT', g, $2::jsonb FROM generate_series(2, 32) g`,
        [lessonId, JSON.stringify(richText('x'.repeat(190_000)))],
      );
      await dataSource.query(
        `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level")
         SELECT b."id", b."lesson_id", 'BEGINNER' FROM "lesson_blocks" b
          WHERE b."lesson_id" = $1 AND b."position" > 1`,
        [lessonId],
      );
      const error = (await workflow
        .perform('PUBLISH', lessonId, admins.admin)
        .catch((e: unknown) => e)) as BusinessRuleError;
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect(
        (
          error.details as { report: { issues: { code: string }[] } }
        ).report.issues.map((i) => i.code),
      ).toContain('SNAPSHOT_TOO_LARGE');
      expect(await pubRows(lessonId)).toEqual([]);
    }, 120_000);
  });

  describe('atomicity against the real database', () => {
    it('a failing foreign key (unknown actor) leaves nothing behind', async () => {
      const lessonId = await newLesson('rollback-fk');
      const before = await lessonRow(lessonId);
      const ghost: AuthenticatedAdmin = {
        id: randomUUID(),
        email: 'ghost@int-test.invalid',
        role: Role.ADMIN,
      };
      await expect(
        workflow.perform('PUBLISH', lessonId, ghost),
      ).rejects.toMatchObject({
        driverError: { code: '23503' },
      });
      expect(await lessonRow(lessonId)).toEqual(before);
      expect(await pubRows(lessonId)).toEqual([]);
      expect(await levelRows(lessonId)).toEqual([]);
      expect(await eventRows(lessonId)).toEqual([]);
    });

    it('a failure while storing snapshots rolls back the publication row', async () => {
      const lessonId = await newLesson('rollback-levels');
      vi.spyOn(publicationRepo, 'insertLevels').mockRejectedValueOnce(
        new Error('snapshot storage failed'),
      );
      await expect(
        workflow.perform('PUBLISH', lessonId, admins.admin),
      ).rejects.toThrow('snapshot storage failed');
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
      expect(await pubRows(lessonId)).toEqual([]);
      expect(await eventRows(lessonId)).toEqual([]);

      await expect(
        workflow.perform('PUBLISH', lessonId, admins.admin),
      ).resolves.toBeDefined();
      expect((await pubRows(lessonId))[0].version).toBe(1); // the failed attempt did not consume a version
    });

    it('a failure while recording the event rolls back publication, snapshots and status', async () => {
      const lessonId = await newLesson('rollback-event');
      vi.spyOn(eventRepo, 'append').mockRejectedValueOnce(
        new Error('event storage failed'),
      );
      await expect(
        workflow.perform('PUBLISH', lessonId, admins.admin),
      ).rejects.toThrow('event storage failed');
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
      expect(await pubRows(lessonId)).toEqual([]);
      expect(await levelRows(lessonId)).toEqual([]);
    });

    it('a failed replacement keeps the previous version active', async () => {
      const lessonId = await newLesson('rollback-supersede');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await simulateEdit(lessonId);
      await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
      await workflow.perform('APPROVE', lessonId, admins.reviewer);

      vi.spyOn(publicationRepo, 'insertLevels').mockRejectedValueOnce(
        new Error('boom'),
      );
      await expect(
        workflow.perform('PUBLISH', lessonId, admins.admin),
      ).rejects.toThrow('boom');

      const rows = await pubRows(lessonId);
      expect(rows).toHaveLength(1);
      expect(rows[0].ended_at).toBeNull(); // the supersede was rolled back with everything else
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
    });

    it('a failure while recording the unpublish event leaves the publication active', async () => {
      const lessonId = await newLesson('rollback-unpublish');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      vi.spyOn(eventRepo, 'append').mockRejectedValueOnce(
        new Error('event storage failed'),
      );
      await expect(
        workflow.perform('UNPUBLISH', lessonId, admins.admin),
      ).rejects.toThrow('event storage failed');
      expect((await pubRows(lessonId))[0].ended_at).toBeNull();
      expect((await lessonRow(lessonId)).status).toBe('PUBLISHED');
      expect(await eventRows(lessonId)).toHaveLength(1);
    });
  });

  describe('concurrency', () => {
    it('simultaneous publishes: exactly one succeeds, one version, one active publication', async () => {
      const lessonId = await newLesson('race-publish');
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          workflow.perform('PUBLISH', lessonId, admins.admin),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const failed of results.filter((r) => r.status === 'rejected')) {
        expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
      }
      const rows = await pubRows(lessonId);
      expect(rows.map((r: { version: number }) => r.version)).toEqual([1]);
      expect(await levelRows(lessonId)).toHaveLength(3);
      expect(await eventRows(lessonId)).toHaveLength(1);
    });

    it('simultaneous republishes after an unpublish allocate exactly one new version', async () => {
      const lessonId = await newLesson('race-version');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await workflow.perform('UNPUBLISH', lessonId, admins.admin);
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          workflow.perform('PUBLISH', lessonId, admins.admin),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rows = await pubRows(lessonId);
      expect(rows.map((r: { version: number }) => r.version)).toEqual([1, 2]);
      expect(
        rows.filter((r: { ended_at: Date | null }) => r.ended_at === null),
      ).toHaveLength(1);
    });

    it('simultaneous unpublishes: the publication is ended exactly once', async () => {
      const lessonId = await newLesson('race-unpublish');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          workflow.perform('UNPUBLISH', lessonId, admins.admin),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (await eventRows(lessonId)).filter(
          (e: { action: string }) => e.action === 'UNPUBLISH',
        ),
      ).toHaveLength(1);
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
    });

    it('publish against unpublish: they serialize and the final state is consistent', async () => {
      const lessonId = await newLesson('race-mixed');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await workflow.perform('UNPUBLISH', lessonId, admins.admin);
      await Promise.allSettled([
        workflow.perform('PUBLISH', lessonId, admins.admin),
        workflow.perform('UNPUBLISH', lessonId, admins.admin),
        workflow.perform('PUBLISH', lessonId, admins.admin),
      ]);
      const rows = await pubRows(lessonId);
      const active = rows.filter(
        (r: { ended_at: Date | null }) => r.ended_at === null,
      );
      const status = (await lessonRow(lessonId)).status;
      expect(active.length).toBeLessThanOrEqual(1);
      expect(status === 'PUBLISHED').toBe(active.length === 1);
    });

    it('an edit that commits before the publish gets the lock wins: the publish is refused and nothing is snapshotted', async () => {
      const lessonId = await newLesson('race-edit');
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      try {
        // the "editor" holds the lesson lock, exactly like every authoring write does
        await holder.query(
          `SELECT "id" FROM "lessons" WHERE "id" = $1 FOR UPDATE`,
          [lessonId],
        );

        const publishing = workflow
          .perform('PUBLISH', lessonId, admins.admin)
          .then(
            () => 'published',
            (error: unknown) => error,
          );
        await waitUntilSomeoneWaitsForALock(dataSource);

        await simulateEdit(lessonId, holder.manager);
        await holder.commitTransaction();

        const outcome = await publishing;
        expect(outcome).toBeInstanceOf(ConflictError);
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
      }
      expect((await lessonRow(lessonId)).status).toBe('DRAFT');
      expect(await pubRows(lessonId)).toEqual([]);
      expect(await levelRows(lessonId)).toEqual([]);
    });

    it('a publish that wins the lock first snapshots the pre-edit content, and the later edit leaves a draft', async () => {
      const lessonId = await newLesson('race-edit-after');
      const published = await workflow.perform(
        'PUBLISH',
        lessonId,
        admins.admin,
      );
      await simulateEdit(lessonId);
      const rows = await pubRows(lessonId);
      expect(rows[0].source_content_revision).toBe(published.contentRevision);
      expect((await lessonRow(lessonId)).rev).toBe(
        published.contentRevision + 1,
      );
      expect((await lessonRow(lessonId)).status).toBe('DRAFT');
      expect(rows[0].ended_at).toBeNull(); // the old version keeps serving until it is replaced or unpublished
    });
  });
});

function richText(text: string) {
  return {
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  };
}

/** Polls until some backend is blocked on a lock (the publish waiting for the lesson row). */
async function waitUntilSomeoneWaitsForALock(dataSource: DataSource) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await dataSource.query(
      `SELECT count(*)::int AS "waiting" FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
