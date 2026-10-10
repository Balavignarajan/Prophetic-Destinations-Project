import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { deleteWorkflowHistory } from '../../../../test/support/workflow-cleanup.js';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import {
  ConflictError,
  type ContentStatus,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import { ReadinessService } from '../application/readiness.service.js';
import { WorkflowService } from '../application/workflow.service.js';
import { PublishingModule } from '../publishing.module.js';

// Integration: the real workflow service, repositories, triggers and constraints against the
// development database (DATABASE_URL). Everything created here carries a per-run prefix and is deleted afterwards.
const runId = randomUUID().slice(0, 8);
const title = (name: string) => `int-${runId}-${name}`;
const emailOf = (name: string) => `wfint-${runId}-${name}@int-test.invalid`;

describe('workflow events and transitions (integration)', () => {
  let dataSource: DataSource;
  let workflow: WorkflowService;
  let readiness: ReadinessService;
  let closeModule: () => Promise<void>;
  const admins: Record<string, AuthenticatedAdmin> = {};

  const lessonsOfRun = `SELECT l."id" FROM "lessons" l
      JOIN "course_modules" m ON m."id" = l."module_id"
      JOIN "courses" c ON c."id" = m."course_id" WHERE c."title" LIKE $1`;

  const cleanup = async () => {
    const like = `int-${runId}-%`;
    await deleteWorkflowHistory(dataSource, lessonsOfRun, [like]);
    await dataSource.query(
      `DELETE FROM "lesson_block_levels" WHERE "lesson_id" IN (${lessonsOfRun})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lesson_blocks" WHERE "lesson_id" IN (${lessonsOfRun})`,
      [like],
    );
    await dataSource.query(
      `DELETE FROM "lesson_levels" WHERE "lesson_id" IN (${lessonsOfRun})`,
      [like],
    );
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
      `wfint-${runId}-%@int-test.invalid`,
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

  const newLesson = async (name: string, status: ContentStatus = 'DRAFT') => {
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
    return lesson.id as string;
  };

  const lessonRow = async (id: string) =>
    (
      await dataSource.query(
        `SELECT "status", "version", "content_revision" AS rev, "updated_at" FROM "lessons" WHERE "id" = $1`,
        [id],
      )
    )[0] as { status: string; version: number; rev: number; updated_at: Date };

  const events = (lessonId: string) =>
    dataSource.query(
      `SELECT * FROM "lesson_workflow_events" WHERE "lesson_id" = $1 ORDER BY "seq"`,
      [lessonId],
    );

  /** A raw event insert, to probe the table's own constraints. */
  const insertEvent = (
    lessonId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const values: Record<string, unknown> = {
      lesson_id: lessonId,
      action: 'SUBMIT_FOR_REVIEW',
      from_status: 'DRAFT',
      to_status: 'READY_FOR_REVIEW',
      actor_admin_id: admins.editor.id,
      actor_role: 'EDITOR',
      note: null,
      content_revision: 1,
      ...overrides,
    };
    const columns = Object.keys(values);
    return dataSource.query(
      `INSERT INTO "lesson_workflow_events" (${columns.map((c) => `"${c}"`).join(',')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING "id", "seq"`,
      Object.values(values),
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, PublishingModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    workflow = moduleRef.get(WorkflowService, { strict: false });
    readiness = moduleRef.get(ReadinessService, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
    await newAdmin('editor', Role.EDITOR);
    await newAdmin('reviewer', Role.REVIEWER);
    await newAdmin('admin', Role.ADMIN);
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  describe('table integrity', () => {
    it('accepts every approved review transition shape (publish and unpublish need a publication: see publications.int-spec)', async () => {
      const lessonId = await newLesson('shapes');
      const shapes: Record<string, unknown>[] = [
        {
          action: 'SUBMIT_FOR_REVIEW',
          from_status: 'DRAFT',
          to_status: 'READY_FOR_REVIEW',
        },
        {
          action: 'REQUEST_CHANGES',
          from_status: 'READY_FOR_REVIEW',
          to_status: 'DRAFT',
          note: 'fix it',
        },
        {
          action: 'APPROVE',
          from_status: 'READY_FOR_REVIEW',
          to_status: 'APPROVED',
        },
      ];
      for (const shape of shapes)
        await expect(insertEvent(lessonId, shape)).resolves.toBeDefined();
    });

    it('rejects every impossible action/status combination', async () => {
      const lessonId = await newLesson('impossible');
      const impossible: Record<string, unknown>[] = [
        { action: 'APPROVE', from_status: 'DRAFT', to_status: 'APPROVED' },
        {
          action: 'SUBMIT_FOR_REVIEW',
          from_status: 'READY_FOR_REVIEW',
          to_status: 'DRAFT',
        },
        {
          action: 'SUBMIT_FOR_REVIEW',
          from_status: 'DRAFT',
          to_status: 'APPROVED',
        },
        { action: 'PUBLISH', from_status: 'DRAFT', to_status: 'PUBLISHED' },
        {
          action: 'PUBLISH',
          from_status: 'READY_FOR_REVIEW',
          to_status: 'PUBLISHED',
        },
        {
          action: 'REQUEST_CHANGES',
          from_status: 'APPROVED',
          to_status: 'DRAFT',
          note: 'x',
        },
      ];
      for (const shape of impossible) {
        await expect(
          insertEvent(lessonId, shape),
          JSON.stringify(shape),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('rejects unknown actions, statuses and roles (including ARCHIVED)', async () => {
      const lessonId = await newLesson('unknown');
      for (const overrides of [
        { action: 'ARCHIVE' },
        { from_status: 'ARCHIVED' },
        { to_status: 'ARCHIVED' },
        { actor_role: 'SUPERUSER' },
        { actor_role: 'editor' },
      ]) {
        await expect(insertEvent(lessonId, overrides)).rejects.toMatchObject({
          code: '23514',
        });
      }
    });

    it('requires a note when requesting changes, and keeps notes nonblank and within 2000 characters', async () => {
      const lessonId = await newLesson('notes');
      const request = {
        action: 'REQUEST_CHANGES',
        from_status: 'READY_FOR_REVIEW',
        to_status: 'DRAFT',
      };
      await expect(
        insertEvent(lessonId, { ...request, note: null }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        insertEvent(lessonId, { ...request, note: '   \n ' }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(insertEvent(lessonId, { note: ' ' })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        insertEvent(lessonId, { note: 'x'.repeat(2001) }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        insertEvent(lessonId, { note: 'x'.repeat(2000) }),
      ).resolves.toBeDefined();
      await expect(
        insertEvent(lessonId, { note: null }),
      ).resolves.toBeDefined();
    });

    it('requires a content revision of at least 1', async () => {
      const lessonId = await newLesson('revision');
      await expect(
        insertEvent(lessonId, { content_revision: 0 }),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('requires an existing lesson and an existing admin (foreign keys)', async () => {
      const lessonId = await newLesson('fk');
      await expect(insertEvent(randomUUID())).rejects.toMatchObject({
        code: '23503',
      });
      await expect(
        insertEvent(lessonId, { actor_admin_id: randomUUID() }),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('numbers events in the order they were recorded', async () => {
      const lessonId = await newLesson('seq');
      const first = (await insertEvent(lessonId))[0];
      const second = (await insertEvent(lessonId))[0];
      expect(Number(second.seq)).toBeGreaterThan(Number(first.seq));
    });

    it('does not let callers choose the sequence number', async () => {
      const lessonId = await newLesson('seq-fixed');
      await expect(insertEvent(lessonId, { seq: 1 })).rejects.toMatchObject({
        code: '428C9',
      });
    });
  });

  describe('history is append-only at the database level', () => {
    it('rejects UPDATE of any column', async () => {
      const lessonId = await newLesson('immutable-update');
      const [{ id }] = await insertEvent(lessonId, { note: 'original' });
      for (const set of [
        `"note" = 'edited'`,
        `"actor_role" = 'ADMIN'`,
        `"content_revision" = 99`,
        `"to_status" = 'DRAFT'`,
      ]) {
        await expect(
          dataSource.query(
            `UPDATE "lesson_workflow_events" SET ${set} WHERE "id" = $1`,
            [id],
          ),
        ).rejects.toMatchObject({
          code: '23000',
          message: expect.stringContaining('append-only'),
        });
      }
      const [row] = await dataSource.query(
        `SELECT "note" FROM "lesson_workflow_events" WHERE "id" = $1`,
        [id],
      );
      expect(row.note).toBe('original');
    });

    it("rejects DELETE, one row or all of a lesson's rows", async () => {
      const lessonId = await newLesson('immutable-delete');
      const [{ id }] = await insertEvent(lessonId);
      await expect(
        dataSource.query(
          `DELETE FROM "lesson_workflow_events" WHERE "id" = $1`,
          [id],
        ),
      ).rejects.toMatchObject({
        code: '23000',
      });
      await expect(
        dataSource.query(
          `DELETE FROM "lesson_workflow_events" WHERE "lesson_id" = $1`,
          [lessonId],
        ),
      ).rejects.toMatchObject({ code: '23000' });
      expect(await events(lessonId)).toHaveLength(1);
    });

    it('rejects TRUNCATE (tried inside a transaction that is always rolled back)', async () => {
      const lessonId = await newLesson('immutable-truncate');
      await insertEvent(lessonId);
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await expect(
          runner.query(`TRUNCATE "lesson_workflow_events"`),
        ).rejects.toMatchObject({ code: '23000' });
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      expect(await events(lessonId)).toHaveLength(1);
    });

    it('keeps a lesson with history from being deleted: raw SQL is refused by RESTRICT (the controlled 409 is covered end to end)', async () => {
      const lessonId = await newLesson('history-delete');
      await insertEvent(lessonId);
      await expect(
        dataSource.query(`DELETE FROM "lessons" WHERE "id" = $1`, [lessonId]),
      ).rejects.toMatchObject({
        code: '23001',
      });
      expect((await lessonRow(lessonId)).status).toBe('DRAFT');
      expect(await events(lessonId)).toHaveLength(1);
    });

    it('keeps an admin who acted from being deleted', async () => {
      const lessonId = await newLesson('history-admin');
      const temp = await newAdmin('temp', Role.EDITOR);
      await insertEvent(lessonId, { actor_admin_id: temp.id });
      await expect(
        dataSource.query(`DELETE FROM "admins" WHERE "id" = $1`, [temp.id]),
      ).rejects.toMatchObject({
        code: '23001',
      });
    });
  });

  describe('transitions with the real services', () => {
    it('submit then approve: status, events and actors are recorded, and neither version moves', async () => {
      const lessonId = await newLesson('flow');
      const before = await lessonRow(lessonId);

      const submitted = await workflow.perform(
        'SUBMIT_FOR_REVIEW',
        lessonId,
        admins.editor,
        { note: 'ready?' },
      );
      const approved = await workflow.perform(
        'APPROVE',
        lessonId,
        admins.reviewer,
      );

      expect(submitted).toMatchObject({
        fromStatus: 'DRAFT',
        status: 'READY_FOR_REVIEW',
        contentRevision: 1,
      });
      expect(approved).toMatchObject({
        fromStatus: 'READY_FOR_REVIEW',
        status: 'APPROVED',
      });

      const after = await lessonRow(lessonId);
      expect(after.status).toBe('APPROVED');
      expect(after.version).toBe(before.version);
      expect(after.rev).toBe(before.rev);

      const rows = await events(lessonId);
      expect(rows.map((r: { action: string }) => r.action)).toEqual([
        'SUBMIT_FOR_REVIEW',
        'APPROVE',
      ]);
      expect(rows[0]).toMatchObject({
        from_status: 'DRAFT',
        to_status: 'READY_FOR_REVIEW',
        actor_admin_id: admins.editor.id,
        actor_role: 'EDITOR',
        note: 'ready?',
        content_revision: 1,
      });
      expect(rows[1]).toMatchObject({
        actor_admin_id: admins.reviewer.id,
        actor_role: 'REVIEWER',
        note: null,
      });
      expect(rows[0].created_at).toBeInstanceOf(Date);
    });

    it('a rejected transition leaves the lesson and the history untouched', async () => {
      const lessonId = await newLesson('rejected', 'APPROVED');
      const before = await lessonRow(lessonId);
      await expect(
        workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        workflow.perform('APPROVE', lessonId, admins.reviewer),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        workflow.perform('REQUEST_CHANGES', lessonId, admins.reviewer, {
          note: 'x',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await lessonRow(lessonId)).toEqual(before);
      expect(await events(lessonId)).toEqual([]);
    });

    it('reports a missing lesson', async () => {
      await expect(
        workflow.perform('SUBMIT_FOR_REVIEW', randomUUID(), admins.editor),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('if recording the event fails, the status change is rolled back too', async () => {
      const lessonId = await newLesson('atomic');
      const before = await lessonRow(lessonId);
      const ghost: AuthenticatedAdmin = {
        id: randomUUID(),
        email: 'ghost@int-test.invalid',
        role: Role.EDITOR,
      };

      // the actor does not exist, so the event insert violates its foreign key after the status was already changed
      await expect(
        workflow.perform('SUBMIT_FOR_REVIEW', lessonId, ghost),
      ).rejects.toMatchObject({
        driverError: { code: '23503' },
      });

      expect(await lessonRow(lessonId)).toEqual(before);
      expect(await events(lessonId)).toEqual([]);
      await expect(
        workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor),
      ).resolves.toBeDefined();
    });
  });

  describe('concurrency', () => {
    it('simultaneous approvals: exactly one succeeds, one event is recorded', async () => {
      const lessonId = await newLesson('race-approve', 'READY_FOR_REVIEW');
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          workflow.perform('APPROVE', lessonId, admins.reviewer),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const failed of results.filter((r) => r.status === 'rejected')) {
        expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
      }
      expect((await lessonRow(lessonId)).status).toBe('APPROVED');
      expect(await events(lessonId)).toHaveLength(1);
    });

    it('simultaneous submissions: exactly one succeeds', async () => {
      const lessonId = await newLesson('race-submit');
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await events(lessonId)).toHaveLength(1);
    });

    it('approve against request-changes: exactly one wins and the status matches its event', async () => {
      const lessonId = await newLesson('race-mixed', 'READY_FOR_REVIEW');
      const results = await Promise.allSettled([
        workflow.perform('APPROVE', lessonId, admins.reviewer),
        workflow.perform('REQUEST_CHANGES', lessonId, admins.admin, {
          note: 'no',
        }),
        workflow.perform('APPROVE', lessonId, admins.admin),
        workflow.perform('REQUEST_CHANGES', lessonId, admins.reviewer, {
          note: 'still no',
        }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const rows = await events(lessonId);
      expect(rows).toHaveLength(1);
      expect((await lessonRow(lessonId)).status).toBe(rows[0].to_status);
    });

    it('events of a busy lesson are numbered in the order they happened', async () => {
      const lessonId = await newLesson('order');
      for (let round = 0; round < 3; round += 1) {
        await workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admins.editor);
        await workflow.perform('REQUEST_CHANGES', lessonId, admins.reviewer, {
          note: `round ${round}`,
        });
      }
      const seqs = (await events(lessonId)).map((r: { seq: string }) =>
        Number(r.seq),
      );
      expect(seqs).toHaveLength(6);
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
      expect(new Set(seqs).size).toBe(6);

      const page = await workflow.listEvents(lessonId, 4, 0);
      expect(page.total).toBe(6);
      expect(page.items.map((e) => e.seq)).toEqual(
        [...seqs].reverse().slice(0, 4),
      );
    });
  });

  describe('advisory readiness', () => {
    it('reports on a lesson without writing anything', async () => {
      const lessonId = await newLesson('readiness');
      const before = await lessonRow(lessonId);

      const report = await readiness.check(lessonId);

      expect(report.ready).toBe(false); // a new lesson has no levels
      expect(report.issues.map((i) => i.code)).toContain(
        'LESSON_HAS_NO_LEVELS',
      );
      expect(await lessonRow(lessonId)).toEqual(before);
      expect(await events(lessonId)).toEqual([]);
    });

    it('reports a missing lesson', async () => {
      await expect(readiness.check(randomUUID())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
