import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  CONTENT_STATUSES,
  ConflictError,
  type ContentStatus,
  ForbiddenError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import type { LessonsFacade } from '../../lessons/index.js';
import { ACTION_ROLES } from '../domain/roles.js';
import { NO_SEPARATION_OF_DUTIES } from '../domain/separation-of-duties.js';
import { WORKFLOW_ACTIONS, planTransition } from '../domain/workflow.js';
import type {
  NewWorkflowEvent,
  WorkflowEventRepository,
} from '../persistence/workflow-event.repository.js';
import type { WorkflowEvent } from '../domain/models.js';
import type { PublicationService } from './publication.service.js';
import {
  REVIEW_ACTIONS,
  type ReviewAction,
  WorkflowService,
} from './workflow.service.js';

// In-memory stand-ins. Real SQL, real locking and real rollback are covered by the integration tests.
interface FakeLesson {
  status: ContentStatus;
  contentRevision: number;
  version: number;
}

class World {
  lessons = new Map<string, FakeLesson>();
  events: WorkflowEvent[] = [];
  /** every call that touched the lesson row, to prove nothing but the status moves */
  statusWrites: string[] = [];
  locks: string[] = [];
  failNextAppend = false;
  /** simulates a competing transition winning the race right after the lock was granted */
  stealStatusOnNextCas: ContentStatus | null = null;

  addLesson(status: ContentStatus = 'DRAFT', contentRevision = 5) {
    const id = randomUUID();
    this.lessons.set(id, { status, contentRevision, version: 3 });
    return id;
  }
  snapshot() {
    return {
      lessons: new Map([...this.lessons].map(([id, l]) => [id, { ...l }])),
      events: [...this.events],
    };
  }
  restore(saved: ReturnType<World['snapshot']>) {
    this.lessons = saved.lessons;
    this.events = saved.events;
  }
}

function build(world = new World(), policy = NO_SEPARATION_OF_DUTIES) {
  const facade = {
    lockForWorkflow: async (id: string) => {
      const lesson = world.lessons.get(id);
      if (!lesson) throw new NotFoundError('Lesson not found');
      world.locks.push(id);
      return { id, moduleId: 'm', availableLevels: [], ...lesson };
    },
    findWorkflowState: async (id: string) => {
      const lesson = world.lessons.get(id);
      return lesson
        ? { id, moduleId: 'm', availableLevels: [], ...lesson }
        : null;
    },
    compareAndSetStatus: async (
      id: string,
      from: ContentStatus,
      to: ContentStatus,
    ) => {
      const lesson = world.lessons.get(id)!;
      if (world.stealStatusOnNextCas) {
        lesson.status = world.stealStatusOnNextCas;
        world.stealStatusOnNextCas = null;
      }
      if (lesson.status !== from) return false;
      lesson.status = to;
      world.statusWrites.push(`${from}>${to}`);
      return true;
    },
  } as unknown as LessonsFacade;

  const events = {
    append: async (event: NewWorkflowEvent) => {
      if (world.failNextAppend) {
        world.failNextAppend = false;
        throw new Error('event insert failed');
      }
      const saved: WorkflowEvent = {
        id: randomUUID(),
        seq: world.events.length + 1,
        createdAt: new Date(),
        ...event,
      };
      world.events.push(saved);
      return saved;
    },
    list: async (lessonId: string, limit: number, offset: number) => {
      const all = world.events.filter((e) => e.lessonId === lessonId).reverse();
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    latest: async (lessonId: string) =>
      [...world.events].reverse().find((e) => e.lessonId === lessonId) ?? null,
  } as unknown as WorkflowEventRepository;

  // A transaction that undoes the fake world when the work throws, like a real rollback.
  const transactions = {
    run: async (work: (m: EntityManager) => Promise<unknown>) => {
      const saved = world.snapshot();
      try {
        return await work({} as EntityManager);
      } catch (error) {
        world.restore(saved);
        throw error;
      }
    },
  } as unknown as TransactionRunner;

  return {
    world,
    service: new WorkflowService(facade, events, transactions, policy, {
      findActive: async () => null,
    } as unknown as PublicationService),
  };
}

const actor = (role: Role, id = randomUUID()): AuthenticatedAdmin => ({
  id,
  email: `${id}@example.test`,
  role,
});

/** A role that is allowed to perform the action. */
const allowedRole = (action: ReviewAction) => ACTION_ROLES[action][0];

const EXPECTED: Record<
  ReviewAction,
  { from: ContentStatus; to: ContentStatus }
> = {
  SUBMIT_FOR_REVIEW: { from: 'DRAFT', to: 'READY_FOR_REVIEW' },
  REQUEST_CHANGES: { from: 'READY_FOR_REVIEW', to: 'DRAFT' },
  APPROVE: { from: 'READY_FOR_REVIEW', to: 'APPROVED' },
};

const input = (action: ReviewAction) =>
  action === 'REQUEST_CHANGES' ? { note: 'Please fix the second block' } : {};

describe('allowed transitions', () => {
  it.each(REVIEW_ACTIONS)(
    '%s moves the status and records one event',
    async (action) => {
      const { world, service } = build();
      const { from, to } = EXPECTED[action];
      const lessonId = world.addLesson(from);
      const admin = actor(allowedRole(action));

      const result = await service.perform(
        action,
        lessonId,
        admin,
        input(action),
      );

      expect(result).toMatchObject({
        lessonId,
        fromStatus: from,
        status: to,
        contentRevision: 5,
      });
      expect(world.lessons.get(lessonId)!.status).toBe(to);
      expect(world.events).toHaveLength(1);
      expect(world.events[0]).toMatchObject({
        lessonId,
        action,
        fromStatus: from,
        toStatus: to,
        actorAdminId: admin.id,
        actorRole: admin.role,
      });
    },
  );

  it.each(REVIEW_ACTIONS)(
    '%s accepts every role the matrix allows, and records that role',
    async (action) => {
      for (const role of ACTION_ROLES[action]) {
        const { world, service } = build();
        const lessonId = world.addLesson(EXPECTED[action].from);
        await service.perform(action, lessonId, actor(role), input(action));
        expect(world.events[0].actorRole).toBe(role);
      }
    },
  );

  it('walks the whole review cycle, recording each step in order', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    const editor = actor(Role.EDITOR);
    const reviewer = actor(Role.REVIEWER);

    await service.perform('SUBMIT_FOR_REVIEW', lessonId, editor);
    await service.perform('REQUEST_CHANGES', lessonId, reviewer, {
      note: 'Not yet',
    });
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, editor);
    await service.perform('APPROVE', lessonId, reviewer);

    expect(world.lessons.get(lessonId)!.status).toBe('APPROVED');
    expect(world.events.map((e) => [e.action, e.actorAdminId])).toEqual([
      ['SUBMIT_FOR_REVIEW', editor.id],
      ['REQUEST_CHANGES', reviewer.id],
      ['SUBMIT_FOR_REVIEW', editor.id],
      ['APPROVE', reviewer.id],
    ]);
  });
});

