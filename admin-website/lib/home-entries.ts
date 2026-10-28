import type { ApiErrorPayload, HomeEntry } from './types';

/** The same limits as the server (and the database): the card is a small tile. */
export const HOME_ENTRY_TITLE_MAX = 120;
export const HOME_ENTRY_DESCRIPTION_MAX = 500;

/** "1 course" / "3 courses". */
export const courseCountText = (count: number): string => `${count} ${count === 1 ? 'course' : 'courses'}`;

/**
 * A plain-words note about an entry for the administrator, or null when there is nothing to say. "No courses assigned" is information for the CMS only: a learner never sees an entry
 * without an eligible course, whatever the reason (none assigned, none published, none at their level).
 */
export function entryNote(entry: HomeEntry): string | null {
  if (!entry.isEnabled) return 'Disabled: learners do not see this entry.';
  if (entry.courseCount === 0) return 'No courses assigned. Learners do not see this entry until a published course is assigned to it (in the course form).';
  return null;
}

/** How an entry is named in the course form's Home Entry dropdown: its title, with a note when learners cannot see it. */
export const entryOptionLabel = (entry: HomeEntry): string => (entry.isEnabled ? entry.title : `${entry.title} (disabled)`);

/** Whether two lists hold the same ids in the same order. */
export const sameOrder = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index]);

/** A copy of the list with the item at `from` moved to `to` (both 0-based); the list itself is not changed. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Whether saving the order failed because the list is not what this screen thought it was (409: someone reordered, added or deleted an entry; 404 or 422: an entry in the order is gone or the
 * ids no longer match). Retrying the same order would be wrong, and overwriting would undo someone else's work, so the screen reloads the latest list instead.
 */
export function isOrderConflict(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 409 || status === 404 || status === 422;
}

type ApiLikeError = { message?: string; status?: number; payload?: ApiErrorPayload };

/**
 * A readable message for a failed Home Entry request. The server's own message is used where it explains the problem (a duplicate title, a missing image, a changed order); a stale
 * version, a missing entry and a refused permission get the short standard wording.
 */
export function homeEntryErrorMessage(error: unknown, fallback: string): string {
  const e = (error ?? {}) as ApiLikeError;
  const payload = e.payload;
  if (e.status === 403 || payload?.code === 'FORBIDDEN') return 'You do not have permission to change Home Entries.';
  if (e.status === 404 || payload?.code === 'NOT_FOUND') return 'This Home Entry is no longer available. Reload the page and try again.';
  if (payload?.code === 'VALIDATION_FAILED') {
    const details = payload.details as unknown;
    const lines = Array.isArray(details)
      ? details.flatMap((item) => {
          const entry = item as { field?: unknown; messages?: unknown };
          return Array.isArray(entry.messages) ? entry.messages.filter((m): m is string => typeof m === 'string') : [];
        })
      : [];
    return lines.length > 0 ? lines.join(' ') : 'Some of the details are not valid. Check the title, description and image.';
  }
  if (e.status === 409) {
    // The server says what collided: a stale version, a changed order, or a title that is already taken.
    return payload?.message ?? 'Someone else changed Home Entries first. Reload the page to see the latest, then try again.';
  }
  if (payload?.message) return payload.message;
  return e.message || fallback;
}
