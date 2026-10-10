/**
 * Editorial lifecycle state of curriculum content. Curriculum only stores it;
 * the Publishing module will own the transitions between states.
 */
export const CONTENT_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'APPROVED',
  'PUBLISHED',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** New content always starts as a draft. */
export const INITIAL_STATUS: ContentStatus = 'DRAFT';

/**
 * Editing content invalidates any review or approval, so the working copy goes
 * back to DRAFT. (What happens to an already-published version is Publishing's concern.)
 */
export function statusAfterEdit(_current: ContentStatus): ContentStatus {
  return 'DRAFT';
}
