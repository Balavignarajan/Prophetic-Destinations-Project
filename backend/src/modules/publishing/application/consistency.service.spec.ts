import { randomUUID } from 'node:crypto';
import type { LessonsFacade } from '../../lessons/index.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  canonicalJson,
  hashCanonicalJson,
} from '../domain/snapshot-payload.js';
import type {
  ConsistencyRepository,
  PublicationFinding,
  StoredSnapshot,
} from '../persistence/consistency.repository.js';
import { ConsistencyService } from './consistency.service.js';

const finding = (): PublicationFinding => ({
  lessonId: randomUUID(),
  publicationId: randomUUID(),
});

interface Fakes {
  published?: string[];
  active?: string[];
  multipleActive?: PublicationFinding[];
  withoutPublishEvent?: PublicationFinding[];
  revisionMismatch?: PublicationFinding[];
  unpublishedWithoutEvent?: PublicationFinding[];
  supersededWithoutSuccessor?: PublicationFinding[];
  withoutLevels?: PublicationFinding[];
  snapshots?: StoredSnapshot[];
}

function build(fakes: Fakes = {}) {
  const published = [...(fakes.published ?? [])].sort();
  const lessons = {
    listLessonIdsByStatus: async (
      status: string,
      limit: number,
      afterId: string | null,
    ) =>
      status === 'PUBLISHED'
        ? published
            .filter((id) => afterId === null || id > afterId)
            .slice(0, limit)
        : [],
  } as unknown as LessonsFacade;
  const repository = {
    multipleActive: async () => fakes.multipleActive ?? [],
    withoutPublishEvent: async () => fakes.withoutPublishEvent ?? [],
    publishRevisionMismatch: async () => fakes.revisionMismatch ?? [],
    unpublishedWithoutEvent: async () => fakes.unpublishedWithoutEvent ?? [],
    supersededWithoutSuccessor: async () =>
      fakes.supersededWithoutSuccessor ?? [],
    withoutLevels: async () => fakes.withoutLevels ?? [],
    lessonsWithActivePublication: async (ids: readonly string[]) =>
      new Set(ids.filter((id) => (fakes.active ?? []).includes(id))),
    snapshotsAfter: async (
      after: { publicationId: string; level: string } | null,
      limit: number,
    ) => {
      const sorted = [...(fakes.snapshots ?? [])].sort((a, b) =>
        `${a.publicationId}${a.level}`.localeCompare(
          `${b.publicationId}${b.level}`,
        ),
      );
      const start = after
        ? sorted.findIndex(
            (s) =>
              s.publicationId === after.publicationId &&
              s.level === after.level,
          ) + 1
        : 0;
      return sorted.slice(start, start + limit);
    },
  } as unknown as ConsistencyRepository;
  return new ConsistencyService(lessons, repository);
}

const snapshot = (
  content: Record<string, unknown>,
  overrides: Partial<StoredSnapshot> = {},
): StoredSnapshot => {
  const canonical = canonicalJson(content);
  return {
    publicationId: randomUUID(),
    lessonId: randomUUID(),
    level: 'BEGINNER',
    content,
    contentHash: hashCanonicalJson(canonical),
    contentBytes: Buffer.byteLength(canonical, 'utf8'),
    ...overrides,
  };
};

