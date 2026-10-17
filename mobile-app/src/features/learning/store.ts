import type { LearningLevel } from '@/learning/levels';
import { isLearningLevel } from '@/learning/levels';
import { isRecord, readJson, removeKey, writeJson } from '@/storage/json-store';

/**
 * Device-local progress through PUBLISHED backend lessons. (The built-in Daniel 2 lesson keeps its own scene progress in
 * src/features/daniel-2/progress.ts; nothing here replaces it.)
 *
 * Key `pd.learning.progress.v1`: { version: 1, lastOpened, completed }.
 *  - lastOpened: the lesson most recently opened, for "Continue where you left off".
 *  - completed:  lessons the learner explicitly marked complete. Opening a lesson never completes it.
 * There is no scroll position: a lesson is one short scrolling page, so "last opened" is the useful resume point.
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
};

export const emptyLearningProgress: LearningProgress = { version: 1, lastOpened: null, completed: {} };

export const completionKey = (lessonId: string, level: LearningLevel) => `${lessonId}:${level}`;

function parse(raw: unknown): LearningProgress | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  let lastOpened: LastOpened | null = null;
  const lo = raw.lastOpened;
  if (isRecord(lo) && typeof lo.lessonId === 'string' && isLearningLevel(lo.level) && typeof lo.title === 'string' && typeof lo.openedAt === 'number') {
    lastOpened = {
      lessonId: lo.lessonId,
      level: lo.level,
      courseId: typeof lo.courseId === 'string' ? lo.courseId : null,
      title: lo.title,
      openedAt: lo.openedAt,
    };
  }
  const completed: Record<string, CompletedLesson> = {};
  if (isRecord(raw.completed)) {
    for (const [key, value] of Object.entries(raw.completed)) {
      if (isRecord(value) && typeof value.title === 'string' && typeof value.completedAt === 'number') {
        completed[key] = { title: value.title, completedAt: value.completedAt };
      }
    }
  }
  return { version: 1, lastOpened, completed };
}

export async function loadLearningProgress(): Promise<LearningProgress> {
  return (await readJson(LEARNING_PROGRESS_KEY, parse)) ?? emptyLearningProgress;
}

export const saveLearningProgress = (progress: LearningProgress) => writeJson(LEARNING_PROGRESS_KEY, progress);
export const clearLearningProgress = () => removeKey(LEARNING_PROGRESS_KEY);
