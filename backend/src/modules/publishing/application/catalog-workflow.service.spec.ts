import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  CONTENT_STATUSES,
  ConflictError,
  type ContentStatus,
  ForbiddenError,
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type {
  CourseWorkflowRef,
  CurriculumFacade,
  ModuleWorkflowRef,
} from '../../curriculum/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import type { LessonsFacade } from '../../lessons/index.js';
import type {
  CatalogLevelContent,
  LessonSummary,
} from '../domain/catalog-snapshot.js';
import type {
  CatalogPublication,
  CatalogWorkflowEvent,
} from '../domain/models.js';
import { NO_SEPARATION_OF_DUTIES } from '../domain/separation-of-duties.js';
import { WORKFLOW_ACTIONS } from '../domain/workflow.js';
import type { CatalogEventRepository } from '../persistence/catalog-event.repository.js';
import type { CatalogPublicationRepository } from '../persistence/catalog-publication.repository.js';
import type { PublicationRepository } from '../persistence/publication.repository.js';
import { CatalogPublicationService } from './catalog-publication.service.js';
import { CatalogWorkflowService } from './catalog-workflow.service.js';

// Course and module workflow with in-memory stand-ins (the real services and the real snapshot rules).
// Real SQL, constraints, triggers, locking and rollback are covered by the integration tests.

interface FakeModule extends ModuleWorkflowRef {
  courseId: string;
}

class World {
  course: CourseWorkflowRef;
  modules: FakeModule[] = [];
  /** lesson order: module id -> lesson ids in order */
  lessonOrder = new Map<string, string[]>();
  /** lesson id -> level -> published summary */
  published = new Map<string, Map<LearningLevel, LessonSummary>>();
  publications: CatalogPublication[] = [];
  levels = new Map<string, Set<LearningLevel>>();
  contents = new Map<string, Map<LearningLevel, CatalogLevelContent>>();
  events: CatalogWorkflowEvent[] = [];
  statusWrites: string[] = [];
  locks: string[] = [];
  failNextAppend = false;
  runOptions: ({ lockTimeoutMs?: number } | undefined)[] = [];

  constructor(status: ContentStatus = 'APPROVED') {
    this.course = {
      id: randomUUID(),
      title: 'Course',
      description: 'about',
      status,
      version: 4,
    };
  }

  addModule(
    status: ContentStatus = 'APPROVED',
    lessons: string[] = [],
    publishAt: LearningLevel[] = ['BEGINNER'],
  ) {
    const module: FakeModule = {
      id: randomUUID(),
      courseId: this.course.id,
      title: `Module ${this.modules.length + 1}`,
      description: null,
      status,
      version: 2,
      position: this.modules.length + 1,
    };
    this.modules.push(module);
    this.lessonOrder.set(module.id, lessons);
    for (const id of lessons) this.publishLesson(id, publishAt);
    return module;
  }

  publishLesson(id: string, levels: LearningLevel[] = ['BEGINNER']) {
    this.published.set(
      id,
      new Map(
        levels.map((level) => [
          level,
          {
            title: `Lesson ${id}`,
            shortTitle: null,
            subtitle: null,
            estimatedMinutes: 5,
          },
        ]),
      ),
    );
  }

  withdrawLesson(id: string) {
    this.published.delete(id);
  }

  active() {
    return this.publications.find((p) => p.endedAt === null);
  }

  moduleById(id: string) {
    return this.modules.find((m) => m.id === id)!;
  }

  saved() {
    return structuredClone({
      course: this.course,
      modules: this.modules,
      publications: this.publications,
      levels: [...this.levels].map(([k, v]) => [k, [...v]]),
      contents: [...this.contents],
      events: this.events,
      statusWrites: this.statusWrites,
    });
  }

  restore(saved: ReturnType<World['saved']>) {
    this.course = saved.course;
    this.modules = saved.modules;
    this.publications = saved.publications;
    this.levels = new Map(
      saved.levels.map(([k, v]) => [
        k as string,
        new Set(v as LearningLevel[]),
      ]),
    );
    this.contents = new Map(saved.contents);
    this.events = saved.events;
    this.statusWrites = saved.statusWrites;
  }
}

