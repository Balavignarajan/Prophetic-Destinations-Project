import {
  BusinessRuleError,
  LEARNING_LEVELS,
  type LearningLevel,
  isLearningLevel,
} from '../../../shared-kernel/index.js';

/**
 * Backend validation limits. Input over a limit is rejected with a validation
 * error; it is never truncated.
 */
export const LIMITS = {
  title: 200,
  shortTitle: 100,
  subtitle: 300,
  introduction: 5000,
} as const;

/** The largest value the database column (integer) can hold. */
export const MAX_ESTIMATED_MINUTES = 2_147_483_647;

/** Lesson tags (CMS-021): at most this many per lesson, each at most this many characters. A provisional, conservative choice; nothing is truncated. */
export const TAG_LIMITS = { count: 10, length: 40 } as const;

/** Optional text fields as the user may send them. undefined = leave alone, null = clear. */
export interface LessonFieldChanges {
  title?: string;
  shortTitle?: string | null;
  subtitle?: string | null;
  introduction?: string | null;
  estimatedMinutes?: number | null;
  coverMediaId?: string | null;
  /** undefined = leave the lesson's tags alone; an array REPLACES them (an empty one removes them all). */
  tags?: string[];
}

function rejectNul(value: string, field: string): void {
  // PostgreSQL cannot store NUL characters in text.
  if (value.includes('\u0000')) {
    throw new BusinessRuleError(`${field} contains an invalid character`, {
      field,
    });
  }
}

/** Required, trimmed, not blank, within the limit. */
export function checkTitle(title: string): string {
  const trimmed = title.trim();
  rejectNul(trimmed, 'title');
  if (trimmed.length === 0) {
    throw new BusinessRuleError('Title must not be blank', { field: 'title' });
  }
  if (trimmed.length > LIMITS.title) {
    throw new BusinessRuleError(
      `Title must be at most ${LIMITS.title} characters`,
      { field: 'title', max: LIMITS.title },
    );
  }
  return trimmed;
}

/**
 * Optional plain text: trimmed, blank means "none", over-long is rejected.
 * Line breaks inside the text (paragraphs) are kept; only line endings are normalised.
 */
export function checkOptionalText(
  value: string | null | undefined,
  field: keyof Omit<typeof LIMITS, 'title'>,
): string | null {
  if (value === null || value === undefined) return null;
  const text = value.replace(/\r\n?/g, '\n').trim();
  rejectNul(text, field);
  if (text.length === 0) return null;
  if (text.length > LIMITS[field]) {
    throw new BusinessRuleError(
      `${field} must be at most ${LIMITS[field]} characters`,
      { field, max: LIMITS[field] },
    );
  }
  return text;
}

export function checkEstimatedMinutes(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1 || value > MAX_ESTIMATED_MINUTES) {
    throw new BusinessRuleError(
      'estimatedMinutes must be a whole number of at least 1',
      { field: 'estimatedMinutes' },
    );
  }
  return value;
}

/**
 * The cover is a reference to a media asset (null = none). Only the shape is checked here; the application checks
 * that the asset exists and is an image.
 */
export function checkCoverMediaId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BusinessRuleError('coverMediaId must be a media asset id', { field: 'coverMediaId' });
  }
  return value.toLowerCase();
}

/**
 * Validates a set of levels and returns it in canonical order. Unknown levels
 * and duplicates are errors (never silently dropped). An empty set is allowed
 * for a draft; publishing will require at least one.
 */
export function checkLevels(levels: readonly string[]): LearningLevel[] {
  const unknown = levels.filter((level) => !isLearningLevel(level));
  if (unknown.length > 0) {
    throw new BusinessRuleError('Unknown learning level', {
      unknown,
      allowed: [...LEARNING_LEVELS],
    });
  }
  if (new Set(levels).size !== levels.length) {
    throw new BusinessRuleError('Each learning level may be listed only once');
  }
  return LEARNING_LEVELS.filter((level) => levels.includes(level));
}