describe('rejected transitions', () => {
  const cases = REVIEW_ACTIONS.flatMap((action) =>
    CONTENT_STATUSES.filter((status) => status !== EXPECTED[action].from).map(
      (status) => [action, status] as const,
    ),
  );

  it.each(cases)(
    '%s from %s is a 409 that names the status it needs, and writes nothing',
    async (action, status) => {
      const { world, service } = build();
      const lessonId = world.addLesson(status);

      const error = await service
        .perform(action, lessonId, actor(allowedRole(action)), input(action))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        action,
        status,
        allowedFrom: [EXPECTED[action].from],
      });
      expect(world.lessons.get(lessonId)!.status).toBe(status);
      expect(world.statusWrites).toEqual([]);
      expect(world.events).toEqual([]);
    },
  );

  it('repeating a transition that already happened is refused', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    const editor = actor(Role.EDITOR);
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, editor);
    await expect(
      service.perform('SUBMIT_FOR_REVIEW', lessonId, editor),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(world.events).toHaveLength(1);
  });

  it('agrees with the pure transition rules for every status', () => {
    for (const action of REVIEW_ACTIONS) {
      for (const status of CONTENT_STATUSES) {
        expect(planTransition(action, status, false).allowed).toBe(
          status === EXPECTED[action].from,
        );
      }
    }
  });
});

describe('role authorization', () => {
  const pairs = REVIEW_ACTIONS.flatMap((action) =>
    [Role.ADMIN, Role.EDITOR, Role.REVIEWER].map(
      (role) => [action, role] as const,
    ),
  );

  it.each(pairs)('%s by %s', async (action, role) => {
    const { world, service } = build();
    const lessonId = world.addLesson(EXPECTED[action].from);
    const attempt = service.perform(
      action,
      lessonId,
      actor(role),
      input(action),
    );

    if (ACTION_ROLES[action].includes(role)) {
      await expect(attempt).resolves.toMatchObject({
        status: EXPECTED[action].to,
      });
    } else {
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
      expect(world.lessons.get(lessonId)!.status).toBe(EXPECTED[action].from);
      expect(world.events).toEqual([]);
      expect(world.locks).toEqual([]); // refused before any lock was taken
    }
  });

  it('matches the approved matrix', () => {
    expect(ACTION_ROLES.SUBMIT_FOR_REVIEW).toEqual(['ADMIN', 'EDITOR']);
    expect(ACTION_ROLES.REQUEST_CHANGES).toEqual(['ADMIN', 'REVIEWER']);
    expect(ACTION_ROLES.APPROVE).toEqual(['ADMIN', 'REVIEWER']);
  });
});

