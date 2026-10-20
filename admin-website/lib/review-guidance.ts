import type { LearningLevel, ReadinessIssue } from './types';

/**
 * Wording and small pure rules for the review-and-publish panel. Everything here describes how the backend ALREADY works (workflow rules in
 * backend/src/modules/publishing/domain/workflow.ts and roles.ts); it adds no rule. Facts it relies on:
 *   - the steps are Draft -> Submit for review -> Approve -> Publish; any edit of the content returns the lesson to Draft;
 *   - the readiness check is enforced when PUBLISHING, not when submitting or approving;
 *   - submitting is for administrators and editors; approving and requesting changes for administrators and reviewers; publishing and
 *     unpublishing for administrators only;
 *   - learners see a lesson only if the lesson is published AND an active course catalog version lists it.
 * No imports from the app (types only): usable anywhere.
 */
export type LessonStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';

export const STATUS_LABEL: Record<LessonStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_REVIEW: 'Waiting for review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
};

/** What a status means for the author, in plain words. */
export function statusExplanation(status: LessonStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'This is the working copy and it has not been sent for review (or it came back for changes). Submit it for review when you are happy with it.';
    case 'READY_FOR_REVIEW':
      return 'It is waiting for a reviewer. A reviewer can approve it, or send it back to Draft with a note about what to change.';
    case 'APPROVED':
      return 'A reviewer has approved this content. An administrator can now publish it. Approving did not publish it.';
    case 'PUBLISHED':
      return 'A published version of this lesson exists. Your working copy matches the last version published, until you edit it.';
  }
}

export const ACTION_LABEL: Record<string, string> = {
  SUBMIT_FOR_REVIEW: 'Submit for review',
  REQUEST_CHANGES: 'Request changes',
  APPROVE: 'Approve',
  PUBLISH: 'Publish',
  UNPUBLISH: 'Unpublish',
};

/** What each action does, as the confirmation dialog and the panel explain it. */
export const ACTION_EXPLANATION: Record<string, string> = {
  SUBMIT_FOR_REVIEW:
    'Sends the lesson to a reviewer. You can still edit it, but any edit returns it to Draft and cancels the review. Submitting does not check the publishing list and does not publish anything.',
  REQUEST_CHANGES: 'Sends the lesson back to Draft with your note, so the author knows what to change. Nothing is published or removed.',
  APPROVE:
    'Marks the content as it is now as approved. Any later edit returns it to Draft and the approval is lost. Approving does not publish the lesson and does not make it visible to learners.',
  PUBLISH:
    'Creates a new published version from this approved content. The publishing list is checked now, and nothing is published if it finds problems. Learners can open it only if the lesson is also included in a published course (see "Who can see this lesson").',
  UNPUBLISH:
    'Ends the current published version, so learners can no longer open this lesson. The history of earlier versions is kept, and your working copy is not changed except that a published lesson becomes Approved.',
};

export const GENERAL_NOTES = [
  'Editing any content returns the lesson to Draft. Editing never changes what learners see until the lesson is published again.',
  'The publishing list below is checked when an administrator publishes. You can submit and approve a lesson that still has problems, but it cannot be published until they are fixed.',
];

/** When the current user has no action available, say why in terms of the real workflow. */
export function noActionExplanation(status: LessonStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'You cannot submit this lesson for review. Only administrators and editors can.';
    case 'READY_FOR_REVIEW':
      return 'It is waiting for a reviewer or an administrator to approve it or ask for changes.';
    case 'APPROVED':
      return 'It is waiting for an administrator to publish it.';
    case 'PUBLISHED':
      return 'Only an administrator can unpublish a lesson.';
  }
}

export interface IssueGroup {
  /** null = about the whole lesson. */
  level: LearningLevel | null;
  issues: ReadinessIssue[];
}

/** Lesson-wide issues first, then one group per learning level in the order the server gave them. */
export function groupIssues(issues: readonly ReadinessIssue[]): IssueGroup[] {
  const whole = issues.filter((issue) => !issue.level);
  const groups: IssueGroup[] = [];
  if (whole.length > 0) groups.push({ level: null, issues: whole });
  const order: LearningLevel[] = [];
  for (const issue of issues) if (issue.level && !order.includes(issue.level)) order.push(issue.level);
  for (const level of order) groups.push({ level, issues: issues.filter((issue) => issue.level === level) });
  return groups;
}

// ---- who can see the lesson ----------------------------------------------------------------------------------------------------

export type VisibilityKind =
  | 'NOT_PUBLISHED'
  | 'COURSE_NOT_PUBLISHED'
  | 'NOT_IN_CATALOG'
  | 'VISIBLE'
  | 'UNKNOWN';

export interface LevelVisibility {
  level: LearningLevel;
  kind: VisibilityKind;
}

export const VISIBILITY_TEXT: Record<VisibilityKind, string> = {
  NOT_PUBLISHED: 'Not published at this level, so learners cannot open it.',
  COURSE_NOT_PUBLISHED: 'Published, but the course has no published catalog, so learners cannot see it yet.',
  NOT_IN_CATALOG: 'Published, but the course’s published catalog does not include this lesson yet. Publish the course again (or its module) to include it.',
  VISIBLE: 'Learners can open it.',
  UNKNOWN: 'This could not be checked right now.',
};

interface CatalogContent {
  directLessons?: { id: string }[];
  modules?: { lessons?: { id: string }[] }[];
}

/** True if the catalog snapshot content lists the lesson (directly in the course or inside a module). */
export function catalogListsLesson(content: unknown, lessonId: string): boolean {
  const c = (content ?? {}) as CatalogContent;
  const ids = [...(c.directLessons ?? []), ...(c.modules ?? []).flatMap((m) => m.lessons ?? [])].map((l) => l.id);
  return ids.includes(lessonId);
}
