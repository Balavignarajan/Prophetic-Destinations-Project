import { BusinessRuleError } from '../../../shared-kernel/index.js';

/** A standalone library lesson has no course: it is an authoring source and never enters the review/publish workflow. */
export function libraryLessonRefused(): BusinessRuleError {
  return new BusinessRuleError(
    'This is a library lesson. Copy it into a course or module to review and publish it.',
    { code: 'LIBRARY_LESSON' },
  );
}
