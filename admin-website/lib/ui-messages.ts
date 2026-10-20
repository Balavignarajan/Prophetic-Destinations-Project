import type { ApiErrorPayload, ReadinessIssue } from './types';

type ApiLikeError = {
  message?: string;
  status?: number;
  payload?: ApiErrorPayload;
};

const LEVEL_NAMES: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

export function readableLevel(level?: string): string {
  return level ? (LEVEL_NAMES[level] ?? level.replace(/_/g, ' ').toLowerCase()) : 'this level';
}

/** Keeps server diagnostics available without making editors decode implementation codes. */
export function readinessMessage(issue: ReadinessIssue): string {
  const level = readableLevel(issue.level);
  switch (issue.code) {
    case 'NO_VISIBLE_BLOCKS':
      return `${level} learners cannot see any content yet. Make at least one block visible to ${level}.`;
    case 'LESSON_HAS_NO_LEVELS':
      return 'Choose at least one learning level for this lesson before publishing.';
    case 'LESSON_TITLE_MISSING':
      return 'Add a lesson title before publishing.';
    case 'BLOCK_CONTENT_INCOMPLETE': {
      // Say what is missing when the server told us (for example an empty or edited quiz).
      const detail = issue.problems?.map((problem) => problem.message).filter(Boolean).join(' ');
      return detail ? `${level} learners: ${detail}` : `Complete the content in this block for ${level} learners before publishing.`;
    }
    case 'BLOCK_CONTENT_INVALID':
      return `This block has content that cannot be shown to ${level} learners. Edit it before publishing.`;
    case 'BLOCK_TYPE_NOT_AVAILABLE':
      return `This block type is not available to ${level} learners, so it cannot be published yet.`;
    case 'COVER_NOT_SUPPORTED':
      return 'This lesson has a cover that cannot be published yet.';
    case 'SNAPSHOT_TOO_LARGE':
      return `The ${level} lesson content is too large to publish. Shorten or split its content.`;
    default:
      return issue.message;
  }
}

export function friendlyError(error: unknown, fallback: string): string {
  const e = error as ApiLikeError;
  if (e.status === 409) {
    return 'Someone saved a newer version of this item. Your changes are still here; reload the page to review the latest version before trying again.';
  }
  const code = e.payload?.code;
  if (code === 'FORBIDDEN' || e.status === 403) return 'You do not have permission to complete this action.';
  if (code === 'NOT_FOUND' || e.status === 404) return 'This item is no longer available. Reload the page and try again.';
  if (e.payload?.message) return e.payload.message;
  return e.message || fallback;
}
