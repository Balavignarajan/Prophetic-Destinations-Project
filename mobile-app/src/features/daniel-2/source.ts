import { configuredDaniel2Lesson } from './content';
import type { Daniel2Lesson } from './types';

/**
 * Where the lesson comes from. Screens and scenes depend on `Daniel2Lesson` only, never on a source, so the source can change
 * without touching a component.
 *
 * Today there is one source, `configuredLessonSource`: the built-in content in ./content. It is NOT a published backend course.
 *
 * Moving to the backend later means writing a second source that implements this interface: fetch the published course with
 * src/api/learner-api.ts (`getCourse`, `getLesson`), then map its RICH_TEXT snapshots and the lesson's structure into
 * `Daniel2Lesson`. The backend does not yet carry the scene structure, the statue sections, the timeline or the quiz, so that
 * mapping needs a content decision first. Until a real Daniel 2 course is published, nothing may pretend otherwise.
 */
export interface Daniel2LessonSource {
  readonly kind: 'configured' | 'published';
  load(signal?: AbortSignal): Promise<Daniel2Lesson>;
}

export const configuredLessonSource: Daniel2LessonSource = {
  kind: 'configured',
  load: () => Promise.resolve(configuredDaniel2Lesson),
};

/** The source in use. Change this one line (and only this) to switch sources. */
export const activeLessonSource: Daniel2LessonSource = configuredLessonSource;