describe('request-changes note', () => {
  it.each([undefined, null, '', '   ', '\n\t '])(
    'refuses a missing or blank note (%j)',
    async (note) => {
      const { world, service } = build();
      const lessonId = world.addLesson('READY_FOR_REVIEW');
      await expect(
        service.perform('REQUEST_CHANGES', lessonId, actor(Role.REVIEWER), {
          note,
        }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(world.lessons.get(lessonId)!.status).toBe('READY_FOR_REVIEW');
      expect(world.events).toEqual([]);
    },
  );

  it('stores the note trimmed, with normalised line endings', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('READY_FOR_REVIEW');
    await service.perform('REQUEST_CHANGES', lessonId, actor(Role.REVIEWER), {
      note: '  Fix block 2.\r\nAlso the title.  ',
    });
    expect(world.events[0].note).toBe('Fix block 2.\nAlso the title.');
  });

  it('rejects an over-long note and a NUL character, never truncating', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('READY_FOR_REVIEW');
    for (const note of ['x'.repeat(2001), 'bad\u0000note']) {
      await expect(
        service.perform('REQUEST_CHANGES', lessonId, actor(Role.REVIEWER), {
          note,
        }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    }
    expect(world.events).toEqual([]);
    expect(
      await service.perform('REQUEST_CHANGES', lessonId, actor(Role.REVIEWER), {
        note: 'x'.repeat(2000),
      }),
    ).toMatchObject({ status: 'DRAFT' });
  });

  it('notes are optional for submit and approve; a blank one is stored as none', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR), {
      note: '   ',
    });
    await service.perform('APPROVE', lessonId, actor(Role.REVIEWER), {
      note: 'Looks good',
    });
    expect(world.events.map((e) => e.note)).toEqual([null, 'Looks good']);
  });
});

describe('events record who did what, at which revision', () => {
  it("stores the lesson's content revision at the time", async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT', 12);
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.ADMIN));
    expect(world.events[0].contentRevision).toBe(12);
  });

  it('the same person may submit and approve (policy S0), and both are recorded', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    const admin = actor(Role.ADMIN);
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, admin);
    await service.perform('APPROVE', lessonId, admin);
    expect(world.events.map((e) => e.actorAdminId)).toEqual([
      admin.id,
      admin.id,
    ]);
  });

  it('shows earlier events to the separation-of-duties policy, and a stricter policy would be honoured', async () => {
    const seen: string[][] = [];
    const strict = (c: {
      action: string;
      actorId: string;
      priorEvents: { action: string; actorId: string }[];
    }) => {
      seen.push(c.priorEvents.map((e) => e.action));
      return c.action === 'APPROVE' &&
        c.priorEvents.some((e) => e.actorId === c.actorId)
        ? 'The person who submitted cannot approve'
        : null;
    };
    const { world, service } = build(new World(), strict as never);
    const lessonId = world.addLesson('DRAFT');
    const alice = actor(Role.ADMIN);
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, alice);
    await expect(
      service.perform('APPROVE', lessonId, alice),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(world.lessons.get(lessonId)!.status).toBe('READY_FOR_REVIEW');
    await expect(
      service.perform('APPROVE', lessonId, actor(Role.REVIEWER)),
    ).resolves.toMatchObject({
      status: 'APPROVED',
    });
    expect(seen[1]).toEqual(['SUBMIT_FOR_REVIEW']);
  });
});