function build(world: World) {
  const curriculum = {
    lockCourseForWorkflow: async (id: string) => {
      if (id !== world.course.id) throw new NotFoundError('Course not found');
      world.locks.push(`course:${id}`);
      return { ...world.course };
    },
    lockModuleForWorkflow: async (id: string) => {
      const module = world.modules.find((m) => m.id === id);
      if (!module) throw new NotFoundError('Module not found');
      world.locks.push(`module:${id}`);
      return { ...module };
    },
    findCourseForWorkflow: async (id: string) =>
      id === world.course.id ? { ...world.course } : null,
    findModuleForWorkflow: async (id: string) => {
      const module = world.modules.find((m) => m.id === id);
      return module ? { ...module } : null;
    },
    listModules: async () =>
      world.modules
        .map((m) => ({ ...m }))
        .sort((a, b) => a.position - b.position),
    compareAndSetCourseStatus: async (
      _id: string,
      from: ContentStatus,
      to: ContentStatus,
    ) => {
      if (world.course.status !== from) return false;
      world.course.status = to;
      world.statusWrites.push(`course ${from}>${to}`);
      return true;
    },
    compareAndSetModuleStatus: async (
      id: string,
      from: ContentStatus,
      to: ContentStatus,
    ) => {
      const module = world.moduleById(id);
      if (module.status !== from) return false;
      module.status = to;
      world.statusWrites.push(`module ${from}>${to}`);
      return true;
    },
  } as unknown as CurriculumFacade;

  const lessons = {
    listLessonPlacements: async (moduleIds: string[]) =>
      moduleIds.flatMap((moduleId) =>
        (world.lessonOrder.get(moduleId) ?? []).map((lessonId) => ({
          lessonId,
          moduleId,
          position: 0,
        })),
      ),
  } as unknown as LessonsFacade;

  const lessonPublications = {
    findActiveSummaries: async (ids: string[]) =>
      new Map(
        ids
          .filter((id) => world.published.has(id))
          .map((id) => [id, world.published.get(id)!]),
      ),
  } as unknown as PublicationRepository;

  const catalog = {
    findActive: async () => structuredClone(world.active()) ?? null,
    findLatest: async () =>
      structuredClone(
        [...world.publications].sort((a, b) => b.version - a.version)[0],
      ) ?? null,
    nextVersion: async () =>
      Math.max(0, ...world.publications.map((p) => p.version)) + 1,
    endActive: async (
      _courseId: string,
      reason: 'SUPERSEDED' | 'UNPUBLISHED',
      adminId: string,
    ) => {
      const active = world.active();
      if (!active) return null;
      active.endedAt = new Date();
      active.endedBy = adminId;
      active.endedReason = reason;
      return structuredClone(active);
    },
    insert: async (
      p: Omit<
        CatalogPublication,
        | 'id'
        | 'publishedAt'
        | 'endedAt'
        | 'endedBy'
        | 'endedReason'
        | 'modules'
        | 'levels'
      >,
    ) => {
      const id = randomUUID();
      world.publications.push({
        ...p,
        id,
        publishedAt: new Date(),
        endedAt: null,
        endedBy: null,
        endedReason: null,
        modules: [],
        levels: [],
      });
      return id;
    },
    insertModules: async (
      id: string,
      _c: string,
      modules: CatalogPublication['modules'],
    ) => {
      world.publications.find((p) => p.id === id)!.modules = modules;
    },
    insertLevels: async (
      id: string,
      _c: string,
      levels: {
        level: LearningLevel;
        hash: string;
        bytes: number;
        json: string;
      }[],
    ) => {
      world.contents.set(
        id,
        new Map(levels.map((l) => [l.level, JSON.parse(l.json)])),
      );
      const publication = world.publications.find((p) => p.id === id)!;
      publication.levels = levels.map((l) => ({
        level: l.level,
        contentHash: l.hash,
        contentBytes: l.bytes,
      }));
      world.levels.set(id, new Set(levels.map((l) => l.level)));
    },
    get: async (id: string) =>
      structuredClone(world.publications.find((p) => p.id === id)!),
    findLevelContents: async (id: string) =>
      structuredClone(world.contents.get(id) ?? new Map()),
  } as unknown as CatalogPublicationRepository;

  const events = {
    append: async (
      event: Omit<CatalogWorkflowEvent, 'id' | 'seq' | 'createdAt'>,
    ) => {
      if (world.failNextAppend) {
        world.failNextAppend = false;
        throw new Error('event insert failed');
      }
      const saved: CatalogWorkflowEvent = {
        id: randomUUID(),
        seq: world.events.length + 1,
        createdAt: new Date(),
        ...event,
      };
      world.events.push(saved);
      return saved;
    },
    list: async (_c: string, moduleId: string | null) => {
      const all = world.events.filter((e) => e.moduleId === moduleId).reverse();
      return { items: all, total: all.length };
    },
    latest: async (_c: string, moduleId: string | null) =>
      [...world.events].reverse().find((e) => e.moduleId === moduleId) ?? null,
  } as unknown as CatalogEventRepository;

  const transactions = {
    run: async (
      work: (m: EntityManager) => Promise<unknown>,
      options?: { lockTimeoutMs?: number },
    ) => {
      world.runOptions.push(options);
      const saved = world.saved();
      try {
        return await work({} as EntityManager);
      } catch (error) {
        world.restore(saved);
        throw error;
      }
    },
  } as unknown as TransactionRunner;

  const publications = new CatalogPublicationService(
    curriculum,
    lessons,
    lessonPublications,
    catalog,
    events,
  );
  return new CatalogWorkflowService(
    curriculum,
    catalog,
    publications,
    events,
    transactions,
    NO_SEPARATION_OF_DUTIES,
  );
}

