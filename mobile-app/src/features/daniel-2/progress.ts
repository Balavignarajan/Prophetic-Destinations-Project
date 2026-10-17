import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-local progress of the Daniel 2 scene lesson. No account, no sync, nothing sensitive.
 * Namespaced key, separate from the appearance and level preferences (src/storage/preferences.ts).
 *
 * A scene is "completed" only when the learner finishes it (Continue, or the quiz being finished); opening a scene does not
 * complete it. `currentIndex` is only where to resume.
 */
export const PROGRESS_KEY = 'pd.daniel2.progress.v1';

export type QuizResult = { correct: number; total: number };

export type Daniel2Progress = {
  version: 1;
  currentIndex: number;
  completed: string[];
  quiz: QuizResult | null;
  /**
   * LEGACY. Scene bookmarks now live in the bookmark store (src/features/bookmarks). The field is still read and written back
   * unchanged so the stored format stays compatible; the bookmark store migrates it once.
   */
  bookmarks: string[];
};

export const emptyProgress: Daniel2Progress = { version: 1, currentIndex: 0, completed: [], quiz: null, bookmarks: [] };

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** Reads and validates saved progress against the scenes that exist now. Anything unusable becomes "no progress". */
export async function loadProgress(sceneIds: readonly string[]): Promise<Daniel2Progress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return emptyProgress;
    const d = data as Record<string, unknown>;
    if (d.version !== 1) return emptyProgress;
    const known = new Set(sceneIds);
    const quiz = d.quiz as Partial<QuizResult> | null | undefined;
    return {
      version: 1,
      currentIndex:
        typeof d.currentIndex === 'number' && Number.isInteger(d.currentIndex)
          ? Math.min(Math.max(d.currentIndex, 0), sceneIds.length - 1)
          : 0,
      completed: isStringList(d.completed) ? d.completed.filter((id) => known.has(id)) : [],
      quiz:
        quiz && typeof quiz.correct === 'number' && typeof quiz.total === 'number' && quiz.total > 0
          ? { correct: quiz.correct, total: quiz.total }
          : null,
      bookmarks: isStringList(d.bookmarks) ? d.bookmarks.filter((id) => known.has(id)) : [],
    };
  } catch {
    return emptyProgress;
  }
}

/** Best-effort: a failed save never breaks the lesson; progress then lasts for the session. */
export async function saveProgress(progress: Daniel2Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // keep going with the in-memory progress
  }
}

/** True once the learner has done anything worth resuming. */
export const hasStarted = (p: Daniel2Progress) => p.completed.length > 0 || p.currentIndex > 0 || p.quiz !== null;
