import { BusinessRuleError } from '../../../shared-kernel/index.js';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;

/** Titles are stored trimmed, must not be blank, and are length-limited. */
export function checkTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError('Title must not be blank');
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new BusinessRuleError(
      `Title must be at most ${TITLE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** A blank description is stored as "no description". */
export function normalizeDescription(
  description: string | null | undefined,
): string | null {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

export interface TextChanges {
  title?: string;
  /** null clears the description; undefined leaves it unchanged. */
  description?: string | null;
}

/** Validates a partial update and returns only the fields that actually change. */
export function checkTextChanges(changes: TextChanges): TextChanges {
  const result: TextChanges = {};
  if (changes.title !== undefined) result.title = checkTitle(changes.title);
  if (changes.description !== undefined) {
    result.description = normalizeDescription(changes.description);
  }
  if (Object.keys(result).length === 0) {
    throw new BusinessRuleError('Nothing to update');
  }
  return result;
}
