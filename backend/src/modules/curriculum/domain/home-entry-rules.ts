import { BusinessRuleError, LEARNING_LEVELS, type LearningLevel, isLearningLevel } from '../../../shared-kernel/index.js';

/** Limits of a Home Entry's text. The card is a small tile, so they are tighter than a course's. The database CHECKs say the same. */
export const HOME_ENTRY_TITLE_MAX_LENGTH = 120;
export const HOME_ENTRY_DESCRIPTION_MAX_LENGTH = 500;

/** A title is stored trimmed, must not be blank and is length-limited. */
export function checkHomeEntryTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError('Give the Home Entry a title', { field: 'title' });
  }
  if (trimmed.length > HOME_ENTRY_TITLE_MAX_LENGTH) {
    throw new BusinessRuleError(`The title must be at most ${HOME_ENTRY_TITLE_MAX_LENGTH} characters`, { field: 'title' });
  }
  return trimmed;
}

/** A blank description is stored as "no description"; a longer one than the limit is refused. */
export function normalizeHomeEntryDescription(description: string | null | undefined): string | null {
  const trimmed = description?.trim();
  if (!trimmed) return null;
  if (trimmed.length > HOME_ENTRY_DESCRIPTION_MAX_LENGTH) {
    throw new BusinessRuleError(`The description must be at most ${HOME_ENTRY_DESCRIPTION_MAX_LENGTH} characters`, { field: 'description' });
  }
  return trimmed;
}

/**
 * The learning levels an administrator chose for a Home Entry: at least one, each a real learning level (the project's own LEARNING_LEVELS, no second list), none twice. Returned in
 * level order (Beginner, Intermediate, Advanced) whatever order they arrived in.
 */
export function checkVisibleLevels(levels: readonly unknown[]): LearningLevel[] {
  if (levels.length === 0) {
    throw new BusinessRuleError('Choose at least one learning level for the Home Entry', { field: 'visibleLevels' });
  }
  const chosen = new Set<LearningLevel>();
  for (const level of levels) {
    if (!isLearningLevel(level)) {
      throw new BusinessRuleError(`visibleLevels can only contain ${LEARNING_LEVELS.join(', ')}`, { field: 'visibleLevels' });
    }
    if (chosen.has(level)) {
      throw new BusinessRuleError('Each learning level can be chosen only once', { field: 'visibleLevels' });
    }
    chosen.add(level);
  }
  return LEARNING_LEVELS.filter((level) => chosen.has(level));
}

/** What is stored for a choice: null = every level (so "all three" is stored the same way as "never chosen"), otherwise the chosen levels. */
export const visibleLevelsToStored = (levels: readonly LearningLevel[]): LearningLevel[] | null => (levels.length === LEARNING_LEVELS.length ? null : [...levels]);

/** The explicit list a stored value means: null (or an empty list, which the database does not allow) is every level. */
export function visibleLevelsFromStored(stored: readonly string[] | null | undefined): LearningLevel[] {
  if (!stored || stored.length === 0) return [...LEARNING_LEVELS];
  return LEARNING_LEVELS.filter((level) => stored.includes(level));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id as stored (lower case), or a readable refusal naming the field. */
export function checkReference(value: string, field: 'homeEntryId' | 'imageMediaId'): string {
  if (!UUID.test(value)) {
    throw new BusinessRuleError(field === 'homeEntryId' ? 'homeEntryId must be a Home Entry id' : 'imageMediaId must be a media asset id', { field });
  }
  return value.toLowerCase();
}