describe('atomicity and races', () => {
  it('if recording the event fails, the status change is undone and nothing is recorded', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    world.failNextAppend = true;

    await expect(
      service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR)),
    ).rejects.toThrow('event insert failed');

    expect(world.statusWrites).toEqual(['DRAFT>READY_FOR_REVIEW']); // the CAS did run first
    expect(world.lessons.get(lessonId)!.status).toBe('DRAFT'); // ...and was rolled back
    expect(world.events).toEqual([]);

    // and the lesson is not stuck: the same request now succeeds
    await expect(
      service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR)),
    ).resolves.toBeDefined();
  });

  it('a lost compare-and-set records no event and is a 409', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('READY_FOR_REVIEW');
    world.stealStatusOnNextCas = 'APPROVED';

    await expect(
      service.perform('APPROVE', lessonId, actor(Role.REVIEWER)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(world.events).toEqual([]);
  });

  it('locks the lesson before reading its status', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));
    expect(world.locks).toEqual([lessonId]);
  });

  it('only touches the status: no version or revision write exists in the path', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT', 9);
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));
    await service.perform('APPROVE', lessonId, actor(Role.REVIEWER));
    expect(world.lessons.get(lessonId)).toEqual({
      status: 'APPROVED',
      contentRevision: 9,
      version: 3,
    });
    expect(world.statusWrites).toEqual([
      'DRAFT>READY_FOR_REVIEW',
      'READY_FOR_REVIEW>APPROVED',
    ]);
  });
});

describe('stale and missing', () => {
  it('refuses a stale expected content revision, naming the current one', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT', 5);
    const error = await service
      .perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR), {
        expectedContentRevision: 4,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toEqual({
      currentContentRevision: 5,
    });
    expect(world.events).toEqual([]);
    expect(world.lessons.get(lessonId)!.status).toBe('DRAFT');
  });

  it('accepts the current revision', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT', 5);
    await expect(
      service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR), {
        expectedContentRevision: 5,
      }),
    ).resolves.toBeDefined();
  });

  it('reports a missing lesson as 404, for actions, state and history', async () => {
    const { service } = build();
    for (const action of REVIEW_ACTIONS) {
      await expect(
        service.perform(
          action,
          randomUUID(),
          actor(allowedRole(action)),
          input(action),
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(
      service.getState(randomUUID(), Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.listEvents(randomUUID(), 10, 0),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('reading workflow information', () => {
  it('lists only the actions the caller may perform now', async () => {
    const { world, service } = build();
    const draft = world.addLesson('DRAFT');
    const inReview = world.addLesson('READY_FOR_REVIEW');
    const approved = world.addLesson('APPROVED');

    expect((await service.getState(draft, Role.EDITOR)).allowedActions).toEqual(
      ['SUBMIT_FOR_REVIEW'],
    );
    expect(
      (await service.getState(draft, Role.REVIEWER)).allowedActions,
    ).toEqual([]);
    expect(
      (await service.getState(inReview, Role.REVIEWER)).allowedActions,
    ).toEqual(['REQUEST_CHANGES', 'APPROVE']);
    expect(
      (await service.getState(inReview, Role.EDITOR)).allowedActions,
    ).toEqual([]);
    expect(
      (await service.getState(inReview, Role.ADMIN)).allowedActions,
    ).toEqual(['REQUEST_CHANGES', 'APPROVE']);
    expect(
      (await service.getState(approved, Role.ADMIN)).allowedActions,
    ).toEqual(['PUBLISH']);
    for (const role of [Role.EDITOR, Role.REVIEWER]) {
      expect((await service.getState(approved, role)).allowedActions).toEqual(
        [],
      );
    }
  });

  it('offers publish only to an ADMIN on an approved lesson, and never unpublish without an active publication', async () => {
    const { world, service } = build();
    for (const status of CONTENT_STATUSES) {
      const lessonId = world.addLesson(status);
      for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
        const { allowedActions } = await service.getState(lessonId, role);
        expect(allowedActions.includes('PUBLISH')).toBe(
          role === Role.ADMIN && status === 'APPROVED',
        );
        expect(allowedActions).not.toContain('UNPUBLISH'); // nothing is published in this world
      }
    }
    expect(WORKFLOW_ACTIONS).toContain('PUBLISH');
  });

  it('returns the state with the latest event, and history newest first with paging', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));
    await service.perform('REQUEST_CHANGES', lessonId, actor(Role.REVIEWER), {
      note: 'no',
    });
    await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));

    const state = await service.getState(lessonId, Role.ADMIN);
    expect(state).toMatchObject({
      status: 'READY_FOR_REVIEW',
      latestEvent: { action: 'SUBMIT_FOR_REVIEW', seq: 3 },
    });

    const page = await service.listEvents(lessonId, 2, 0);
    expect(page.total).toBe(3);
    expect(page.items.map((e) => e.seq)).toEqual([3, 2]);
    expect(
      (await service.listEvents(lessonId, 2, 2)).items.map((e) => e.seq),
    ).toEqual([1]);
  });

  it('a lesson with no history has no latest event', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('DRAFT');
    expect(
      (await service.getState(lessonId, Role.ADMIN)).latestEvent,
    ).toBeNull();
  });
});
