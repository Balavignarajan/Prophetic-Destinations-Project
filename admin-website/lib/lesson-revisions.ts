/**
 * Draft history of a lesson (CMS-029): the stored earlier drafts of its editable state and "Restore draft". The backend (lesson-revision.service.ts) takes the revisions,
 * checks a restore and makes it; this file only has the types the history screen reads and its wording. No runtime imports: unit-testable with plain Node.
 */
export type RevisionLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface LessonRevisionItem {
  id: string;
  /** The lesson's content revision at that state. */
  contentRevision: number;
  /** When that state was last changed. */
  savedAt: string;
  /** When the copy was stored. */
  capturedAt: string;
  title: string;
  blockCount: number;
  levels: RevisionLevel[];
  tags: string[];
  /** Set when this state is the result of a restore: the revision it came from, and who did it (their email). */
  restoredFromRevision: number | null;
  restoredBy: string | null;
  /** The state the lesson is in now. */
  isCurrent: boolean;
  /** False for the current state and for a copy in a format that cannot be restored. */
  restorable: boolean;
}

export interface LessonRevisionHistory {
  current: { contentRevision: number; status: string; updatedAt: string };
  items: LessonRevisionItem[];
  total: number;
}

export interface LessonRevisionRestoreResult {
  restoredFromRevision: number;
  /** The revision under which the draft that was replaced is kept (restoring it undoes the restore). */
  keptRevision: number;
}

const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/** "Beginner, Advanced", or "No levels". */
export const revisionLevelsText = (levels: readonly string[]): string => (levels.length === 0 ? 'No levels' : levels.map((level) => LEVEL_NAMES[level] ?? level).join(', '));

/** "12 blocks", "1 block". */
export const blocksText = (count: number): string => `${count} ${count === 1 ? 'block' : 'blocks'}`;

/** A date and time for the history, or an empty text for a bad value. */
export function revisionTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  try {
    return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(time).toISOString();
  }
}

/** Who or what made the state: a restore names the revision and the admin; an ordinary save is "Editor not recorded" (saves do not record who made them). */
export function revisionSource(item: Pick<LessonRevisionItem, 'restoredFromRevision' | 'restoredBy'>): string {
  if (item.restoredFromRevision === null) return 'Editor not recorded';
  return `Restored from revision ${item.restoredFromRevision}${item.restoredBy ? ` by ${item.restoredBy}` : ''}`;
}

/** What the server said about a refused restore: its message and, when it lists them, the reasons. */
export function revisionErrorDetail(error: unknown, fallback: string): { message: string; problems: string[] } {
  const e = error as { status?: number; message?: string; payload?: { message?: string; details?: { problems?: unknown } } } | null;
  const raw = e?.payload?.details?.problems;
  const problems = Array.isArray(raw) ? raw.flatMap((item) => (typeof item === 'string' ? [item] : typeof (item as { message?: unknown })?.message === 'string' ? [(item as { message: string }).message] : [])) : [];
  if (e?.status === 403) return { message: 'You do not have permission to restore a draft.', problems: [] };
  if (e?.status === 404) return { message: 'This revision or lesson is no longer available. Close this window, reload the lesson and open the history again.', problems: [] };
  return { message: e?.payload?.message || e?.message || fallback, problems };
}
