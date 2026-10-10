import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource, type EntityManager } from 'typeorm';
import { deleteWorkflowHistory } from '../../../../test/support/workflow-cleanup.js';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  ConflictError,
  type ContentStatus,
} from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import { LessonsFacade } from '../../lessons/index.js';
import { ConsistencyService } from '../application/consistency.service.js';
import { PublicationService } from '../application/publication.service.js';
import { WorkflowService } from '../application/workflow.service.js';
import { SEPARATION_OF_DUTIES_POLICY } from '../domain/separation-of-duties.js';
import { WorkflowEventRepository } from './workflow-event.repository.js';
import { canonicalJson } from '../domain/snapshot-payload.js';
import { PublishingModule } from '../publishing.module.js';

// Integration: lock timeout, session cleanup, concurrency-error translation and the status/publication
// consistency rules, against the development database (DATABASE_URL). Everything created here carries a
// per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;
const emailOf = (name: string) => `hard-${runId}-${name}@int-test.invalid`;
/** A time safely after any publication made now, whatever the clock skew between this machine and the database. */
const later = () => new Date(Date.now() + 60 * 60 * 1000);
const TIMEOUT_MS = 400;
const ALL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

describe('publishing hardening (integration)', () => {
  let dataSource: DataSource;
  /** The normal service (10 s lock timeout): used for setup and for everything that should simply work. */
  let workflow: WorkflowService;
  /** The same service with a 400 ms lock timeout, so the timeout tests do not have to wait 10 s. */
  let impatient: WorkflowService;
  let consistency: ConsistencyService;
  let transactions: TransactionRunner;
  let closeModule: () => Promise<void>;
  const admins: Record<string, AuthenticatedAdmin> = {};
  const ownLessons = new Set<string>();

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
      `hard-${runId}-%@int-test.invalid`,
    ]);
  };

  const newAdmin = async (name: string, role: Role) => {
    const [row] = await dataSource.query(
      `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'not-a-real-hash',$2) RETURNING "id"`,
      [emailOf(name), role],
    );
    admins[name] = { id: row.id, email: emailOf(name), role };
  };

  /** A publishable lesson: three levels and one text block visible at all of them. */
  const newLesson = async (
    name: string,
    status: ContentStatus = 'APPROVED',
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
    for (const level of ALL_LEVELS) {
      await dataSource.query(
        `INSERT INTO "lesson_levels" ("lesson_id","level") VALUES ($1,$2)`,
        [lesson.id, level],
      );
    }
    const [block] = await dataSource.query(
      `INSERT INTO "lesson_blocks" ("lesson_id","type","position","shared_content")
       VALUES ($1,'RICH_TEXT',1,$2::jsonb) RETURNING "id"`,
      [
        lesson.id,
        JSON.stringify({
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: name }] },
            ],
          },
        }),
      ],
    );
    for (const level of ALL_LEVELS) {
      await dataSource.query(
        `INSERT INTO "lesson_block_levels" ("block_id","lesson_id","level") VALUES ($1,$2,$3)`,
        [block.id, lesson.id, level],
      );
    }
    ownLessons.add(lesson.id);
    return lesson.id as string;
  };

  /** What an authoring edit does (the lessons module's job): back to DRAFT, content revision + 1. */
  const simulateEdit = (lessonId: string) =>
    dataSource.query(
      `UPDATE "lessons" SET "status"='DRAFT', "content_revision"="content_revision"+1, "updated_at"=now() WHERE "id"=$1`,
      [lessonId],
    );

  const lessonRow = async (id: string) =>
    (
      await dataSource.query(`SELECT * FROM "lessons" WHERE "id" = $1`, [id])
    )[0];
  const pubRows = (lessonId: string) =>
    dataSource.query(
      `SELECT * FROM "lesson_publications" WHERE "lesson_id" = $1 ORDER BY "version"`,
      [lessonId],
    );
  const eventRows = (lessonId: string) =>
    dataSource.query(
      `SELECT * FROM "lesson_workflow_events" WHERE "lesson_id" = $1 ORDER BY "seq"`,
      [lessonId],
    );

  /** Only the findings about lessons this suite created (other suites share the database). */
  const ownIssues = async (verifySnapshots = false) => {
    const report = await consistency.check({
      verifySnapshots,
      limitPerCheck: 1000,
    });
    return report.issues.filter((issue) => ownLessons.has(issue.lessonId));
  };

  /** A second connection that holds a row lock until released: the "someone else is editing" stand-in. */
  const holdLock = async (sql: string, params: unknown[]) => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(sql, params);
    return {
      release: async () => {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      },
    };
  };
  const holdLesson = (lessonId: string) =>
    holdLock(`SELECT "id" FROM "lessons" WHERE "id" = $1 FOR UPDATE`, [
      lessonId,
    ]);

  /**
   * Runs `fn` with the history guards (publications, snapshots, events) off, to plant corrupt data.
   * It never touches the lessons table's triggers: that would block every other suite's lesson writes.
   */
  const plant = async (fn: (manager: EntityManager) => Promise<void>) => {
    await dataSource.transaction(async (manager) => {
      for (const table of [
        'lesson_publications',
        'lesson_publication_levels',
        'lesson_workflow_events',
      ]) {
        await manager.query(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
      }
      await fn(manager);
      // same order the publish path writes them (publication, snapshots, events): no lock-order deadlocks with other suites
      for (const table of [
        'lesson_publications',
        'lesson_publication_levels',
        'lesson_workflow_events',
      ]) {
        await manager.query(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
      }
    });
  };

  const rawPublication = async (
    manager: EntityManager,
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
    const [row] = await manager.query(
      `INSERT INTO "lesson_publications" (${columns.map((c) => `"${c}"`).join(',')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING "id"`,
      Object.values(values),
    );
    return row.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, PublishingModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    workflow = moduleRef.get(WorkflowService, { strict: false });
    impatient = new WorkflowService(
      moduleRef.get(LessonsFacade, { strict: false }),
      moduleRef.get(WorkflowEventRepository, { strict: false }),
      moduleRef.get(TransactionRunner, { strict: false }),
      moduleRef.get(SEPARATION_OF_DUTIES_POLICY, { strict: false }),
      moduleRef.get(PublicationService, { strict: false }),
      TIMEOUT_MS,
    );
    consistency = moduleRef.get(ConsistencyService, { strict: false });
    transactions = moduleRef.get(TransactionRunner, { strict: false });
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

  describe('lock timeout', () => {
    const busyBecause = (error: unknown) => {
      expect(error).toBeInstanceOf(ConflictError);
      const conflict = error as ConflictError;
      expect(conflict.details).toEqual({
        reason: 'LOCK_TIMEOUT',
        retryable: true,
      });
      // a client-safe message: no database internals (the reason code is the documented, stable signal)
      expect(conflict.message).not.toMatch(
        /postgres|lock_timeout|canceling statement|relation|lessons|SELECT|FOR UPDATE|55P03|statement/i,
      );
      expect(JSON.stringify(conflict.details)).not.toMatch(
        /SELECT|55P03|lessons|stack/i,
      );
    };

    it.each([
      ['SUBMIT_FOR_REVIEW', 'DRAFT', admins_('editor')],
      ['APPROVE', 'READY_FOR_REVIEW', admins_('reviewer')],
      ['PUBLISH', 'APPROVED', admins_('admin')],
    ] as const)(
      '%s waits for the lesson lock, gives up after the timeout with a retryable 409, and works once the lock is free',
      async (action, status, who) => {
        const lessonId = await newLesson(`timeout-${action}`, status);
        const before = await lessonRow(lessonId);
        const holder = await holdLesson(lessonId);
        try {
          const started = Date.now();
          const error = await impatient
            .perform(action, lessonId, admins[who()])
            .catch((e: unknown) => e);
          const waited = Date.now() - started;

          busyBecause(error);
          expect(waited).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
          expect(waited).toBeLessThan(5000);
        } finally {
          await holder.release();
        }
        // nothing happened
        expect(await lessonRow(lessonId)).toEqual(before);
        expect(await eventRows(lessonId)).toEqual([]);
        expect(await pubRows(lessonId)).toEqual([]);

        await expect(
          workflow.perform(action, lessonId, admins[who()]),
        ).resolves.toBeDefined();
      },
    );

    it('UNPUBLISH gives up the same way', async () => {
      const lessonId = await newLesson('timeout-unpublish');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const before = await lessonRow(lessonId);
      const holder = await holdLesson(lessonId);
      try {
        busyBecause(
          await impatient
            .perform('UNPUBLISH', lessonId, admins.admin)
            .catch((e: unknown) => e),
        );
      } finally {
        await holder.release();
      }
      expect(await lessonRow(lessonId)).toEqual(before);
      expect((await pubRows(lessonId))[0].ended_at).toBeNull();
      expect(await eventRows(lessonId)).toHaveLength(1);
      await expect(
        workflow.perform('UNPUBLISH', lessonId, admins.admin),
      ).resolves.toBeDefined();
    });

    it('a timeout in the middle of a publish rolls everything back and frees the lesson lock', async () => {
      const lessonId = await newLesson('timeout-midway');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await simulateEdit(lessonId);
      await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
      await workflow.perform('APPROVE', lessonId, admins.reviewer);
      const [v1] = await pubRows(lessonId);
      const before = await lessonRow(lessonId);
      const eventsBefore = (await eventRows(lessonId)).length;

      // someone holds the active publication row: the publish gets the lesson lock, then waits to supersede it
      const holder = await holdLock(
        `SELECT "id" FROM "lesson_publications" WHERE "id" = $1 FOR UPDATE`,
        [v1.id],
      );
      try {
        busyBecause(
          await impatient
            .perform('PUBLISH', lessonId, admins.admin)
            .catch((e: unknown) => e),
        );

        expect(await pubRows(lessonId)).toEqual([v1]); // not superseded, no version 2
        expect(await lessonRow(lessonId)).toEqual(before);
        expect(await eventRows(lessonId)).toHaveLength(eventsBefore);
        const [snapshots] = await dataSource.query(
          `SELECT count(*)::int AS n FROM "lesson_publication_levels" WHERE "lesson_id" = $1`,
          [lessonId],
        );
        expect(snapshots.n).toBe(3); // only version 1's snapshots

        // the failed transaction released the lesson lock
        await expect(
          dataSource.query(
            `SELECT "id" FROM "lessons" WHERE "id" = $1 FOR UPDATE NOWAIT`,
            [lessonId],
          ),
        ).resolves.toHaveLength(1);
      } finally {
        await holder.release();
      }

      const again = await workflow.perform('PUBLISH', lessonId, admins.admin);
      expect(again.publication!.version).toBe(2);
    });

    it('applies only inside the transaction: connections of the pool never keep the setting', async () => {
      const lessonId = await newLesson('timeout-session');
      const holder = await holdLesson(lessonId);
      try {
        await impatient
          .perform('PUBLISH', lessonId, admins.admin)
          .catch(() => undefined);
      } finally {
        await holder.release();
      }
      await workflow.perform('PUBLISH', lessonId, admins.admin);

      // inside a transaction that asks for it the value is set ...
      const inside = await transactions.run(
        (manager) => manager.query(`SHOW lock_timeout`),
        { lockTimeoutMs: 750 },
      );
      expect(inside[0].lock_timeout).toBe('750ms');
      // ... a transaction that fails or times out does not leave it behind either ...
      await transactions
        .run(
          async () => {
            throw new Error('work failed');
          },
          { lockTimeoutMs: 750 },
        )
        .catch(() => undefined);
      // ... and every connection of the pool is back to the server default (no timeout)
      const shown = await Promise.all(
        Array.from({ length: 12 }, () =>
          dataSource.query(
            `SELECT pg_sleep(0.05), current_setting('lock_timeout') AS v`,
          ),
        ),
      );
      expect(new Set(shown.map((rows) => rows[0].v))).toEqual(new Set(['0']));
    });

    it('does not apply to transactions that did not ask for it', async () => {
      const shown = await transactions.run((manager) =>
        manager.query(`SHOW lock_timeout`),
      );
      expect(shown[0].lock_timeout).toBe('0');
    });
  });

  describe('deadlocks', () => {
    it('are translated into a retryable conflict, and the other transaction completes', async () => {
      const a = await newLesson('deadlock-a');
      const b = await newLesson('deadlock-b');
      let aHasFirst!: () => void;
      let bHasFirst!: () => void;
      const aReady = new Promise<void>((resolve) => (aHasFirst = resolve));
      const bReady = new Promise<void>((resolve) => (bHasFirst = resolve));
      const lock = (m: EntityManager, id: string) =>
        m.query(`SELECT "id" FROM "lessons" WHERE "id" = $1 FOR UPDATE`, [id]);

      const results = await Promise.allSettled([
        transactions.run(async (m) => {
          await lock(m, a);
          aHasFirst();
          await bReady;
          await lock(m, b);
          return 'first';
        }),
        transactions.run(async (m) => {
          await lock(m, b);
          bHasFirst();
          await aReady;
          await lock(m, a);
          return 'second';
        }),
      ]);

      const failed = results.filter((r) => r.status === 'rejected');
      expect(failed).toHaveLength(1);
      const reason = (failed[0] as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ConflictError);
      expect((reason as ConflictError).details).toEqual({
        reason: 'CONCURRENT_UPDATE',
        retryable: true,
      });
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    }, 30_000);
  });

  describe('status and publication consistency (database)', () => {
    it('refuses a PUBLISHED lesson without an active publication', async () => {
      const lessonId = await newLesson('db-published');
      await expect(
        dataSource.query(
          `UPDATE "lessons" SET "status" = 'PUBLISHED' WHERE "id" = $1`,
          [lessonId],
        ),
      ).rejects.toMatchObject({
        code: '23000',
        message: expect.stringContaining('active publication'),
      });
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
    });

    it('refuses a new lesson that starts out PUBLISHED', async () => {
      await newLesson('db-insert-anchor');
      const [{ id: moduleId }] = await dataSource.query(
        `SELECT m."id" FROM "course_modules" m JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" = $1`,
        [title('db-insert-anchor')],
      );
      await expect(
        dataSource.query(
          `INSERT INTO "lessons" ("module_id","title","position","status") VALUES ($1,$2,2,'PUBLISHED')`,
          [moduleId, title('db-insert-published')],
        ),
      ).rejects.toMatchObject({ code: '23000' });
    });

    it('accepts PUBLISHED when the publication is created in the same transaction, in either order', async () => {
      const lessonId = await newLesson('db-same-tx');
      await dataSource.transaction(async (m) => {
        await m.query(
          `UPDATE "lessons" SET "status"='PUBLISHED' WHERE "id"=$1`,
          [lessonId],
        );
        await rawPublication(m, lessonId); // checked at commit, so the order does not matter
      });
      expect((await lessonRow(lessonId)).status).toBe('PUBLISHED');
    });

    it('refuses to end the publication of a PUBLISHED lesson on its own, but accepts it together with the status change', async () => {
      const lessonId = await newLesson('db-end');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      const [publication] = await pubRows(lessonId);

      await expect(
        dataSource.query(
          `UPDATE "lesson_publications" SET "ended_at"=clock_timestamp(), "ended_by"=$2, "ended_reason"='UNPUBLISHED' WHERE "id"=$1`,
          [publication.id, admins.admin.id],
        ),
      ).rejects.toMatchObject({ code: '23000' });
      expect((await pubRows(lessonId))[0].ended_at).toBeNull();

      await dataSource.transaction(async (m) => {
        await m.query(
          `UPDATE "lesson_publications" SET "ended_at"=clock_timestamp(), "ended_by"=$2, "ended_reason"='UNPUBLISHED' WHERE "id"=$1`,
          [publication.id, admins.admin.id],
        );
        await m.query(
          `UPDATE "lessons" SET "status"='APPROVED' WHERE "id"=$1`,
          [lessonId],
        );
      });
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
    });

    it.each(['DRAFT', 'READY_FOR_REVIEW', 'APPROVED'] as const)(
      'accepts a %s working copy whose older publication is still active',
      async (status) => {
        const lessonId = await newLesson(`db-older-${status}`);
        await workflow.perform('PUBLISH', lessonId, admins.admin);
        await dataSource.query(
          `UPDATE "lessons" SET "status" = $2 WHERE "id" = $1`,
          [lessonId, status],
        );
        expect((await lessonRow(lessonId)).status).toBe(status);
        expect((await pubRows(lessonId))[0].ended_at).toBeNull();
        expect(await ownIssuesFor(lessonId)).toEqual([]);
      },
    );

    it('keeps at most one active publication per lesson', async () => {
      const lessonId = await newLesson('db-one-active');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await expect(
        dataSource.transaction((m) =>
          rawPublication(m, lessonId, { version: 2 }),
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('consistency across whole sequences', () => {
    it('stays consistent through publish, edit, review, approval, republish and unpublish', async () => {
      const lessonId = await newLesson('sequence');
      const check = async () => {
        expect(await ownIssuesFor(lessonId)).toEqual([]);
      };

      await workflow.perform('PUBLISH', lessonId, admins.admin); // v1 active, PUBLISHED
      await check();
      await simulateEdit(lessonId); // DRAFT, v1 still active
      await check();
      await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor); // READY_FOR_REVIEW, v1 active
      await check();
      await workflow.perform('APPROVE', lessonId, admins.reviewer); // APPROVED, v1 active
      await check();
      await workflow.perform('PUBLISH', lessonId, admins.admin); // v2 supersedes v1
      await check();
      await workflow.perform('UNPUBLISH', lessonId, admins.admin); // APPROVED, nothing active
      await check();
      await workflow.perform('PUBLISH', lessonId, admins.admin); // v3
      await simulateEdit(lessonId);
      await workflow.perform('UNPUBLISH', lessonId, admins.admin); // DRAFT preserved, nothing active
      await check();

      const publications = await pubRows(lessonId);
      expect(publications.map((p: { version: number }) => p.version)).toEqual([
        1, 2, 3,
      ]);
      expect(
        publications.map((p: { ended_reason: string }) => p.ended_reason),
      ).toEqual(['SUPERSEDED', 'UNPUBLISHED', 'UNPUBLISHED']);
      // exactly one event per transition, each linked correctly
      const events = await eventRows(lessonId);
      expect(events.map((e: { action: string }) => e.action)).toEqual([
        'PUBLISH',
        'SUBMIT_FOR_REVIEW',
        'APPROVE',
        'PUBLISH',
        'UNPUBLISH',
        'PUBLISH',
        'UNPUBLISH',
      ]);
      expect(events[3].publication_id).toBe(publications[1].id);
      expect(events[4].publication_id).toBe(publications[1].id);
      expect(events[6].publication_id).toBe(publications[2].id);
      // once, with every stored hash and size re-checked
      expect(await ownIssuesFor(lessonId, true)).toEqual([]);
    }, 120_000);

    it('concurrent publish, unpublish and authoring edits leave a consistent lesson', async () => {
      const lessonId = await newLesson('storm');
      await workflow.perform('PUBLISH', lessonId, admins.admin);
      await workflow.perform('UNPUBLISH', lessonId, admins.admin);

      for (let round = 0; round < 3; round += 1) {
        await Promise.allSettled([
          workflow.perform('PUBLISH', lessonId, admins.admin),
          workflow.perform('UNPUBLISH', lessonId, admins.admin),
          workflow.perform('PUBLISH', lessonId, admins.admin),
          simulateEdit(lessonId),
          workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor),
          workflow.perform('APPROVE', lessonId, admins.reviewer),
        ]);
        const publications = await pubRows(lessonId);
        const active = publications.filter(
          (p: { ended_at: Date | null }) => p.ended_at === null,
        );
        expect(active.length).toBeLessThanOrEqual(1);
        const status = (await lessonRow(lessonId)).status;
        if (status === 'PUBLISHED') expect(active).toHaveLength(1);
        expect(await ownIssuesFor(lessonId)).toEqual([]);
        // return to a publishable state for the next round
        await dataSource.query(
          `UPDATE "lessons" SET "status" = 'APPROVED' WHERE "id" = $1 AND "status" <> 'PUBLISHED'`,
          [lessonId],
        );
      }
      const versions = (await pubRows(lessonId)).map(
        (p: { version: number }) => p.version,
      );
      expect(new Set(versions).size).toBe(versions.length); // no version was ever reused
    });
  });

  describe('the consistency check finds corrupted data', () => {
    it('a publication without its PUBLISH event, and revision mismatches', async () => {
      const lessonId = await newLesson('bad-no-event');
      let publicationId = '';
      await plant(async (m) => {
        publicationId = await rawPublication(m, lessonId, {
          source_content_revision: 3,
        });
        await m.query(
          `INSERT INTO "lesson_publication_levels" ("publication_id","lesson_id","level","content","content_hash","content_bytes")
           VALUES ($1,$2,'BEGINNER','{"a":1}'::jsonb,$3,7)`,
          [publicationId, lessonId, 'a'.repeat(64)],
        );
      });
      expect((await ownIssuesFor(lessonId)).map((i) => i.code)).toContain(
        'PUBLICATION_WITHOUT_PUBLISH_EVENT',
      );

      await plant(async (m) => {
        await m.query(
          `INSERT INTO "lesson_workflow_events" ("lesson_id","action","from_status","to_status","actor_admin_id","actor_role","content_revision","publication_id")
           VALUES ($1,'PUBLISH','APPROVED','PUBLISHED',$2,'ADMIN',9,$3)`,
          [lessonId, admins.admin.id, publicationId],
        );
      });
      const codes = (await ownIssuesFor(lessonId)).map((i) => i.code);
      expect(codes).not.toContain('PUBLICATION_WITHOUT_PUBLISH_EVENT');
      expect(codes).toContain('PUBLISH_EVENT_REVISION_MISMATCH'); // event says revision 9, publication says 3
    });

    it('endings without their events, and a publication without snapshots', async () => {
      const lessonId = await newLesson('bad-endings');
      await plant(async (m) => {
        await rawPublication(m, lessonId, {
          version: 1,
          ended_at: later(),
          ended_by: admins.admin.id,
          ended_reason: 'UNPUBLISHED',
        });
        await rawPublication(m, lessonId, {
          version: 2,
          ended_at: later(),
          ended_by: admins.admin.id,
          ended_reason: 'SUPERSEDED',
        });
      });
      const codes = (await ownIssuesFor(lessonId)).map((i) => i.code);
      expect(codes).toContain('UNPUBLISHED_WITHOUT_EVENT');
      expect(codes).toContain('SUPERSEDED_WITHOUT_SUCCESSOR');
      expect(codes).toContain('PUBLICATION_WITHOUT_SNAPSHOTS');
    });

    it('a PUBLISHED lesson without an active publication', async () => {
      const lessonId = await newLesson('bad-published');
      // a valid PUBLISHED lesson ...
      const publicationId = await dataSource.transaction(async (m) => {
        const id = await rawPublication(m, lessonId);
        await m.query(
          `UPDATE "lessons" SET "status"='PUBLISHED' WHERE "id"=$1`,
          [lessonId],
        );
        return id;
      });
      // ... whose publication is then ended behind the application's back (guards off)
      await plant(async (m) => {
        await m.query(
          `UPDATE "lesson_publications" SET "ended_at"=clock_timestamp(), "ended_by"=$2, "ended_reason"='UNPUBLISHED' WHERE "id"=$1`,
          [publicationId, admins.admin.id],
        );
      });
      expect(await ownIssuesFor(lessonId)).toContainEqual(
        expect.objectContaining({
          code: 'PUBLISHED_WITHOUT_ACTIVE_PUBLICATION',
          lessonId,
        }),
      );
    });

    it('a snapshot whose hash or size no longer matches its content (only when verifying)', async () => {
      const lessonId = await newLesson('bad-snapshot');
      const content = { schemaVersion: 1, level: 'BEGINNER', blocks: [] };
      const canonical = canonicalJson(content);
      await plant(async (m) => {
        const publicationId = await rawPublication(m, lessonId);
        await m.query(
          `INSERT INTO "lesson_publication_levels" ("publication_id","lesson_id","level","content","content_hash","content_bytes")
           VALUES ($1,$2,'BEGINNER',$3::jsonb,$4,$5), ($1,$2,'ADVANCED',$3::jsonb,$6,10)`,
          [
            publicationId,
            lessonId,
            canonical,
            'b'.repeat(64), // wrong hash (and the right size)
            Buffer.byteLength(canonical, 'utf8'),
            'c'.repeat(64), // wrong hash and wrong size
          ],
        );
      });
      const notVerified = (await ownIssuesFor(lessonId)).map((i) => i.code);
      expect(notVerified).not.toContain('SNAPSHOT_HASH_MISMATCH');

      const verified = await ownIssuesFor(lessonId, true);
      const by = (level: string) =>
        verified.filter((i) => i.level === level).map((i) => i.code);
      expect(by('BEGINNER')).toEqual(['SNAPSHOT_HASH_MISMATCH']);
      expect(by('ADVANCED').sort()).toEqual([
        'SNAPSHOT_HASH_MISMATCH',
        'SNAPSHOT_SIZE_MISMATCH',
      ]);
    });
  });

  /** Findings about one lesson. */
  async function ownIssuesFor(lessonId: string, verifySnapshots = false) {
    return (await ownIssues(verifySnapshots)).filter(
      (issue) => issue.lessonId === lessonId,
    );
  }

  /** Lazily picks an admin by name (the table above is built before the admins exist). */
  function admins_(name: string) {
    return () => name;
  }
});
