import { BusinessRuleError } from './domain-error.js';

/**
 * Rules for ordered children of a parent (modules in a course, lessons in a
 * module, blocks in a lesson). Items occupy positions 1..n with no gaps and no
 * duplicates; the database enforces uniqueness as a backstop. These are pure
 * functions: they know nothing about what is being ordered.
 */

/**
 * Where a new item goes. No requested position means "at the end". A position
 * inside the list inserts there and pushes the following items down.
 */
export function resolveInsertPosition(
  requested: number | undefined,
  existingCount: number,
): number {
  const last = existingCount + 1;
  if (requested === undefined) return last;
  if (!Number.isInteger(requested) || requested < 1 || requested > last) {
    throw new BusinessRuleError(`Position must be between 1 and ${last}`, {
      min: 1,
      max: last,
    });
  }
  return requested;
}

/** A reorder must list every existing item exactly once. */
export function checkReorder(
  currentIds: readonly string[],
  requestedIds: readonly string[],
): void {
  const current = new Set(currentIds);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of requestedIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  const unknown = [...seen].filter((id) => !current.has(id));
  const missing = currentIds.filter((id) => !seen.has(id));

  if (duplicates.size > 0 || unknown.length > 0 || missing.length > 0) {
    throw new BusinessRuleError('The order must list every item exactly once', {
      duplicates: [...duplicates],
      unknown,
      missing,
    });
  }
}

/** Positions assigned by a reorder: the i-th id gets position i + 1. */
export function positionsFor(ids: readonly string[]): number[] {
  return ids.map((_, index) => index + 1);
}
