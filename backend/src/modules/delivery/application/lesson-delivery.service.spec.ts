import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../shared-kernel/index.js';
import type {
  ActiveSnapshotInfo,
  PublishingFacade,
} from '../../publishing/index.js';
import { snapshotEtag } from '../domain/etag.js';
import { LessonDeliveryService } from './lesson-delivery.service.js';

const HASH = 'c'.repeat(64);

function info(overrides: Partial<ActiveSnapshotInfo> = {}): ActiveSnapshotInfo {
  return {
    lessonId: randomUUID(),
    level: 'BEGINNER',
    publicationId: randomUUID(),
    publicationVersion: 2,
    contentHash: HASH,
    ...overrides,
  };
}

const snapshot = {
  schemaVersion: 1,
  level: 'BEGINNER',
  lesson: { title: 'T' },
  blocks: [],
};

/** A facade whose answers are scripted per call, recording what it was asked. */
function build(
  infos: (ActiveSnapshotInfo | null)[],
  contents: (Record<string, unknown> | null)[] = [snapshot],
) {
  const calls = { info: 0, content: 0 };
  const facade = {
    findActiveSnapshotInfo: async () =>
      infos[Math.min(calls.info++, infos.length - 1)],
    readActiveSnapshotContent: async () =>
      contents[Math.min(calls.content++, contents.length - 1)],
  } as unknown as PublishingFacade;
  return { service: new LessonDeliveryService(facade), calls };
}

