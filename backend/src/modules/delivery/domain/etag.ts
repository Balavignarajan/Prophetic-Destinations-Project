import { createHash } from 'node:crypto';

/**
 * Entity tags for published lesson snapshots (pure rules; no HTTP, no database).
 *
 * The validator identifies the COMPLETE representation the API returns: the envelope
 * { lessonId, level, publicationVersion, contentHash, snapshot }. So every value that identifies
 * that representation goes into it, explicitly:
 *
 *   - `lessonId` and `level`: which lesson and which learning level this is;
 *   - `publicationVersion`: republishing identical content as a new version changes the envelope,
 *     so it must NOT be answered with 304 (the client would keep a stale `publicationVersion`);
 *   - `contentHash`: the stored SHA-256 identity of the snapshot payload.
 *
 * The stored hash is computed over a payload that already contains the lesson id and the level, so
 * today two different lessons or levels cannot share one. The validator does not rely on that: it
 * stays correct even if identical hashes and versions ever occur for different lessons or levels
 * (a payload format change, a data repair).
 *
 * The tag is the SHA-256 (hex) of one unambiguous serialization of those values: a JSON array with
 * a fixed scheme label first. JSON quotes and escapes every string, so no two different inputs can
 * produce the same text (unlike joining the values with a separator, where `("ab","c")` and
 * `("a","bc")` would collide). Nothing volatile (clock, request id) goes in, so equal
 * representations always get equal tags. The tag is strong: it is only sent for a byte-for-byte
 * stable body. It is opaque to clients. If the envelope or this scheme changes, change the label.
 */
export const ETAG_SCHEME = 'prophetic-destinations/lesson-snapshot-etag/2';

export function snapshotEtag(representation: {
  lessonId: string;
  level: string;
  publicationVersion: number;
  contentHash: string;
}): string {
  const identity = JSON.stringify([
    ETAG_SCHEME,
    representation.lessonId,
    representation.level,
    representation.publicationVersion,
    representation.contentHash,
  ]);
  return `"${createHash('sha256').update(identity, 'utf8').digest('hex')}"`;
}

/** One entity-tag: optional weak prefix, then a quoted opaque tag (RFC 9110 section 8.8.3). */
const ENTITY_TAG = /(?:W\/)?"[^"]*"/g;

/**
 * Whether an `If-None-Match` request header matches the current representation, using the weak
 * comparison that RFC 9110 prescribes for If-None-Match: `W/"x"` and `"x"` are the same tag.
 *
 * - `*` matches any current representation (and one exists, or this is not called).
 * - A list matches when any member matches.
 * - Anything that is not `*` or a list of well-formed entity-tags matches nothing, so a malformed
 *   header simply yields the full response instead of an error.
 */
export function ifNoneMatchMatches(
  header: string | undefined,
  currentEtag: string,
): boolean {
  if (header === undefined) return false;
  const trimmed = header.trim();
  if (trimmed === '*') return true;

  const current = opaque(currentEtag);
  for (const tag of trimmed.match(ENTITY_TAG) ?? []) {
    if (opaque(tag) === current) return true;
  }
  return false;
}

/** The quoted opaque tag without any weakness indicator. */
function opaque(entityTag: string): string {
  return entityTag.startsWith('W/') ? entityTag.slice(2) : entityTag;
}

/** JSON with object keys sorted at every depth (arrays keep their order), so equal values serialize identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export const REPRESENTATION_ETAG_SCHEME =
  'prophetic-destinations/catalog-representation-etag/1';

/**
 * Strong entity tag of a catalog representation (course list, course, lesson navigation): the SHA-256 of one
 * unambiguous serialization of `[scheme, kind, identity..., body]`. It is computed over the response body
 * that will actually be sent, which already reflects the live eligibility filter, so it covers the COMPLETE
 * representation: a different course, level, catalog version, eligible set or lesson never shares a tag, and an
 * unchanged representation always gets the same one. Nothing volatile goes in.
 */
export function representationEtag(
  kind: 'course-list' | 'course' | 'navigation',
  identity: readonly (string | number)[],
  body: unknown,
): string {
  const text = stableStringify([
    REPRESENTATION_ETAG_SCHEME,
    kind,
    ...identity,
    body,
  ]);
  return `"${createHash('sha256').update(text, 'utf8').digest('hex')}"`;
}