describe('publishing consistency check', () => {
  it('reports a healthy state as consistent', async () => {
    const report = await build().check();
    expect(report).toEqual({
      consistent: true,
      limitPerCheck: 100,
      snapshotsVerified: false,
      truncated: false,
      issues: [],
    });
  });

  it('flags PUBLISHED lessons that have no active publication, and only those', async () => {
    const withPublication = randomUUID();
    const without = randomUUID();
    const report = await build({
      published: [withPublication, without],
      active: [withPublication],
    }).check();
    expect(report.consistent).toBe(false);
    expect(report.issues).toEqual([
      {
        code: 'PUBLISHED_WITHOUT_ACTIVE_PUBLICATION',
        lessonId: without,
        publicationId: null,
      },
    ]);
  });

  it('pages through many PUBLISHED lessons', async () => {
    const ids = Array.from({ length: 450 }, () => randomUUID());
    const missing = ids[437];
    const report = await build({
      published: ids,
      active: ids.filter((id) => id !== missing),
    }).check();
    expect(report.issues.map((i) => i.lessonId)).toEqual([missing]);
  });

  it('reports each kind of publication/event inconsistency under its own code', async () => {
    const one = finding();
    const report = await build({
      multipleActive: [one],
      withoutPublishEvent: [one],
      revisionMismatch: [one],
      unpublishedWithoutEvent: [one],
      supersededWithoutSuccessor: [one],
      withoutLevels: [one],
    }).check();
    expect(report.issues.map((i) => i.code)).toEqual([
      'MULTIPLE_ACTIVE_PUBLICATIONS',
      'PUBLICATION_WITHOUT_PUBLISH_EVENT',
      'PUBLISH_EVENT_REVISION_MISMATCH',
      'UNPUBLISHED_WITHOUT_EVENT',
      'SUPERSEDED_WITHOUT_SUCCESSOR',
      'PUBLICATION_WITHOUT_SNAPSHOTS',
    ]);
  });

  it('does not treat an older publication that is still active as a problem for any non-PUBLISHED lesson', async () => {
    // the service only asks about PUBLISHED lessons: a DRAFT, READY_FOR_REVIEW or APPROVED lesson
    // with an active older publication never appears here
    const report = await build({
      published: [],
      active: [randomUUID()],
    }).check();
    expect(report.consistent).toBe(true);
  });

  it('limits each check and says when there may be more', async () => {
    const many = Array.from({ length: 5 }, finding);
    const report = await build({ withoutPublishEvent: many }).check({
      limitPerCheck: 3,
    });
    expect(report.issues).toHaveLength(3);
    expect(report.truncated).toBe(true);
    expect(report.limitPerCheck).toBe(3);
  });

  describe('snapshot verification (optional)', () => {
    it('is skipped unless asked for', async () => {
      const tampered = snapshot({ a: 1 }, { contentHash: 'f'.repeat(64) });
      const report = await build({ snapshots: [tampered] }).check();
      expect(report.consistent).toBe(true);
      expect(report.snapshotsVerified).toBe(false);
    });

    it('accepts snapshots whose hash and size match their stored content, in any key order', async () => {
      const good = snapshot({ b: [3, { y: 1, x: 2 }], a: 1 });
      // the same content as the database returns it: keys in another order
      const reordered = { ...good, content: { a: 1, b: [3, { x: 2, y: 1 }] } };
      const report = await build({ snapshots: [reordered] }).check({
        verifySnapshots: true,
      });
      expect(report.snapshotsVerified).toBe(true);
      expect(report.consistent).toBe(true);
    });

    it('finds a wrong hash, a wrong size and an oversized snapshot', async () => {
      const wrongHash = snapshot({ a: 1 }, { contentHash: 'f'.repeat(64) });
      const wrongSize = snapshot({ a: 2 }, { contentBytes: 999 });
      const huge = snapshot({ text: 'x'.repeat(MAX_LEVEL_SNAPSHOT_BYTES) });
      const report = await build({
        snapshots: [wrongHash, wrongSize, huge],
      }).check({ verifySnapshots: true });

      const byPublication = (id: string) =>
        report.issues.filter((i) => i.publicationId === id).map((i) => i.code);
      expect(byPublication(wrongHash.publicationId)).toEqual([
        'SNAPSHOT_HASH_MISMATCH',
      ]);
      expect(byPublication(wrongSize.publicationId)).toEqual([
        'SNAPSHOT_SIZE_MISMATCH',
      ]);
      expect(byPublication(huge.publicationId)).toEqual(['SNAPSHOT_TOO_LARGE']);
    });

    it('verifies every snapshot across batches', async () => {
      const snapshots = Array.from({ length: 25 }, (_, i) =>
        snapshot({ n: i }),
      );
      const bad = snapshots[22];
      bad.contentHash = '0'.repeat(64);
      const report = await build({ snapshots }).check({
        verifySnapshots: true,
      });
      expect(report.issues.map((i) => i.publicationId)).toEqual([
        bad.publicationId,
      ]);
    });
  });
});
