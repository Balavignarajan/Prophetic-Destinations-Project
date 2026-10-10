import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  CONTENT_STATUSES,
  ConflictError,
  type ContentStatus,
  ForbiddenError,
  LEARNING_LEVELS,
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { type AuthenticatedAdmin, Role } from '../../identity/index.js';
import type { AssembledLesson, LessonsFacade } from '../../lessons/index.js';
import type { Publication, WorkflowEvent } from '../domain/models.js';
import { NO_SEPARATION_OF_DUTIES } from '../domain/separation-of-duties.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
  canonicalJson,
} from '../domain/snapshot-payload.js';
import type {
  NewLevelSnapshot,
  NewPublication,
  PublicationRepository,
} from '../persistence/publication.repository.js';
import type {
  NewWorkflowEvent,
  WorkflowEventRepository,
} from '../persistence/workflow-event.repository.js';
import { PublicationService } from './publication.service.js';
import { WorkflowService } from './workflow.service.js';

// Publishing and unpublishing with in-memory stand-ins (real WorkflowService, real PublicationService,
// real readiness and snapshot rules). Real SQL, constraints, triggers, locking and rollback are covered
// by the integration tests; here the logic and the failure handling are pinned down.

interface FakeLesson {
  status: ContentStatus;
  contentRevision: number;
  version: number;
  title: string;
  /** Block contents per available level (a level that is absent is not available). */
  levels: Partial<Record<LearningLevel, Record<string, unknown>[]>>;
  /** Extra resolver diagnostics per level, to make a level unpublishable. */
  diagnostics: Partial<Record<LearningLevel, string[]>>;
  cover: string | null;
}

type FailPoint = 'insertPublication' | 'insertLevels' | 'append' | 'endActive';

class World {
  lessons = new Map<string, FakeLesson>();
  publications: Publication[] = [];
  snapshots = new Map<string, NewLevelSnapshot[]>();
  events: WorkflowEvent[] = [];
  statusWrites: string[] = [];
  failAt: FailPoint | null = null;
  runOptions: ({ lockTimeoutMs?: number } | undefined)[] = [];
  stealStatusOnNextCas: ContentStatus | null = null;

  addLesson(
    status: ContentStatus = 'APPROVED',
    levels: FakeLesson['levels'] = {
      BEGINNER: [{ text: 'beginner-secret' }],
      INTERMEDIATE: [{ text: 'intermediate-secret' }],
      ADVANCED: [{ text: 'advanced-secret' }],
    },
  ) {
    const id = randomUUID();
    this.lessons.set(id, {
      status,
      contentRevision: 5,
      version: 3,
      title: 'Lesson',
      levels,
      diagnostics: {},
      cover: null,
    });
    return id;
  }

  /** What an authoring edit does to the lesson (the lessons module's job): back to DRAFT, revision + 1. */
  edit(id: string, change: (lesson: FakeLesson) => void) {
    const lesson = this.lessons.get(id)!;
    change(lesson);
    lesson.status = 'DRAFT';
    lesson.contentRevision += 1;
  }

  active(lessonId: string) {
    return this.publications.find(
      (p) => p.lessonId === lessonId && p.endedAt === null,
    );
  }

  saved() {
    return {
      lessons: new Map([...this.lessons].map(([id, l]) => [id, { ...l }])),
      publications: this.publications.map((p) => ({ ...p })),
      snapshots: new Map(this.snapshots),
      events: [...this.events],
      statusWrites: [...this.statusWrites],
    };
  }
  restore(saved: ReturnType<World['saved']>) {
    this.lessons = saved.lessons;
    this.publications = saved.publications;
    this.snapshots = saved.snapshots;
    this.events = saved.events;
    this.statusWrites = saved.statusWrites;
  }
}

