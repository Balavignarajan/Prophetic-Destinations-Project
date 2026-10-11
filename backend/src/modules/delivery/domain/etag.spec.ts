import { createHash, randomUUID } from 'node:crypto';
import { ETAG_SCHEME, ifNoneMatchMatches, snapshotEtag } from './etag.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const LESSON_1 = '11111111-1111-4111-8111-111111111111';
const LESSON_2 = '22222222-2222-4222-8222-222222222222';

/** A full representation identity; tests override one field at a time. */
const rep = (
  overrides: Partial<Parameters<typeof snapshotEtag>[0]> = {},
): Parameters<typeof snapshotEtag>[0] => ({
  lessonId: LESSON_1,
  level: 'BEGINNER',
  publicationVersion: 1,
  contentHash: HASH_A,
  ...overrides,
});

describe('snapshotEtag', () => {
  it('is a quoted, strong, opaque tag: the SHA-256 (hex) of an unambiguous serialization', () => {
    const tag = snapshotEtag(rep({ publicationVersion: 3 }));
    expect(tag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(tag.startsWith('W/')).toBe(false);
    // the documented construction, written out independently
    const expected = createHash('sha256')
      .update(
        JSON.stringify([ETAG_SCHEME, LESSON_1, 'BEGINNER', 3, HASH_A]),
        'utf8',
      )
      .digest('hex');
    expect(tag).toBe(`"${expected}"`);
    // and it is not just the stored content hash
    expect(tag).not.toContain(HASH_A);
  });

  it('is stable: the same representation always gives the same tag', () => {
    const first = snapshotEtag(rep());
    expect(snapshotEtag(rep())).toBe(first);
    expect(snapshotEtag({ ...rep() })).toBe(first);
    // key order of the argument does not matter
    expect(
      snapshotEtag({
        contentHash: HASH_A,
        publicationVersion: 1,
        level: 'BEGINNER',
        lessonId: LESSON_1,
      }),
    ).toBe(first);
  });

  it('differs for different lessons with an identical snapshot hash, level and publication version', () => {
    expect(snapshotEtag(rep({ lessonId: LESSON_1 }))).not.toBe(
      snapshotEtag(rep({ lessonId: LESSON_2 })),
    );
  });

  it('differs for different levels with an identical snapshot hash, lesson and publication version', () => {
    const tags = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((level) =>
      snapshotEtag(rep({ level })),
    );
    expect(new Set(tags).size).toBe(3);
  });

  it('differs for a different publication version with identical snapshot content (a republish)', () => {
    expect(snapshotEtag(rep({ publicationVersion: 1 }))).not.toBe(
      snapshotEtag(rep({ publicationVersion: 2 })),
    );
  });

  it('differs for different snapshot content', () => {
    expect(snapshotEtag(rep({ contentHash: HASH_A }))).not.toBe(
      snapshotEtag(rep({ contentHash: HASH_B })),
    );
  });

  it('changes when any single field changes (no field is ignored)', () => {
    const base = snapshotEtag(rep());
    for (const change of [
      { lessonId: LESSON_2 },
      { level: 'ADVANCED' },
      { publicationVersion: 2 },
      { contentHash: HASH_B },
    ]) {
      expect(snapshotEtag(rep(change)), JSON.stringify(change)).not.toBe(base);
    }
  });

  it('is unambiguous: moving characters between fields can never give the same tag', () => {
    const tag = (lessonId: string, level: string) =>
      snapshotEtag(rep({ lessonId, level }));
    expect(tag('ab', 'c')).not.toBe(tag('a', 'bc'));
    expect(tag('a-', 'b')).not.toBe(tag('a', '-b'));
    expect(tag('a","b', 'c')).not.toBe(tag('a', 'b","c'));
    expect(tag('', 'x')).not.toBe(tag('x', ''));
    // a version that looks like part of the hash is still a number in its own slot
    expect(
      snapshotEtag(rep({ contentHash: `${HASH_A}1`, publicationVersion: 1 })),
    ).not.toBe(
      snapshotEtag(rep({ contentHash: HASH_A, publicationVersion: 11 })),
    );
  });

  it('has no collisions across many lessons, levels and versions', () => {
    const tags = new Set<string>();
    let count = 0;
    for (let i = 0; i < 40; i += 1) {
      const lessonId = randomUUID();
      for (const level of ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']) {
        for (const publicationVersion of [1, 2, 3]) {
          tags.add(snapshotEtag(rep({ lessonId, level, publicationVersion })));
          count += 1;
        }
      }
    }
    expect(tags.size).toBe(count);
  });

  it('contains nothing volatile', () => {
    const a = snapshotEtag(rep());
    const later = new Date(Date.now() + 3_600_000);
    vi.useFakeTimers();
    vi.setSystemTime(later);
    try {
      expect(snapshotEtag(rep())).toBe(a);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ifNoneMatchMatches', () => {
  const current = snapshotEtag(rep({ publicationVersion: 4 }));
  const other = snapshotEtag(
    rep({ contentHash: HASH_B, publicationVersion: 4 }),
  );
  const olderVersion = snapshotEtag(rep({ publicationVersion: 3 }));
  const otherLesson = snapshotEtag(
    rep({ lessonId: LESSON_2, publicationVersion: 4 }),
  );
  const otherLevel = snapshotEtag(
    rep({ level: 'ADVANCED', publicationVersion: 4 }),
  );

  it('matches the current tag', () => {
    expect(ifNoneMatchMatches(current, current)).toBe(true);
  });

  it("does not match another lesson's or another level's tag, even with the same hash and version", () => {
    expect(ifNoneMatchMatches(otherLesson, current)).toBe(false);
    expect(ifNoneMatchMatches(otherLevel, current)).toBe(false);
    expect(ifNoneMatchMatches(`W/${otherLesson}, ${otherLevel}`, current)).toBe(
      false,
    );
  });

  it('does not match a different tag, an older version of the same content, or nothing', () => {
    expect(ifNoneMatchMatches(other, current)).toBe(false);
    expect(ifNoneMatchMatches(olderVersion, current)).toBe(false);
    expect(ifNoneMatchMatches(undefined, current)).toBe(false);
    expect(ifNoneMatchMatches('', current)).toBe(false);
  });

  it('uses weak comparison: a weak validator of the same tag matches', () => {
    expect(ifNoneMatchMatches(`W/${current}`, current)).toBe(true);
    expect(ifNoneMatchMatches(`W/${other}`, current)).toBe(false);
  });

  it('matches when any member of a list matches, with or without spaces', () => {
    expect(ifNoneMatchMatches(`${other}, ${current}`, current)).toBe(true);
    expect(ifNoneMatchMatches(`${other},${current}`, current)).toBe(true);
    expect(ifNoneMatchMatches(`W/${other} , W/${current}`, current)).toBe(true);
    expect(ifNoneMatchMatches(`${other}, ${olderVersion}`, current)).toBe(
      false,
    );
  });

  it('treats * as matching any current representation', () => {
    expect(ifNoneMatchMatches('*', current)).toBe(true);
    expect(ifNoneMatchMatches('  *  ', current)).toBe(true);
  });

  it('does not treat * inside a list or a quoted tag as the wildcard', () => {
    expect(ifNoneMatchMatches(`"*"`, current)).toBe(false);
    expect(ifNoneMatchMatches(`${other}, *`, current)).toBe(false);
  });

  it('requires the quotes: a bare hash is not an entity tag', () => {
    expect(ifNoneMatchMatches(current.slice(1, -1), current)).toBe(false);
  });

  it.each([
    'garbage',
    '"unterminated',
    'W/',
    ',,,',
    `${HASH_A}`,
    "'single-quoted'",
  ])('ignores a malformed header (%s): the full response is sent', (header) => {
    expect(ifNoneMatchMatches(header, current)).toBe(false);
  });

  it('is case sensitive for the opaque tag, as the specification requires', () => {
    expect(ifNoneMatchMatches(current.toUpperCase(), current)).toBe(false);
  });

  it('copes with tags that contain commas', () => {
    expect(ifNoneMatchMatches(`"a,b", ${current}`, current)).toBe(true);
    expect(ifNoneMatchMatches(`"a,b"`, `"a,b"`)).toBe(true);
  });
});