const actor = (role: Role): AuthenticatedAdmin => ({
  id: randomUUID(),
  email: 'a@example.test',
  role,
});
const admin = () => actor(Role.ADMIN);

function setup(courseStatus: ContentStatus = 'APPROVED') {
  const world = new World(courseStatus);
  return { world, service: build(world) };
}

describe('course workflow', () => {
  it('runs submit, request changes, resubmit, approve, publish with actors and events recorded', async () => {
    const { world, service } = setup('DRAFT');
    world.addModule('APPROVED', ['l1']);
    const course = { courseId: world.course.id };
    const editor = actor(Role.EDITOR);
    const reviewer = actor(Role.REVIEWER);

    await service.perform(course, 'SUBMIT_FOR_REVIEW', editor);
    await service.perform(course, 'REQUEST_CHANGES', reviewer, {
      note: 'tighten it',
    });
    await service.perform(course, 'SUBMIT_FOR_REVIEW', editor);
    await service.perform(course, 'APPROVE', reviewer);
    const published = await service.perform(course, 'PUBLISH', admin());

    expect(published).toMatchObject({
      fromStatus: 'APPROVED',
      status: 'PUBLISHED',
      moduleId: null,
    });
    expect(world.course.status).toBe('PUBLISHED');
    expect(world.events.map((e) => [e.action, e.actorRole])).toEqual([
      ['SUBMIT_FOR_REVIEW', 'EDITOR'],
      ['REQUEST_CHANGES', 'REVIEWER'],
      ['SUBMIT_FOR_REVIEW', 'EDITOR'],
      ['APPROVE', 'REVIEWER'],
      ['PUBLISH', 'ADMIN'], // for the module, then the course
      ['PUBLISH', 'ADMIN'],
    ]);
    expect(world.events[1]).toMatchObject({
      note: 'tighten it',
      moduleId: null,
    });
    expect(world.events.every((e) => e.courseId === world.course.id)).toBe(
      true,
    );
  });

  it('asks the runner for the 10 second lock timeout on every transition', async () => {
    const { world, service } = setup('DRAFT');
    await service.perform(
      { courseId: world.course.id },
      'SUBMIT_FOR_REVIEW',
      actor(Role.EDITOR),
    );
    expect(world.runOptions).toEqual([{ lockTimeoutMs: 10_000 }]);
  });

  describe('permissions (the lesson role matrix)', () => {
    const allowed: Record<string, Role[]> = {
      SUBMIT_FOR_REVIEW: [Role.ADMIN, Role.EDITOR],
      REQUEST_CHANGES: [Role.ADMIN, Role.REVIEWER],
      APPROVE: [Role.ADMIN, Role.REVIEWER],
      PUBLISH: [Role.ADMIN],
      UNPUBLISH: [Role.ADMIN],
    };
    for (const action of WORKFLOW_ACTIONS) {
      for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
        if (allowed[action].includes(role)) continue;
        it(`${role} may not ${action}: refused before any lock, nothing changes`, async () => {
          const { world, service } = setup('APPROVED');
          const before = world.saved();
          await expect(
            service.perform(
              { courseId: world.course.id },
              action,
              actor(role),
              { note: 'x' },
            ),
          ).rejects.toBeInstanceOf(ForbiddenError);
          expect(world.locks).toEqual([]);
          expect(world.saved()).toEqual(before);
        });
      }
    }
  });

  it('refuses invalid transitions with the statuses that would be allowed, writing nothing', async () => {
    const cases: [ContentStatus, (typeof WORKFLOW_ACTIONS)[number], Role][] = [
      ['DRAFT', 'APPROVE', Role.REVIEWER],
      ['DRAFT', 'REQUEST_CHANGES', Role.REVIEWER],
      ['DRAFT', 'PUBLISH', Role.ADMIN],
      ['READY_FOR_REVIEW', 'SUBMIT_FOR_REVIEW', Role.EDITOR],
      ['READY_FOR_REVIEW', 'PUBLISH', Role.ADMIN],
      ['APPROVED', 'SUBMIT_FOR_REVIEW', Role.EDITOR],
      ['APPROVED', 'APPROVE', Role.REVIEWER],
      ['PUBLISHED', 'PUBLISH', Role.ADMIN],
    ];
    for (const [status, action, role] of cases) {
      const { world, service } = setup(status);
      world.addModule('APPROVED', ['l1']);
      const before = world.saved();
      const error = await service
        .perform({ courseId: world.course.id }, action, actor(role), {
          note: 'x',
        })
        .catch((e: unknown) => e);
      expect(error, `${status} ${action}`).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toMatchObject({
        action,
        status,
      });
      expect(world.saved(), `${status} ${action}`).toEqual(before);
    }
  });

  it('refuses to unpublish a course that is not published', async () => {
    const { world, service } = setup('APPROVED');
    await expect(
      service.perform({ courseId: world.course.id }, 'UNPUBLISH', admin()),
    ).rejects.toThrow('not published');
    expect(world.events).toEqual([]);
  });

  it('requires a note to request changes and refuses a stale expected version', async () => {
    const { world, service } = setup('READY_FOR_REVIEW');
    const course = { courseId: world.course.id };
    await expect(
      service.perform(course, 'REQUEST_CHANGES', actor(Role.REVIEWER), {
        note: '   ',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      service.perform(course, 'APPROVE', actor(Role.REVIEWER), {
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ details: { currentVersion: 4 } });
    expect(world.events).toEqual([]);
    await expect(
      service.perform(course, 'APPROVE', actor(Role.REVIEWER), {
        expectedVersion: 4,
      }),
    ).resolves.toBeDefined();
  });

  it('reports an unknown course, and a module of another course as not found', async () => {
    const { world, service } = setup('APPROVED');
    await expect(
      service.perform({ courseId: randomUUID() }, 'SUBMIT_FOR_REVIEW', admin()),
    ).rejects.toBeInstanceOf(NotFoundError);
    const foreign = world.addModule();
    foreign.courseId = randomUUID();
    await expect(
      service.perform(
        { courseId: world.course.id, moduleId: foreign.id },
        'SUBMIT_FOR_REVIEW',
        admin(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('publishing a course', () => {
  it('publishes a version with its approved modules, in order, and publishes those modules too', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a', 'b']);
    const m2 = world.addModule('PUBLISHED', ['c']);
    const draft = world.addModule('DRAFT', ['d']);
    const review = world.addModule('READY_FOR_REVIEW', []);

    const result = await service.perform(
      { courseId: world.course.id },
      'PUBLISH',
      admin(),
    );

    expect(result.publication).toMatchObject({
      version: 1,
      cause: 'COURSE_PUBLISH',
      courseTitle: 'Course',
      sourceCourseVersion: 4,
    });
    expect(
      result.publication!.modules.map((m) => [m.moduleId, m.position]),
    ).toEqual([
      [m1.id, 1],
      [m2.id, 2],
    ]);
    expect(result.publication!.levels.map((l) => l.level)).toEqual([
      'BEGINNER',
    ]);
    expect(result.modulesPublished).toEqual([m1.id]);
    expect(result.modulesNotIncluded).toEqual([
      { moduleId: draft.id, status: 'DRAFT', reason: 'NOT_APPROVED' },
      {
        moduleId: review.id,
        status: 'READY_FOR_REVIEW',
        reason: 'NOT_APPROVED',
      },
    ]);
    expect(world.moduleById(m1.id).status).toBe('PUBLISHED');
    expect(world.moduleById(draft.id).status).toBe('DRAFT');
    // one event per published module (APPROVED -> PUBLISHED), then the course's own
    expect(
      world.events.map((e) => [
        e.moduleId,
        e.fromStatus,
        e.toStatus,
        e.publicationId,
      ]),
    ).toEqual([
      [m1.id, 'APPROVED', 'PUBLISHED', result.publication!.id],
      [null, 'APPROVED', 'PUBLISHED', result.publication!.id],
    ]);
  });

  it('locks the course first, then each module in order', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a']);
    const m2 = world.addModule('APPROVED', ['b']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    expect(world.locks).toEqual([
      `course:${world.course.id}`,
      `module:${m1.id}`,
      `module:${m2.id}`,
    ]);
  });

  it('includes only lessons that have a published snapshot at the level, per level', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a'], ['BEGINNER', 'ADVANCED']);
    world.addModule('APPROVED', ['b'], ['BEGINNER']);
    const result = await service.perform(
      { courseId: world.course.id },
      'PUBLISH',
      admin(),
    );
    expect(result.publication!.levels.map((l) => l.level)).toEqual([
      'BEGINNER',
      'ADVANCED',
    ]);
  });

  it('refuses a catalog with no published lesson (422, with the report) and writes nothing', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    world.withdrawLesson('a'); // the module is approved but nothing in it is published
    const before = world.saved();
    const error = await service
      .perform({ courseId: world.course.id }, 'PUBLISH', admin())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).details).toMatchObject({
      report: { ready: false, issues: [{ code: 'NO_PUBLISHED_LESSONS' }] },
    });
    expect(world.saved()).toEqual(before);
  });

  it('does not touch lesson publications: it only reads them', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    const before = structuredClone([...world.published]);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    expect([...world.published]).toEqual(before);
  });

  it('rolls everything back when the event cannot be recorded', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    const before = world.saved();
    world.failNextAppend = true;
    await expect(
      service.perform({ courseId: world.course.id }, 'PUBLISH', admin()),
    ).rejects.toThrow('event insert failed');
    expect(world.saved()).toEqual(before);
    expect(world.active()).toBeUndefined();
    await expect(
      service.perform({ courseId: world.course.id }, 'PUBLISH', admin()),
    ).resolves.toMatchObject({ publication: { version: 1 } });
  });

  it('a second publish of a published course is a refresh: a new version, not a second active one', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    const refreshed = await service.perform(
      { courseId: world.course.id },
      'PUBLISH',
      admin(),
    );
    expect(refreshed).toMatchObject({
      fromStatus: 'PUBLISHED',
      status: 'PUBLISHED',
    });
    expect(world.publications.map((p) => p.version)).toEqual([1, 2]);
    expect(world.publications.filter((p) => p.endedAt === null)).toHaveLength(
      1,
    );
    expect(world.publications[0].endedReason).toBe('SUPERSEDED');
  });
});

describe('module workflow and catalog versions', () => {
  async function publishedCourse() {
    const ctx = setup('APPROVED');
    const m1 = ctx.world.addModule('APPROVED', ['a']);
    const m2 = ctx.world.addModule('DRAFT', ['b']);
    await ctx.service.perform(
      { courseId: ctx.world.course.id },
      'PUBLISH',
      admin(),
    );
    return { ...ctx, m1, m2 };
  }

  it('cannot publish a module while its course is not published', async () => {
    const { world, service } = setup('APPROVED');
    const module = world.addModule('APPROVED', ['a']);
    const error = await service
      .perform(
        { courseId: world.course.id, moduleId: module.id },
        'PUBLISH',
        admin(),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).details).toMatchObject({
      reason: 'COURSE_NOT_PUBLISHED',
    });
    expect(world.publications).toEqual([]);
    expect(
      (
        await service.getState(
          { courseId: world.course.id, moduleId: module.id },
          Role.ADMIN,
        )
      ).allowedActions,
    ).toEqual([]);
  });

  it('publishing an approved module creates a new version that adds it and carries the rest over', async () => {
    const { world, service, m1, m2 } = await publishedCourse();
    // the course title is edited in the working copy after publishing: it must not leak into the next version
    world.course.title = 'Unapproved new title';
    world.course.status = 'DRAFT';
    world.moduleById(m2.id).status = 'APPROVED';
    world.moduleById(m2.id).title = 'Module two, approved';

    const result = await service.perform(
      { courseId: world.course.id, moduleId: m2.id },
      'PUBLISH',
      admin(),
    );

    expect(result).toMatchObject({
      moduleId: m2.id,
      fromStatus: 'APPROVED',
      status: 'PUBLISHED',
      supersededPublication: { version: 1 },
    });
    expect(result.publication).toMatchObject({
      version: 2,
      cause: 'MODULE_PUBLISH',
      courseTitle: 'Course',
    });
    expect(
      result.publication!.modules.map((m) => [m.moduleId, m.title]),
    ).toEqual([
      [m1.id, 'Module 1'],
      [m2.id, 'Module two, approved'],
    ]);
    expect(world.publications.map((p) => [p.version, p.endedReason])).toEqual([
      [1, 'SUPERSEDED'],
      [2, null],
    ]);
    expect(world.events.at(-1)).toMatchObject({
      moduleId: m2.id,
      action: 'PUBLISH',
      publicationId: result.publication!.id,
    });
    expect(world.course.status).toBe('DRAFT'); // a module action never moves the course's own status
  });

  it('an edited module keeps its older published entry when another module is published, and when the course is republished', async () => {
    const { world, service, m1 } = await publishedCourse();
    world.moduleById(m1.id).status = 'DRAFT'; // edited after publishing
    world.moduleById(m1.id).title = 'Unapproved edit';
    const other = world.addModule('APPROVED', ['c']);

    const viaModule = await service.perform(
      { courseId: world.course.id, moduleId: other.id },
      'PUBLISH',
      admin(),
    );
    expect(
      viaModule.publication!.modules.find((m) => m.moduleId === m1.id)!.title,
    ).toBe('Module 1');

    // withdraw the whole course, approve it again and republish: the edited module is still carried, unchanged
    await service.perform({ courseId: world.course.id }, 'UNPUBLISH', admin());
    world.course.status = 'APPROVED';
    const again = await service.perform(
      { courseId: world.course.id },
      'PUBLISH',
      admin(),
    );
    expect(
      again.publication!.modules.find((m) => m.moduleId === m1.id)!.title,
    ).toBe('Module 1');
    expect(again.publication!.version).toBe(3); // 1 course, 2 module, (the course unpublish makes none), 3 republish
  });

  it('unpublishing a module creates a version without it and moves PUBLISHED to APPROVED', async () => {
    const { world, service, m1 } = await publishedCourse();
    const result = await service.perform(
      { courseId: world.course.id, moduleId: m1.id },
      'UNPUBLISH',
      admin(),
    );
    expect(result).toMatchObject({
      fromStatus: 'PUBLISHED',
      status: 'APPROVED',
    });
    expect(result.publication).toMatchObject({
      version: 2,
      cause: 'MODULE_UNPUBLISH',
    });
    expect(result.publication!.modules.map((m) => m.moduleId)).not.toContain(
      m1.id,
    );
    expect(world.moduleById(m1.id).status).toBe('APPROVED');
    expect(world.course.status).toBe('PUBLISHED');
  });

  it('unpublishing the last module is allowed (withdrawal is never blocked by readiness)', async () => {
    const { world, service, m1 } = await publishedCourse();
    const result = await service.perform(
      { courseId: world.course.id, moduleId: m1.id },
      'UNPUBLISH',
      admin(),
    );
    expect(result.publication!.modules).toEqual([]);
    expect(result.publication!.levels).toEqual([]);
  });

  it('refuses to unpublish a module that is not in the active version', async () => {
    const { world, service, m2 } = await publishedCourse();
    await expect(
      service.perform(
        { courseId: world.course.id, moduleId: m2.id },
        'UNPUBLISH',
        admin(),
      ),
    ).rejects.toThrow('not published');
    expect(world.publications).toHaveLength(1);
  });

  it('a module edited to DRAFT can still be unpublished: the status is preserved and not written', async () => {
    const { world, service, m1 } = await publishedCourse();
    world.moduleById(m1.id).status = 'DRAFT';
    world.statusWrites.length = 0;
    const result = await service.perform(
      { courseId: world.course.id, moduleId: m1.id },
      'UNPUBLISH',
      admin(),
    );
    expect(result).toMatchObject({ fromStatus: 'DRAFT', status: 'DRAFT' });
    expect(world.statusWrites).toEqual([]);
  });

  it('unpublishing the course ends the active version, creates no new one, and leaves module statuses alone', async () => {
    const { world, service, m1 } = await publishedCourse();
    const result = await service.perform(
      { courseId: world.course.id },
      'UNPUBLISH',
      admin(),
    );
    expect(result).toMatchObject({
      fromStatus: 'PUBLISHED',
      status: 'APPROVED',
      publication: { version: 1, endedReason: 'UNPUBLISHED' },
    });
    expect(world.publications).toHaveLength(1);
    expect(world.active()).toBeUndefined();
    expect(world.moduleById(m1.id).status).toBe('PUBLISHED');
  });

  it('republishing after a course unpublish restores access as a new version', async () => {
    const { world, service, m1 } = await publishedCourse();
    await service.perform({ courseId: world.course.id }, 'UNPUBLISH', admin());
    world.course.status = 'APPROVED'; // approved again after review
    const again = await service.perform(
      { courseId: world.course.id },
      'PUBLISH',
      admin(),
    );
    expect(again.publication).toMatchObject({ version: 2 });
    expect(again.publication!.modules.map((m) => m.moduleId)).toContain(m1.id);
  });

  it('versions are never reused across many publish/unpublish cycles', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    for (let i = 0; i < 3; i += 1) {
      world.course.status = 'APPROVED';
      await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
      await service.perform(
        { courseId: world.course.id },
        'UNPUBLISH',
        admin(),
      );
    }
    expect(world.publications.map((p) => p.version)).toEqual([1, 2, 3]);
  });
});

