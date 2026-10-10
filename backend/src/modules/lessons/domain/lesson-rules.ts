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

/** Optional text fields as the user may send them. undefined = leave alone, null = clear. */
export interface LessonFieldChanges {
  title?: string;
  shortTitle?: string | null;
  subtitle?: string | null;
  introduction?: string | null;
  estimatedMinutes?: number | null;
  coverMediaId?: string | null;
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

/** Media does not exist yet, so a lesson cannot have a cover. */
export function checkCoverMediaId(value: string | null | undefined): null {
  if (value !== null && value !== undefined) {
    throw new BusinessRuleError(
      'coverMediaId cannot be set until the Media module exists',
      { field: 'coverMediaId' },
    );
  }
  return null;
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
  if (Object.keys(result).length === 0) {
    throw new BusinessRuleError('Nothing to update');
  }
  return result;
}