/**
 * Validates a lesson's tags and returns them as they will be stored: inner whitespace collapsed to single spaces, surrounding whitespace removed, the author's own
 * capitalisation and order kept. Never silently changes what a tag says beyond that: an empty tag, a control character, a too-long tag, too many tags and a repeat
 * (tags are compared without regard to capitalisation, so "Daniel" and "daniel" are the same tag) are all refused with the reason, not dropped.
 */
export function checkTags(tags: readonly string[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== 'string') throw new BusinessRuleError('Each tag must be text', { field: 'tags' });
    const tag = raw.replace(/\s+/g, ' ').trim();
    if (tag.length === 0) throw new BusinessRuleError('A tag cannot be empty', { field: 'tags' });
    for (const character of tag) {
      const code = character.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) throw new BusinessRuleError(`The tag "${tag}" contains a character that cannot be used`, { field: 'tags' });
    }
    if (tag.length > TAG_LIMITS.length) {
      throw new BusinessRuleError(`A tag can be at most ${TAG_LIMITS.length} characters ("${tag.slice(0, 20)}…" is longer)`, { field: 'tags', max: TAG_LIMITS.length });
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) throw new BusinessRuleError(`The tag "${tag}" is listed more than once. Tags are not case-sensitive.`, { field: 'tags' });
    seen.add(key);
    kept.push(tag);
  }
  if (kept.length > TAG_LIMITS.count) {
    throw new BusinessRuleError(`A lesson can have at most ${TAG_LIMITS.count} tags`, { field: 'tags', max: TAG_LIMITS.count });
  }
  return kept;
}

/** Whether two tag lists are exactly the same (same tags, same capitalisation, same order). */
export function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/** Validates a partial update and returns only the fields that change. At least one is required. */
export function checkLessonChanges(
  changes: LessonFieldChanges,
): LessonFieldChanges {
  const result: LessonFieldChanges = {};
  if (changes.title !== undefined) result.title = checkTitle(changes.title);
  if (changes.shortTitle !== undefined) {
    result.shortTitle = checkOptionalText(changes.shortTitle, 'shortTitle');
  }
  if (changes.subtitle !== undefined) {
    result.subtitle = checkOptionalText(changes.subtitle, 'subtitle');
  }
  if (changes.introduction !== undefined) {
    result.introduction = checkOptionalText(
      changes.introduction,
      'introduction',
    );
  }
  if (changes.estimatedMinutes !== undefined) {
    result.estimatedMinutes = checkEstimatedMinutes(changes.estimatedMinutes);
  }
  if (changes.coverMediaId !== undefined) {
    result.coverMediaId = checkCoverMediaId(changes.coverMediaId);
  }
  if (changes.tags !== undefined) {
    result.tags = checkTags(changes.tags);
  }
  if (Object.keys(result).length === 0) {
    throw new BusinessRuleError('Nothing to update');
  }
  return result;
}

/** Whether a validated partial update would actually change the lesson's stored fields. */
export function lessonFieldsDiffer(
  current: {
    title: string;
    shortTitle: string | null;
    subtitle: string | null;
    introduction: string | null;
    estimatedMinutes: number | null;
    coverMediaId: string | null;
    tags: readonly string[];
  },
  changes: LessonFieldChanges,
): boolean {
  return (
    (changes.tags !== undefined && !sameTags(changes.tags, current.tags)) ||
    (changes.title !== undefined && changes.title !== current.title) ||
    (changes.shortTitle !== undefined &&
      changes.shortTitle !== current.shortTitle) ||
    (changes.subtitle !== undefined && changes.subtitle !== current.subtitle) ||
    (changes.introduction !== undefined &&
      changes.introduction !== current.introduction) ||
    (changes.estimatedMinutes !== undefined &&
      changes.estimatedMinutes !== current.estimatedMinutes) ||
    (changes.coverMediaId !== undefined &&
      changes.coverMediaId !== current.coverMediaId)
  );
}

/** Two level sets are the same when they hold the same levels (both are in canonical order). */
export function sameLevels(
  a: readonly LearningLevel[],
  b: readonly LearningLevel[],
): boolean {
  return a.length === b.length && a.every((level, index) => level === b[index]);
}
