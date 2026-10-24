/**
 * Reusable blocks (CMS-014), copy-based: a block saved from a lesson as a template and inserted into a lesson as a NEW, independent block. This file holds only the
 * admin's wording and small pure rules; the backend (backend/src/modules/lessons/domain/reusable-blocks.ts) decides everything and is the source of truth.
 * No runtime imports: unit-testable with plain Node.
 */

/** What "Add content" passes to the lesson editor when the author chooses the library instead of a content type. Not a block type. */
export const REUSABLE_PICKER_KEY = 'REUSABLE_BLOCKS';

export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_DESCRIPTION_MAX = 500;

/**
 * Types that cannot be saved as reusable blocks, with the reason shown to the author. Mirrors NON_REUSABLE_BLOCK_TYPES in the backend (which enforces it); this only
 * stops the admin offering an action that would be refused.
 */
export const NON_REUSABLE_TYPES: Readonly<Record<string, string>> = {
  QUIZ: 'A quiz block refers to a quiz, and the quiz is locked, versioned and protected only through the lessons that use it. Add the quiz to each lesson from the Quizzes section instead.',
  CONTINUE_EXPLORING: 'A Continue Exploring block links to other lessons, and those links are kept consistent only inside the lesson that holds them. Add the links in each lesson instead.',
};

/** The reason a block of this type cannot be saved as a reusable block, or null when it can. */
export function reusableTypeProblem(type: string): string | null {
  return NON_REUSABLE_TYPES[type] ?? null;
}

/**
 * The types whose SHARED content can be edited inside the library, with the block's own editor. Every other type keeps its content as it was saved (it can still be
 * renamed, inserted and deleted); to change its content, save the updated lesson block as a new reusable block. The six are the types with a self-contained editor
 * that works on content alone.
 */
export const LIBRARY_EDITABLE_TYPES: readonly string[] = ['RICH_TEXT', 'CALLOUT', 'SCRIPTURE_CONNECTION', 'WORD_STUDY', 'SYMBOL_STUDY', 'HISTORICAL_EVIDENCE'];

export const canEditContentInLibrary = (type: string): boolean => LIBRARY_EDITABLE_TYPES.includes(type);

const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
export const levelName = (level: string): string => LEVEL_NAMES[level] ?? level;

interface LevelLike {
  level: string;
  hasVariant?: boolean;
  content?: Record<string, unknown> | null;
}

const hasOwnVersion = (entry: LevelLike): boolean => entry.hasVariant === true || (entry.content !== undefined && entry.content !== null);

/** "Beginner, Intermediate, Advanced", or "No levels" when the block was hidden everywhere. */
export function levelsText(levels: readonly LevelLike[]): string {
  return levels.length === 0 ? 'No levels' : levels.map((entry) => levelName(entry.level)).join(', ');
}

/** The levels that have their own version, e.g. "Advanced has its own version" (empty text when none does). */
export function versionsText(levels: readonly LevelLike[]): string {
  const own = levels.filter(hasOwnVersion).map((entry) => levelName(entry.level));
  if (own.length === 0) return '';
  return `${own.join(' and ')} ${own.length === 1 ? 'has' : 'have'} its own version`;
}

export interface InsertionHint {
  /** Levels the lesson is available at that the template is visible at: these are carried over. */
  carried: string[];
  /** Levels the template is visible at that this lesson is NOT available at: left out (with their own version, if any). */
  leftOut: { level: string; hadVariant: boolean }[];
}

/** What inserting into a lesson available at `lessonLevels` would carry over, to show before the author confirms. The backend makes the same decision and has the last word. */
export function insertionHint(templateLevels: readonly LevelLike[], lessonLevels: readonly string[]): InsertionHint {
  const carried: string[] = [];
  const leftOut: InsertionHint['leftOut'] = [];
  for (const entry of templateLevels) {
    if (lessonLevels.includes(entry.level)) carried.push(entry.level);
    else leftOut.push({ level: entry.level, hadVariant: hasOwnVersion(entry) });
  }
  return { carried, leftOut };
}

/** What the server says would be left out, when it refused an insertion for that reason (and only then). */
export function leftOutFromError(error: unknown): { level: string; hadVariant: boolean; reason: string }[] | null {
  const details = (error as { payload?: { details?: { code?: unknown; leftOut?: unknown } } } | null)?.payload?.details;
  if (!details || details.code !== 'TEMPLATE_LEVELS_NOT_CARRIED_OVER' || !Array.isArray(details.leftOut)) return null;
  return details.leftOut.flatMap((entry) => {
    const item = entry as { level?: unknown; hadVariant?: unknown; reason?: unknown };
    return typeof item.level === 'string' ? [{ level: item.level, hadVariant: item.hadVariant === true, reason: typeof item.reason === 'string' ? item.reason : '' }] : [];
  });
}

/** The server's own words for a refused save or insertion (it names the problem), falling back to a plain sentence. */
export function reusableErrorMessage(error: unknown, fallback: string): string {
  const e = error as { status?: number; message?: string; payload?: { message?: string; details?: { problems?: { message?: string }[] } } } | null;
  if (e?.status === 409) return 'Someone changed this reusable block first. Close this window, reload the page to see the latest version, and try again.';
  if (e?.status === 404) return 'This reusable block or lesson is no longer available. Reload the page and try again.';
  if (e?.status === 403) return 'You do not have permission to do this.';
  const problems = e?.payload?.details?.problems?.map((problem) => problem.message).filter(Boolean);
  if (problems && problems.length > 0) return problems.join(' ');
  return e?.payload?.message || e?.message || fallback;
}

/** "5 Jun 2026" style date for the library list; a bad value gives an empty text. */
export function shortDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  try {
    return new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return new Date(time).toISOString().slice(0, 10);
  }
}
