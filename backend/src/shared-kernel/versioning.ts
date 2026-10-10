import { ConflictError } from './domain-error.js';

/**
 * Optimistic concurrency: if the editor says which version they were looking at
 * and it is no longer current, someone else changed the item first.
 */
export function checkExpectedVersion(
  currentVersion: number,
  expectedVersion: number | undefined,
): void {
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new ConflictError(
      'This item was changed by someone else. Reload it and try again.',
      { currentVersion },
    );
  }
}
