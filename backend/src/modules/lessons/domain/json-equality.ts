import { isDeepStrictEqual } from 'node:util';

/**
 * Equality of two stored JSON contents, used to recognise a no-op write.
 *
 * Contents are compared as JSON values: object key order does not matter
 * (PostgreSQL's jsonb does not keep it either), array order does, and `null`
 * (no content) only equals `null`. Both sides are plain JSON, so there is no
 * `undefined`, no dates and no class instances to worry about.
 */
export function jsonContentEquals(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (a === null || b === null) return a === b;
  return isDeepStrictEqual(a, b);
}