describe('workflow state', () => {
  it('offers only what applies: module publish needs a published course; course unpublish needs a publication', async () => {
    const { world, service } = setup('APPROVED');
    const module = world.addModule('APPROVED', ['a']);
    expect(
      (await service.getState({ courseId: world.course.id }, Role.ADMIN))
        .allowedActions,
    ).toEqual(['PUBLISH']);
    expect(
      (
        await service.getState(
          { courseId: world.course.id, moduleId: module.id },
          Role.ADMIN,
        )
      ).allowedActions,
    ).toEqual([]);

    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    const course = await service.getState(
      { courseId: world.course.id },
      Role.ADMIN,
    );
    expect(course).toMatchObject({
      status: 'PUBLISHED',
      published: true,
      allowedActions: ['PUBLISH', 'UNPUBLISH'],
    });
    const mod = await service.getState(
      { courseId: world.course.id, moduleId: module.id },
      Role.ADMIN,
    );
    expect(mod).toMatchObject({
      status: 'PUBLISHED',
      published: true,
      allowedActions: ['PUBLISH', 'UNPUBLISH'],
    });
    expect(
      (await service.getState({ courseId: world.course.id }, Role.EDITOR))
        .allowedActions,
    ).toEqual([]);
  });

  it('lists events newest first, separately for the course and each module', async () => {
    const { world, service } = setup('DRAFT');
    const module = world.addModule('DRAFT', []);
    await service.perform(
      { courseId: world.course.id },
      'SUBMIT_FOR_REVIEW',
      admin(),
    );
    await service.perform(
      { courseId: world.course.id, moduleId: module.id },
      'SUBMIT_FOR_REVIEW',
      admin(),
    );
    const courseEvents = await service.listEvents(
      { courseId: world.course.id },
      10,
      0,
    );
    const moduleEvents = await service.listEvents(
      { courseId: world.course.id, moduleId: module.id },
      10,
      0,
    );
    expect(courseEvents.items.map((e) => e.moduleId)).toEqual([null]);
    expect(moduleEvents.items.map((e) => e.moduleId)).toEqual([module.id]);
  });

  it('knows every status for the transitions it refuses (no status is missing from the matrix)', () => {
    expect(CONTENT_STATUSES).toHaveLength(4);
  });
});