function build(world = new World()) {
  const facade = {
    lockForWorkflow: async (id: string) => {
      const lesson = world.lessons.get(id);
      if (!lesson) throw new NotFoundError('Lesson not found');
      return {
        id,
        moduleId: 'module-1',
        availableLevels: [],
        status: lesson.status,
        contentRevision: lesson.contentRevision,
      };
    },
    findWorkflowState: async (id: string) => {
      const lesson = world.lessons.get(id);
      return lesson
        ? {
            id,
            moduleId: 'module-1',
            availableLevels: [],
            status: lesson.status,
            contentRevision: lesson.contentRevision,
          }
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
    assembleForPublication: async (id: string): Promise<AssembledLesson> => {
      const lesson = world.lessons.get(id)!;
      const available = LEARNING_LEVELS.filter(
        (level) => lesson.levels[level] !== undefined,
      );
      return {
        lessonId: id,
        moduleId: 'module-1',
        status: lesson.status,
        contentRevision: lesson.contentRevision,
        lesson: {
          id,
          moduleId: 'module-1',
          title: lesson.title,
          shortTitle: null,
          subtitle: null,
          introduction: null,
          estimatedMinutes: null,
          coverMediaId: lesson.cover,
        },
        availableLevels: available,
        levels: available.map((level) => {
          const contents = lesson.levels[level]!;
          return {
            level,
            blockProblems: [],
            resolution: {
              level,
              available: true,
              blocks: contents.map((content, i) => ({
                blockId: `${level}-block-${i + 1}`,
                type: 'RICH_TEXT' as const,
                ordinal: i + 1,
                source: 'SHARED' as const,
                content,
              })),
              diagnostics:
                contents.length === 0
                  ? [
                      {
                        code: 'NO_VISIBLE_BLOCKS' as const,
                        message: 'Nothing is visible at this level',
                      },
                    ]
                  : [],
            },
          };
        }),
      };
    },
  } as unknown as LessonsFacade;

  const publicationRepo = {
    findActive: async (lessonId: string) => world.active(lessonId) ?? null,
    endActive: async (
      lessonId: string,
      reason: 'SUPERSEDED' | 'UNPUBLISHED',
      adminId: string,
    ) => {
      if (world.failAt === 'endActive') throw new Error('end failed');
      const active = world.active(lessonId);
      if (!active) return null;
      active.endedAt = new Date();
      active.endedBy = adminId;
      active.endedReason = reason;
      return { ...active };
    },
    nextVersion: async (lessonId: string) =>
      Math.max(
        0,
        ...world.publications
          .filter((p) => p.lessonId === lessonId)
          .map((p) => p.version),
      ) + 1,
    insert: async (publication: NewPublication) => {
      if (world.failAt === 'insertPublication') {
        throw new Error('publication insert failed');
      }
      const id = randomUUID();
      world.publications.push({
        id,
        ...publication,
        publishedAt: new Date(),
        endedAt: null,
        endedBy: null,
        endedReason: null,
        levels: [],
      });
      return id;
    },
    insertLevels: async (
      publicationId: string,
      _lessonId: string,
      levels: NewLevelSnapshot[],
    ) => {
      if (world.failAt === 'insertLevels') {
        throw new Error('level insert failed');
      }
      world.snapshots.set(publicationId, levels);
      const publication = world.publications.find(
        (p) => p.id === publicationId,
      )!;
      publication.levels = levels.map((l) => ({
        level: l.level,
        contentHash: l.hash,
        contentBytes: l.bytes,
      }));
    },
    get: async (id: string) => ({
      ...world.publications.find((p) => p.id === id)!,
    }),
  } as unknown as PublicationRepository;

  const events = {
    append: async (event: NewWorkflowEvent) => {
      if (world.failAt === 'append') throw new Error('event insert failed');
      const saved: WorkflowEvent = {
        id: randomUUID(),
        seq: world.events.length + 1,
        createdAt: new Date(),
        publicationId: null,
        ...event,
      } as WorkflowEvent;
      world.events.push(saved);
      return saved;
    },
    list: async (lessonId: string) => {
      const all = world.events.filter((e) => e.lessonId === lessonId);
      return { items: all.reverse(), total: all.length };
    },
    latest: async () => null,
  } as unknown as WorkflowEventRepository;

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

  const publications = new PublicationService(facade, publicationRepo);
  return {
    world,
    service: new WorkflowService(
      facade,
      events,
      transactions,
      NO_SEPARATION_OF_DUTIES,
      publications,
    ),
  };
}

const actor = (role: Role): AuthenticatedAdmin => ({
  id: randomUUID(),
  email: 'a@example.test',
  role,
});
const admin = () => actor(Role.ADMIN);

const sha256 = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

describe('publishing', () => {
  it('turns an approved lesson into version 1 with one snapshot per available level', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('APPROVED');
    const publisher = admin();

    const result = await service.perform('PUBLISH', lessonId, publisher);

    expect(result).toMatchObject({
      fromStatus: 'APPROVED',
      status: 'PUBLISHED',
      contentRevision: 5,
      supersededPublication: null,
    });
    const publication = result.publication!;
    expect(publication).toMatchObject({
      lessonId,
      version: 1,
      sourceContentRevision: 5,
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      publishedBy: publisher.id,
      endedAt: null,
    });
    expect(publication.levels.map((l) => l.level)).toEqual([
      'BEGINNER',
      'INTERMEDIATE',
      'ADVANCED',
    ]);
    expect(world.lessons.get(lessonId)!.status).toBe('PUBLISHED');
    expect(result.event).toMatchObject({
      action: 'PUBLISH',
      fromStatus: 'APPROVED',
      toStatus: 'PUBLISHED',
      publicationId: publication.id,
      contentRevision: 5,
      actorAdminId: publisher.id,
      actorRole: 'ADMIN',
    });
  });

  it('stores independent snapshots: a level contains only its own content', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('APPROVED');
    const { publication } = await service.perform('PUBLISH', lessonId, admin());

    const stored = world.snapshots.get(publication!.id)!;
    const secrets: Record<string, string> = {
      BEGINNER: 'beginner-secret',
      INTERMEDIATE: 'intermediate-secret',
      ADVANCED: 'advanced-secret',
    };
    for (const snapshot of stored) {
      for (const [level, secret] of Object.entries(secrets)) {
        expect(snapshot.json.includes(secret)).toBe(level === snapshot.level);
      }
      expect(JSON.parse(snapshot.json)).toMatchObject({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        level: snapshot.level,
        lesson: { id: lessonId, moduleId: 'module-1', title: 'Lesson' },
      });
    }
  });

  it('publishes only the levels the lesson is available at', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('APPROVED', {
      INTERMEDIATE: [{ text: 'only' }],
    });
    const { publication } = await service.perform('PUBLISH', lessonId, admin());
    expect(publication!.levels.map((l) => l.level)).toEqual(['INTERMEDIATE']);
  });

  it('records the size and SHA-256 of exactly the stored canonical text, and equal content hashes equally', async () => {
    const { world, service } = build();
    const first = world.addLesson('APPROVED', {
      BEGINNER: [{ a: 1, b: { y: 2, x: [3, { q: 1, p: 2 }] } }],
    });
    const second = world.addLesson('APPROVED', {
      BEGINNER: [{ b: { x: [3, { p: 2, q: 1 }], y: 2 }, a: 1 }], // same content, different key order
    });

    const one = (await service.perform('PUBLISH', first, admin())).publication!;
    const two = (await service.perform('PUBLISH', second, admin()))
      .publication!;

    const stored = world.snapshots.get(one.id)![0];
    expect(stored.hash).toBe(sha256(stored.json));
    expect(stored.bytes).toBe(Buffer.byteLength(stored.json, 'utf8'));
    expect(stored.json).toBe(canonicalJson(JSON.parse(stored.json)));
    // the lesson ids differ, so the hashes differ; the block contents inside serialize identically
    const blocksOf = (id: string) =>
      JSON.stringify(JSON.parse(world.snapshots.get(id)![0].json).blocks);
    expect(blocksOf(one.id).replaceAll(/BEGINNER-block/g, 'x')).toBe(
      blocksOf(two.id).replaceAll(/BEGINNER-block/g, 'x'),
    );
  });

  it('hashes the same content identically on every publication of the same lesson', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('APPROVED', { BEGINNER: [{ t: 'same' }] });
    const v1 = (await service.perform('PUBLISH', lessonId, admin()))
      .publication!;
    await service.perform('UNPUBLISH', lessonId, admin());
    const v2 = (await service.perform('PUBLISH', lessonId, admin()))
      .publication!;
    expect(v2.version).toBe(2);
    expect(v2.levels[0].contentHash).toBe(v1.levels[0].contentHash);
  });

  describe('permissions', () => {
    it.each([Role.EDITOR, Role.REVIEWER])(
      '%s cannot publish or unpublish, and nothing is touched',
      async (role) => {
        const { world, service } = build();
        const lessonId = world.addLesson('APPROVED');
        const before = world.saved();
        for (const action of ['PUBLISH', 'UNPUBLISH'] as const) {
          await expect(
            service.perform(action, lessonId, actor(role)),
          ).rejects.toBeInstanceOf(ForbiddenError);
        }
        expect(world.saved()).toEqual(before);
      },
    );
  });

  describe('which lessons can be published', () => {
    it.each(CONTENT_STATUSES.filter((s) => s !== 'APPROVED'))(
      'refuses a lesson that is %s (409 with the allowed status), writing nothing',
      async (status) => {
        const { world, service } = build();
        const lessonId = world.addLesson(status);
        const before = world.saved();
        const error = await service
          .perform('PUBLISH', lessonId, admin())
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).details).toMatchObject({
          action: 'PUBLISH',
          status,
          allowedFrom: ['APPROVED'],
        });
        expect(world.saved()).toEqual(before);
      },
    );

    it('reports a missing lesson', async () => {
      const { service } = build();
      await expect(
        service.perform('PUBLISH', randomUUID(), admin()),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses a stale expected content revision', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      const before = world.saved();
      await expect(
        service.perform('PUBLISH', lessonId, admin(), {
          expectedContentRevision: 4,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(world.saved()).toEqual(before);

      await expect(
        service.perform('PUBLISH', lessonId, admin(), {
          expectedContentRevision: 5,
        }),
      ).resolves.toBeDefined();
    });

    it('the second of two publishes is refused: only one version exists', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());
      await expect(
        service.perform('PUBLISH', lessonId, admin()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(world.publications).toHaveLength(1);
    });
  });

  describe('readiness is authoritative at publish time', () => {
    const unpublishable: [string, (w: World, id: string) => void, string][] = [
      [
        'no available levels',
        (w, id) => (w.lessons.get(id)!.levels = {}),
        'LESSON_HAS_NO_LEVELS',
      ],
      [
        'a blank title',
        (w, id) => (w.lessons.get(id)!.title = '  '),
        'LESSON_TITLE_MISSING',
      ],
      [
        'a cover',
        (w, id) => (w.lessons.get(id)!.cover = randomUUID()),
        'COVER_NOT_SUPPORTED',
      ],
      [
        'a level with nothing visible',
        (w, id) => (w.lessons.get(id)!.levels.ADVANCED = []),
        'NO_VISIBLE_BLOCKS',
      ],
    ];

    it.each(unpublishable)(
      'refuses a lesson with %s (422 with the report) and writes nothing',
      async (_label, damage, code) => {
        const { world, service } = build();
        const lessonId = world.addLesson('APPROVED');
        damage(world, lessonId);
        const before = world.saved();

        const error = await service
          .perform('PUBLISH', lessonId, admin())
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BusinessRuleError);
        const report = (error as BusinessRuleError).details as {
          report: { ready: boolean; issues: { code: string }[] };
        };
        expect(report.report.ready).toBe(false);
        expect(report.report.issues.map((i) => i.code)).toContain(code);
        expect(world.saved()).toEqual(before);
      },
    );

    it('reports every problem at once, not only the first', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      world.lessons.get(lessonId)!.title = '';
      world.lessons.get(lessonId)!.levels.BEGINNER = [];
      world.lessons.get(lessonId)!.levels.ADVANCED = [];
      const error = (await service
        .perform('PUBLISH', lessonId, admin())
        .catch((e: unknown) => e)) as BusinessRuleError;
      const codes = (
        error.details as { report: { issues: { code: string }[] } }
      ).report.issues.map((i) => i.code);
      expect(codes).toEqual([
        'LESSON_TITLE_MISSING',
        'NO_VISIBLE_BLOCKS',
        'NO_VISIBLE_BLOCKS',
      ]);
    });

    it('a lesson edited after approval is back to DRAFT and cannot be published', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      world.edit(lessonId, (l) => (l.title = 'Changed'));
      await expect(
        service.perform('PUBLISH', lessonId, admin()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(world.publications).toHaveLength(0);
    });
  });

  describe('snapshot size limit (5 MiB of serialized UTF-8 per level)', () => {
    /** Content whose level snapshot serializes to exactly `bytes` bytes. */
    const contentOfSize = async (bytes: number) => {
      const probe = build();
      const probeId = probe.world.addLesson('APPROVED', {
        BEGINNER: [{ text: '' }],
      });
      const { publication } = await probe.service.perform(
        'PUBLISH',
        probeId,
        admin(),
      );
      const overhead =
        probe.world.snapshots.get(publication!.id)![0].bytes +
        // the probe lesson's id has the same length as any other lesson id
        0;
      return { text: 'x'.repeat(bytes - overhead) };
    };

    it('accepts a snapshot of exactly the limit and refuses one byte more', async () => {
      const exact = build();
      const okId = exact.world.addLesson('APPROVED', {
        BEGINNER: [await contentOfSize(MAX_LEVEL_SNAPSHOT_BYTES)],
      });
      const ok = await exact.service.perform('PUBLISH', okId, admin());
      expect(ok.publication!.levels[0].contentBytes).toBe(
        MAX_LEVEL_SNAPSHOT_BYTES,
      );

      const over = build();
      const overId = over.world.addLesson('APPROVED', {
        BEGINNER: [await contentOfSize(MAX_LEVEL_SNAPSHOT_BYTES + 1)],
      });
      const error = (await over.service
        .perform('PUBLISH', overId, admin())
        .catch((e: unknown) => e)) as BusinessRuleError;
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect(
        (
          error.details as { report: { issues: { code: string }[] } }
        ).report.issues.map((i) => i.code),
      ).toEqual(['SNAPSHOT_TOO_LARGE']);
      expect(over.world.publications).toHaveLength(0);
    });

    it('measures bytes, not characters', async () => {
      const { world, service } = build();
      const text = '€'.repeat(Math.ceil(MAX_LEVEL_SNAPSHOT_BYTES / 3)); // 3 bytes each, ~5 MiB of bytes in ~1.7M characters
      const lessonId = world.addLesson('APPROVED', { BEGINNER: [{ text }] });
      await expect(
        service.perform('PUBLISH', lessonId, admin()),
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });
  });

  describe('unpublishing', () => {
    it('PUBLISHED becomes APPROVED and the active publication ends once, keeping its snapshots', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      const published = (await service.perform('PUBLISH', lessonId, admin()))
        .publication!;
      const snapshotsBefore = JSON.stringify(world.snapshots.get(published.id));
      const unpublisher = admin();

      const result = await service.perform('UNPUBLISH', lessonId, unpublisher, {
        note: 'withdrawn',
      });

      expect(result).toMatchObject({
        fromStatus: 'PUBLISHED',
        status: 'APPROVED',
      });
      expect(result.publication).toMatchObject({
        id: published.id,
        endedReason: 'UNPUBLISHED',
        endedBy: unpublisher.id,
      });
      expect(result.publication!.endedAt).toBeInstanceOf(Date);
      expect(result.event).toMatchObject({
        action: 'UNPUBLISH',
        publicationId: published.id,
        note: 'withdrawn',
      });
      expect(world.active(lessonId)).toBeUndefined();
      expect(JSON.stringify(world.snapshots.get(published.id))).toBe(
        snapshotsBefore,
      );
    });

    // The working copy can be in any of the four statuses while a publication is active; unpublishing
    // ends the publication in every case and only moves PUBLISHED (to APPROVED).
    const WORKING_COPY: [ContentStatus, ContentStatus][] = [
      ['PUBLISHED', 'APPROVED'],
      ['DRAFT', 'DRAFT'],
      ['READY_FOR_REVIEW', 'READY_FOR_REVIEW'],
      ['APPROVED', 'APPROVED'],
    ];

    /** Publishes a lesson, then brings its working copy to `status` the way real edits and reviews would. */
    const publishedWith = async (status: ContentStatus, setup = build()) => {
      const { world, service } = setup;
      const lessonId = world.addLesson('APPROVED');
      const published = (await service.perform('PUBLISH', lessonId, admin()))
        .publication!;
      if (status !== 'PUBLISHED') {
        world.edit(lessonId, (l) => (l.title = 'Edited after publishing'));
        if (status !== 'DRAFT') {
          await service.perform(
            'SUBMIT_FOR_REVIEW',
            lessonId,
            actor(Role.EDITOR),
          );
        }
        if (status === 'APPROVED') {
          await service.perform('APPROVE', lessonId, actor(Role.REVIEWER));
        }
      }
      expect(world.lessons.get(lessonId)!.status).toBe(status);
      return { world, service, lessonId, published };
    };

    it.each(WORKING_COPY)(
      'a %s working copy: unpublish ends the publication and leaves the working copy %s',
      async (status, expected) => {
        const { world, service, lessonId, published } =
          await publishedWith(status);
        const lesson = { ...world.lessons.get(lessonId)! };
        const snapshotsBefore = JSON.stringify([...world.snapshots]);
        const unpublisher = admin();

        const result = await service.perform(
          'UNPUBLISH',
          lessonId,
          unpublisher,
          {
            note: 'withdrawn',
          },
        );

        expect(result).toMatchObject({ fromStatus: status, status: expected });
        expect(result.publication).toMatchObject({
          id: published.id,
          endedReason: 'UNPUBLISHED',
          endedBy: unpublisher.id,
        });
        expect(result.event).toMatchObject({
          action: 'UNPUBLISH',
          fromStatus: status,
          toStatus: expected,
          publicationId: published.id,
          actorAdminId: unpublisher.id,
          contentRevision: lesson.contentRevision,
          note: 'withdrawn',
        });
        // the publication is ended exactly once; no other one exists or was created
        expect(world.active(lessonId)).toBeUndefined();
        expect(
          world.publications.filter((p) => p.endedAt !== null),
        ).toHaveLength(1);
        expect(world.publications).toHaveLength(1);
        // the working copy is untouched apart from the PUBLISHED -> APPROVED move
        expect(world.lessons.get(lessonId)).toEqual({
          ...lesson,
          status: expected,
        });
        expect(world.lessons.get(lessonId)!.version).toBe(3);
        // published snapshots are exactly as they were
        expect(JSON.stringify([...world.snapshots])).toBe(snapshotsBefore);
        // and a second unpublish is refused: nothing is left to end
        const again = await service
          .perform('UNPUBLISH', lessonId, admin())
          .catch((e: unknown) => e);
        expect(again).toBeInstanceOf(ConflictError);
        expect((again as ConflictError).message).toMatch(
          /no active publication/,
        );
        expect(
          world.events.filter((e) => e.action === 'UNPUBLISH'),
        ).toHaveLength(1);
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy: a failing event insert rolls the unpublish back completely',
      async (status) => {
        const { world, service, lessonId } = await publishedWith(status);
        const before = world.saved();
        world.failAt = 'append';
        await expect(
          service.perform('UNPUBLISH', lessonId, admin()),
        ).rejects.toThrow('event insert failed');
        world.failAt = null;
        expect(world.saved()).toEqual(before);
        expect(world.active(lessonId)).toBeDefined();
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy: only an ADMIN may unpublish',
      async (status) => {
        const { world, service, lessonId } = await publishedWith(status);
        const before = world.saved();
        for (const role of [Role.EDITOR, Role.REVIEWER]) {
          await expect(
            service.perform('UNPUBLISH', lessonId, actor(role)),
          ).rejects.toBeInstanceOf(ForbiddenError);
        }
        expect(world.saved()).toEqual(before);
      },
    );

    it.each(WORKING_COPY)(
      'a %s working copy is offered unpublish to an ADMIN while a publication is active',
      async (status) => {
        const { service, lessonId } = await publishedWith(status);
        expect(
          (await service.getState(lessonId, Role.ADMIN)).allowedActions,
        ).toContain('UNPUBLISH');
        expect(
          (await service.getState(lessonId, Role.EDITOR)).allowedActions,
        ).not.toContain('UNPUBLISH');
      },
    );

    it('a working copy that stayed in review can still be approved and republished afterwards', async () => {
      const { world, service, lessonId, published } =
        await publishedWith('READY_FOR_REVIEW');
      await service.perform('UNPUBLISH', lessonId, admin());
      await service.perform('APPROVE', lessonId, actor(Role.REVIEWER));
      const again = await service.perform('PUBLISH', lessonId, admin());
      expect(again.publication!.version).toBe(2);
      expect(again.supersededPublication).toBeNull(); // version 1 had already ended
      expect(
        world.publications.find((p) => p.id === published.id),
      ).toMatchObject({ endedReason: 'UNPUBLISHED' });
    });

    it.each(CONTENT_STATUSES)(
      'a %s lesson with no active publication cannot be unpublished',
      async (status) => {
        const { world, service } = build();
        const lessonId = world.addLesson(status);
        const before = world.saved();
        await expect(
          service.perform('UNPUBLISH', lessonId, admin()),
        ).rejects.toThrow('no active publication');
        expect(world.saved()).toEqual(before);
      },
    );

    it('a repeated unpublish is refused: a publication is ended exactly once', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());
      await service.perform('UNPUBLISH', lessonId, admin());
      await expect(
        service.perform('UNPUBLISH', lessonId, admin()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(world.publications.filter((p) => p.endedAt)).toHaveLength(1);
      expect(world.events.filter((e) => e.action === 'UNPUBLISH')).toHaveLength(
        1,
      );
    });
  });

  describe('republishing', () => {
    it('after unpublish, the next publish is version 2 and version 1 stays as history', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      const v1 = (await service.perform('PUBLISH', lessonId, admin()))
        .publication!;
      await service.perform('UNPUBLISH', lessonId, admin());

      const again = await service.perform('PUBLISH', lessonId, admin());

      expect(again.publication!.version).toBe(2);
      expect(again.supersededPublication).toBeNull(); // v1 was already ended
      expect(world.publications.find((p) => p.id === v1.id)).toMatchObject({
        endedReason: 'UNPUBLISHED',
      });
      expect(world.snapshots.get(v1.id)).toBeDefined();
    });

    it('after an edit and re-approval, publishing supersedes the active version', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      const v1 = (await service.perform('PUBLISH', lessonId, admin()))
        .publication!;
      world.edit(
        lessonId,
        (l) => (l.levels.BEGINNER = [{ text: 'new beginner' }]),
      );
      await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));
      await service.perform('APPROVE', lessonId, actor(Role.REVIEWER));

      const result = await service.perform('PUBLISH', lessonId, admin());

      expect(result.publication).toMatchObject({
        version: 2,
        sourceContentRevision: 6,
      });
      expect(result.supersededPublication).toMatchObject({
        id: v1.id,
        endedReason: 'SUPERSEDED',
      });
      expect(world.publications.filter((p) => p.endedAt === null)).toHaveLength(
        1,
      );
      // version 1 still holds the old content
      expect(world.snapshots.get(v1.id)![0].json).toContain('beginner-secret');
      expect(world.snapshots.get(result.publication!.id)![0].json).toContain(
        'new beginner',
      );
    });

    it('versions are never reused across many cycles', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      for (let i = 0; i < 4; i += 1) {
        await service.perform('PUBLISH', lessonId, admin());
        await service.perform('UNPUBLISH', lessonId, admin());
      }
      expect(world.publications.map((p) => p.version)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('atomicity: any failing step leaves nothing behind', () => {
    it.each<FailPoint>(['insertPublication', 'insertLevels', 'append'])(
      'a failure at %s rolls the whole publish back',
      async (point) => {
        const { world, service } = build();
        const lessonId = world.addLesson('APPROVED');
        const before = world.saved();
        world.failAt = point;

        await expect(
          service.perform('PUBLISH', lessonId, admin()),
        ).rejects.toThrow('failed');

        world.failAt = null;
        expect(world.saved()).toEqual(before);
        expect(world.lessons.get(lessonId)!.status).toBe('APPROVED');
        // and the lesson can still be published afterwards, as version 1
        const retry = await service.perform('PUBLISH', lessonId, admin());
        expect(retry.publication!.version).toBe(1);
      },
    );

    it('a failure while publishing a replacement keeps the previous version active', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());
      world.edit(lessonId, (l) => (l.title = 'Edited'));
      await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));
      await service.perform('APPROVE', lessonId, actor(Role.REVIEWER));
      const before = world.saved();

      world.failAt = 'insertLevels';
      await expect(
        service.perform('PUBLISH', lessonId, admin()),
      ).rejects.toThrow();

      world.failAt = null;
      expect(world.saved()).toEqual(before);
      expect(world.active(lessonId)).toMatchObject({
        version: 1,
        endedAt: null,
      });
    });

    it('a failed event leaves the publication active and the status unchanged on unpublish', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());
      const before = world.saved();

      world.failAt = 'append';
      await expect(
        service.perform('UNPUBLISH', lessonId, admin()),
      ).rejects.toThrow('event insert failed');

      world.failAt = null;
      expect(world.saved()).toEqual(before);
      expect(world.active(lessonId)).toBeDefined();
      expect(world.lessons.get(lessonId)!.status).toBe('PUBLISHED');
    });

    it('a failure while ending the publication aborts the unpublish', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());
      const before = world.saved();
      world.failAt = 'endActive';
      await expect(
        service.perform('UNPUBLISH', lessonId, admin()),
      ).rejects.toThrow('end failed');
      world.failAt = null;
      expect(world.saved()).toEqual(before);
    });

    it('losing the status race at the last step rolls the publication back', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      const before = world.saved();
      world.stealStatusOnNextCas = 'DRAFT'; // a competing change after the checks
      await expect(
        service.perform('PUBLISH', lessonId, admin()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(world.publications).toHaveLength(0);
      expect(world.snapshots.size).toBe(0);
      expect(world.events).toHaveLength(0);
      expect(before.publications).toHaveLength(0);
    });
  });

  it('never changes the lesson version or content revision', async () => {
    const { world, service } = build();
    const lessonId = world.addLesson('APPROVED');
    await service.perform('PUBLISH', lessonId, admin());
    await service.perform('UNPUBLISH', lessonId, admin());
    await service.perform('PUBLISH', lessonId, admin());
    const lesson = world.lessons.get(lessonId)!;
    expect(lesson).toMatchObject({ version: 3, contentRevision: 5 });
    expect(world.statusWrites).toEqual([
      'APPROVED>PUBLISHED',
      'PUBLISHED>APPROVED',
      'APPROVED>PUBLISHED',
    ]);
  });

  describe('workflow state', () => {
    it('offers unpublish to an ADMIN while a publication is active, with the publication', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());

      const adminView = await service.getState(lessonId, Role.ADMIN);
      expect(adminView.allowedActions).toEqual(['UNPUBLISH']);
      expect(adminView.activePublication).toMatchObject({ version: 1 });
      expect(
        (await service.getState(lessonId, Role.EDITOR)).allowedActions,
      ).toEqual([]);

      world.edit(lessonId, (l) => (l.title = 'Edited'));
      const edited = await service.getState(lessonId, Role.ADMIN);
      expect(edited.status).toBe('DRAFT');
      expect(edited.allowedActions).toEqual(['SUBMIT_FOR_REVIEW', 'UNPUBLISH']);
      expect(edited.activePublication!.sourceContentRevision).toBe(5);
    });
  });

  describe('lock timeout', () => {
    it('every transition asks the runner for a 10 second lock timeout', async () => {
      const { world, service } = build();
      const lessonId = world.addLesson('APPROVED');
      await service.perform('PUBLISH', lessonId, admin());
      await service.perform('UNPUBLISH', lessonId, admin());
      world.edit(lessonId, (l) => (l.title = 'Edited'));
      await service.perform('SUBMIT_FOR_REVIEW', lessonId, actor(Role.EDITOR));
      await service.perform('APPROVE', lessonId, actor(Role.REVIEWER));
      expect(world.runOptions).toHaveLength(4);
      for (const options of world.runOptions) {
        expect(options).toEqual({ lockTimeoutMs: 10_000 });
      }
    });
  });
});
