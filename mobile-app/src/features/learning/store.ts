import type { LearningLevel } from '@/learning/levels';
import { readJsonResult, tryRemoveKey, tryWriteJson } from '@/storage/json-store';

import { type LessonPosition, type QuizResult, lessonKey, parseProgress } from './progress-model';

/**
 * Device-local progress through PUBLISHED backend lessons. (The built-in Daniel 2 lesson keeps its own scene progress in
 * src/features/daniel-2/progress.ts; nothing here replaces it.)
 *
 * Key `pd.learning.progress.v1`: { version: 1, lastOpened, completed, positions, quizResults }.
 *  - lastOpened: the lesson most recently opened.
 *  - completed:  lessons the learner explicitly marked complete. Opening a lesson never completes it.
 *  - positions:  where the learner was in a lesson (scroll offset), saved at checkpoints so "Continue Learning" returns near it.
 *    Added after the first release: a value saved without it still loads (positions start empty), so no progress is lost.
 *  - quizResults: the latest completed result of each quiz block (see QuizResult in progress-model.ts). Added later; older values load with none.
 * The rules (what is "unfinished", what Continue opens) are pure functions in progress-model.ts.
 */
export const LEARNING_PROGRESS_KEY = 'pd.learning.progress.v1';

export type LessonRef = { lessonId: string; level: LearningLevel; courseId: string | null; title: string };
export type LastOpened = LessonRef & { openedAt: number };
export type CompletedLesson = { title: string; completedAt: number };

export type LearningProgress = {
  version: 1;
  lastOpened: LastOpened | null;
  /** Keyed by `completionKey(lessonId, level)`. */
  completed: Record<string, CompletedLesson>;
  /** Keyed by `completionKey(lessonId, level)`. */
  positions: Record<string, LessonPosition>;
  /** Keyed by `quizResultKey(lessonId, level, blockId)`. */
  quizResults: Record<string, QuizResult>;
};

export const emptyLearningProgress: LearningProgress = { version: 1, lastOpened: null, completed: {}, positions: {}, quizResults: {} };

export const completionKey = lessonKey;

/**
 * What reading the saved progress found. Only 'ok' means the progress is known: either it was read, or nothing was ever saved (a new learner).
 * 'unreadable' (the storage failed) and 'invalid' (a value is stored but is damaged or from a newer format) mean the stored value is UNKNOWN and
 * untouched, so the caller must not start from empty progress and must not write over it.
 */
export type ProgressLoad = { status: 'ok'; progress: LearningProgress } | { status: 'unreadable' } | { status: 'invalid' };

/**
 * Writes, clears and the initial read run strictly one after another, in the order they were requested. So a slow earlier write can never
 * land after a later "reset" and bring deleted progress (or quiz results) back, the last request always decides what is stored, and the
 * initial read always sees every write that was requested before it.
 */
let queue: Promise<unknown> = Promise.resolve();
function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Reads the saved progress. Never throws, never writes, and never turns "could not read" into "empty". */
export const loadLearningProgress = (): Promise<ProgressLoad> =>
  inOrder(async (): Promise<ProgressLoad> => {
    const read = await readJsonResult(LEARNING_PROGRESS_KEY, parseProgress);
    if (read.status === 'ok') return { status: 'ok', progress: read.value };
    if (read.status === 'missing') return { status: 'ok', progress: emptyLearningProgress };
    return { status: read.status };
  });

/** Resolves to whether the value was stored. */
export const saveLearningProgress = (progress: LearningProgress): Promise<boolean> => inOrder(() => tryWriteJson(LEARNING_PROGRESS_KEY, progress));

/** Resolves to whether the saved progress is gone. Only the learner's own, confirmed "reset" calls this. */
export const clearLearningProgress = (): Promise<boolean> => inOrder(() => tryRemoveKey(LEARNING_PROGRESS_KEY));