/** The lesson ids of the module entries of a stored version, at one level, in published order. */
function published(
  world: World,
  version: number,
  level: LearningLevel = 'BEGINNER',
) {
  const publication = world.publications.find((p) => p.version === version)!;
  const content = world.contents.get(publication.id)?.get(level);
  return (content?.modules ?? []).map((m) => ({
    id: m.id,
    lessons: m.lessons.map((l) => l.id),
  }));
}

describe('catalog refresh (a new version from approved current data, without an outage)', () => {
  it('adds a lesson published after the version, keeps the old version unchanged, and never ends delivery', async () => {
    const { world, service } = setup('APPROVED');
    const m = world.addModule('APPROVED', ['a']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    world.lessonOrder.set(m.id, ['a', 'b']);
    world.publishLesson('b');

    const before = structuredClone(published(world, 1));
    const result = await service.perform(
      { courseId: world.course.id },
      'PUBLISH',
      admin(),
    );

    expect(result.publication).toMatchObject({
      version: 2,
      cause: 'COURSE_PUBLISH',
    });
    expect(result.supersededPublication).toMatchObject({ version: 1 });
    expect(published(world, 2)).toEqual([{ id: m.id, lessons: ['a', 'b'] }]);
    expect(published(world, 1)).toEqual(before);
    expect(world.course.status).toBe('PUBLISHED');
    const last = world.events.at(-1)!;
    expect([
      last.action,
      last.fromStatus,
      last.toStatus,
      last.publicationId,
    ]).toEqual(['PUBLISH', 'PUBLISHED', 'PUBLISHED', result.publication!.id]);
  });

  it('adds a lesson published at a new level only at that level', async () => {
    const { world, service } = setup('APPROVED');
    const m = world.addModule('APPROVED', ['a']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    world.publishLesson('a', ['BEGINNER', 'ADVANCED']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    expect(published(world, 2, 'ADVANCED')).toEqual([
      { id: m.id, lessons: ['a'] },
    ]);
    expect(published(world, 1, 'ADVANCED')).toEqual([]);
  });

  it('is refused for EDITOR and REVIEWER, and for a course that is not published yet', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    for (const role of [Role.EDITOR, Role.REVIEWER]) {
      await expect(
        service.perform({ courseId: world.course.id }, 'PUBLISH', actor(role)),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    const fresh = setup('PUBLISHED');
    await expect(
      fresh.service.perform(
        { courseId: fresh.world.course.id },
        'PUBLISH',
        admin(),
      ),
    ).rejects.toBeInstanceOf(ConflictError); // PUBLISHED but not listed: nothing to refresh
  });

  it('refreshes one module of a published course the same way', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a']);
    const m2 = world.addModule('APPROVED', ['c']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    world.lessonOrder.set(m2.id, ['c', 'd']);
    world.publishLesson('d');
    const result = await service.perform(
      { courseId: world.course.id, moduleId: m2.id },
      'PUBLISH',
      admin(),
    );
    expect(result.publication).toMatchObject({
      version: 2,
      cause: 'MODULE_PUBLISH',
    });
    expect(published(world, 2)).toEqual([
      { id: m1.id, lessons: ['a'] },
      { id: m2.id, lessons: ['c', 'd'] },
    ]);
  });

  it('a refresh that cannot be published leaves the previous version active and records nothing', async () => {
    const { world, service } = setup('APPROVED');
    world.addModule('APPROVED', ['a']);
    await service.perform({ courseId: world.course.id }, 'PUBLISH', admin());
    const events = world.events.length;
    world.withdrawLesson('a');
    await expect(
      service.perform({ courseId: world.course.id }, 'PUBLISH', admin()),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(world.publications).toHaveLength(1);
    expect(world.active()?.version).toBe(1);
    expect(world.events).toHaveLength(events);
  });
});

describe('a module withdrawn from the catalog stays out when its course is republished', () => {
  it('excludes it until it is approved again, and reports why', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a']);
    const m2 = world.addModule('APPROVED', ['b']);
    const course = { courseId: world.course.id };
    await service.perform(course, 'PUBLISH', admin());
    await service.perform({ ...course, moduleId: m2.id }, 'UNPUBLISH', admin());
    await service.perform(course, 'UNPUBLISH', admin());

    const again = await service.perform(course, 'PUBLISH', admin());
    expect(again.publication!.modules.map((m) => m.moduleId)).toEqual([m1.id]);
    expect(again.modulesNotIncluded).toEqual([
      { moduleId: m2.id, status: 'APPROVED', reason: 'WITHDRAWN' },
    ]);
    // its history is untouched
    const history = await service.listEvents(
      { ...course, moduleId: m2.id },
      10,
      0,
    );
    expect(history.items.map((e) => e.action)).toEqual([
      'UNPUBLISH',
      'PUBLISH',
    ]);
    expect(world.publications[0].modules.map((m) => m.moduleId)).toEqual([
      m1.id,
      m2.id,
    ]);

    // edited and approved again: it can join the next version
    world.moduleById(m2.id).status = 'DRAFT';
    await service.perform(
      { ...course, moduleId: m2.id },
      'SUBMIT_FOR_REVIEW',
      admin(),
    );
    await service.perform({ ...course, moduleId: m2.id }, 'APPROVE', admin());
    const refreshed = await service.perform(course, 'PUBLISH', admin());
    expect(refreshed.publication!.modules.map((m) => m.moduleId)).toEqual([
      m1.id,
      m2.id,
    ]);
    expect(refreshed.modulesPublished).toEqual([m2.id]);
  });

  it('keeps the module out of a refresh and lets the explicit module publish bring it back', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a']);
    const m2 = world.addModule('APPROVED', ['b']);
    const course = { courseId: world.course.id };
    await service.perform(course, 'PUBLISH', admin());
    await service.perform({ ...course, moduleId: m2.id }, 'UNPUBLISH', admin());
    const refreshed = await service.perform(course, 'PUBLISH', admin());
    expect(refreshed.publication!.modules.map((m) => m.moduleId)).toEqual([
      m1.id,
    ]);
    const back = await service.perform(
      { ...course, moduleId: m2.id },
      'PUBLISH',
      admin(),
    );
    expect(back.publication!.modules.map((m) => m.moduleId)).toEqual([
      m1.id,
      m2.id,
    ]);
  });
});

describe('approved order', () => {
  it('keeps the published module and lesson order when an unrelated module is published or unpublished', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a', 'b']);
    const m2 = world.addModule('APPROVED', ['c']);
    const m3 = world.addModule('APPROVED', ['x']);
    const course = { courseId: world.course.id };
    await service.perform(course, 'PUBLISH', admin());
    await service.perform({ ...course, moduleId: m3.id }, 'UNPUBLISH', admin());

    // authoring-only reorders: modules and the lessons of m1
    world.moduleById(m1.id).position = 2;
    world.moduleById(m2.id).position = 1;
    world.lessonOrder.set(m1.id, ['b', 'a']);

    await service.perform({ ...course, moduleId: m3.id }, 'PUBLISH', admin()); // unrelated module
    // m1 and m2 keep their published relative order; the new module is last (nothing follows it)
    expect(published(world, 3)).toEqual([
      { id: m1.id, lessons: ['a', 'b'] },
      { id: m2.id, lessons: ['c'] },
      { id: m3.id, lessons: ['x'] },
    ]);
    await service.perform({ ...course, moduleId: m3.id }, 'UNPUBLISH', admin());
    expect(published(world, 4).map((m) => m.id)).toEqual([m1.id, m2.id]);
  });

  it('applies a changed order in the version that publishes the approved course', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a', 'b']);
    const m2 = world.addModule('APPROVED', ['c']);
    const course = { courseId: world.course.id };
    await service.perform(course, 'PUBLISH', admin());

    // a reorder is an edit: the course and module return to review and are approved again
    world.moduleById(m1.id).position = 2;
    world.moduleById(m2.id).position = 1;
    world.lessonOrder.set(m1.id, ['b', 'a']);
    world.moduleById(m1.id).status = 'APPROVED';
    world.course.status = 'APPROVED';

    await service.perform(course, 'PUBLISH', admin());
    expect(published(world, 1)).toEqual([
      { id: m1.id, lessons: ['a', 'b'] },
      { id: m2.id, lessons: ['c'] },
    ]);
    expect(published(world, 2)).toEqual([
      { id: m2.id, lessons: ['c'] },
      { id: m1.id, lessons: ['b', 'a'] },
    ]);
  });

  it('inserts new modules and lessons next to their authoring neighbours', async () => {
    const { world, service } = setup('APPROVED');
    const m1 = world.addModule('APPROVED', ['a', 'c']);
    const m3 = world.addModule('APPROVED', ['z']);
    const course = { courseId: world.course.id };
    await service.perform(course, 'PUBLISH', admin());
    // a new module between them and a new lesson between a and c
    const m2 = world.addModule('APPROVED', ['y']);
    world.moduleById(m2.id).position = 2;
    world.moduleById(m3.id).position = 3;
    world.lessonOrder.set(m1.id, ['a', 'b', 'c']);
    world.publishLesson('b');
    await service.perform({ ...course, moduleId: m1.id }, 'PUBLISH', admin());
    expect(published(world, 2)).toEqual([
      { id: m1.id, lessons: ['a', 'b', 'c'] },
      { id: m3.id, lessons: ['z'] },
    ]);
    await service.perform({ ...course, moduleId: m2.id }, 'PUBLISH', admin());
    expect(published(world, 3).map((m) => m.id)).toEqual([m1.id, m2.id, m3.id]);
  });
});