describe('LessonDeliveryService', () => {
  it('returns the stored snapshot untouched inside the fixed envelope, with the ETag', async () => {
    const published = info({ publicationVersion: 5 });
    const { service } = build([published]);

    const result = await service.getLessonSnapshot(
      published.lessonId,
      'BEGINNER',
    );

    expect(result).toEqual({
      kind: 'OK',
      etag: snapshotEtag(published),
      envelope: {
        lessonId: published.lessonId,
        level: 'BEGINNER',
        publicationVersion: 5,
        contentHash: HASH,
        snapshot,
      },
    });
    // the very same object: it is passed through, never rebuilt or copied with changes
    expect(
      (result as { envelope: { snapshot: unknown } }).envelope.snapshot,
    ).toBe(snapshot);
  });

  it('has exactly the documented envelope fields', async () => {
    const { service } = build([info()]);
    const result = await service.getLessonSnapshot(randomUUID(), 'BEGINNER');
    expect(
      Object.keys((result as { envelope: object }).envelope).sort(),
    ).toEqual(
      [
        'contentHash',
        'level',
        'lessonId',
        'publicationVersion',
        'snapshot',
      ].sort(),
    );
  });

  it('answers 304 from the hash alone, without reading the snapshot content', async () => {
    const published = info();
    const { service, calls } = build([published]);

    const result = await service.getLessonSnapshot(
      published.lessonId,
      'BEGINNER',
      snapshotEtag(published),
    );

    expect(result).toEqual({
      kind: 'NOT_MODIFIED',
      etag: snapshotEtag(published),
    });
    expect(calls).toEqual({ info: 1, content: 0 });
  });

  it('sends the full response when the tag does not match (another version or hash)', async () => {
    const published = info({ publicationVersion: 3 });
    const { service, calls } = build([published]);

    for (const stale of [
      snapshotEtag({ ...published, publicationVersion: 2 }),
      snapshotEtag({ ...published, contentHash: 'd'.repeat(64) }),
      '"nonsense"',
    ]) {
      const result = await service.getLessonSnapshot(
        published.lessonId,
        'BEGINNER',
        stale,
      );
      expect(result.kind).toBe('OK');
    }
    expect(calls.content).toBe(3);
  });

  it('never answers 304 for the validator of another lesson or level, even with an identical hash and version', async () => {
    const published = info({ publicationVersion: 1, level: 'BEGINNER' });
    const { service } = build([published]);
    const sameHashAndVersion = { contentHash: HASH, publicationVersion: 1 };
    const otherLesson = snapshotEtag({
      ...sameHashAndVersion,
      lessonId: randomUUID(),
      level: 'BEGINNER',
    });
    const otherLevel = snapshotEtag({
      ...sameHashAndVersion,
      lessonId: published.lessonId,
      level: 'ADVANCED',
    });

    for (const header of [
      otherLesson,
      otherLevel,
      `W/${otherLesson}`,
      `${otherLesson}, ${otherLevel}`,
    ]) {
      const result = await service.getLessonSnapshot(
        published.lessonId,
        'BEGINNER',
        header,
      );
      expect(result.kind, header).toBe('OK');
    }
  });

  it('answers 304 only for the validator of exactly this lesson, level and version', async () => {
    const published = info({ publicationVersion: 2, level: 'INTERMEDIATE' });
    const { service } = build([published]);
    const result = await service.getLessonSnapshot(
      published.lessonId,
      'INTERMEDIATE',
      snapshotEtag({
        lessonId: published.lessonId,
        level: 'INTERMEDIATE',
        publicationVersion: 2,
        contentHash: HASH,
      }),
    );
    expect(result.kind).toBe('NOT_MODIFIED');
  });

  it('honours weak validators, lists and *', async () => {
    const published = info();
    const { service } = build([published]);
    const etag = snapshotEtag(published);
    for (const header of [`W/${etag}`, `"x", ${etag}`, '*']) {
      const result = await service.getLessonSnapshot(
        published.lessonId,
        'BEGINNER',
        header,
      );
      expect(result.kind).toBe('NOT_MODIFIED');
    }
  });

  it('is a plain not found when nothing is active for that lesson and level', async () => {
    const { service, calls } = build([null]);
    const error = await service
      .getLessonSnapshot(randomUUID(), 'ADVANCED')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toBe('Lesson not found');
    expect((error as NotFoundError).details).toBeUndefined();
    expect(calls.content).toBe(0);
  });

  it('is the same not found even when the client already holds a tag (a withdrawn lesson never answers 304)', async () => {
    const { service } = build([null]);
    await expect(
      service.getLessonSnapshot(randomUUID(), 'BEGINNER', '*'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('looks again when the publication ended between the two reads (replaced), and serves the new one', async () => {
    const first = info({ publicationVersion: 1, publicationId: randomUUID() });
    const second = info({
      lessonId: first.lessonId,
      publicationVersion: 2,
      publicationId: randomUUID(),
      contentHash: 'e'.repeat(64),
    });
    const { service, calls } = build([first, second], [null, snapshot]);

    const result = await service.getLessonSnapshot(first.lessonId, 'BEGINNER');

    expect(result).toMatchObject({
      kind: 'OK',
      etag: snapshotEtag(second),
      envelope: { publicationVersion: 2, contentHash: second.contentHash },
    });
    expect(calls).toEqual({ info: 2, content: 2 });
  });

  it('is a not found when the publication was withdrawn between the two reads', async () => {
    const published = info();
    const { service } = build([published, null], [null]);
    await expect(
      service.getLessonSnapshot(published.lessonId, 'BEGINNER'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('gives up with a not found rather than looping forever if it keeps changing', async () => {
    const { service, calls } = build([info()], [null]);
    await expect(
      service.getLessonSnapshot(randomUUID(), 'BEGINNER'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(calls.info).toBe(3);
  });

  it('asks for exactly the requested level and never another', async () => {
    const asked: string[] = [];
    const facade = {
      findActiveSnapshotInfo: async (_id: string, level: string) => {
        asked.push(`info:${level}`);
        return null;
      },
      readActiveSnapshotContent: async (_id: string, level: string) => {
        asked.push(`content:${level}`);
        return null;
      },
    } as unknown as PublishingFacade;
    await new LessonDeliveryService(facade)
      .getLessonSnapshot(randomUUID(), 'INTERMEDIATE')
      .catch(() => undefined);
    expect(asked).toEqual(['info:INTERMEDIATE']);
  });
});
