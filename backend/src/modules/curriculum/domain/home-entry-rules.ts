import { BusinessRuleError } from '../../../shared-kernel/index.js';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id as stored (lower case), or a readable refusal naming the field. */
export function checkReference(value: string, field: 'homeEntryId' | 'imageMediaId'): string {
  if (!UUID.test(value)) {
    throw new BusinessRuleError(field === 'homeEntryId' ? 'homeEntryId must be a Home Entry id' : 'imageMediaId must be a media asset id', { field });
  }
  return value.toLowerCase();
}
