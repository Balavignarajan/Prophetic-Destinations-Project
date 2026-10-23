import { type ReactNode, createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import type { LearningLevel } from '@/learning/levels';

import { type LessonPosition, type PositionExtra, type QuizIdentity, type QuizResult, type TitledLesson, matchingQuizResult } from './progress-model';
import { type SessionStatus, createProgressSession } from './progress-session';
import { type LearningProgress, type LessonRef, clearLearningProgress, completionKey, emptyLearningProgress, loadLearningProgress, saveLearningProgress } from './store';

type LearningContextValue = {
  progress: LearningProgress;
  /**
   * True once the saved progress is known: it was read, or nothing was ever saved. Until then nothing is restored and nothing is written over
   * the saved value. After a failed read it stays false (see `status`), and the saved value is left exactly as it was.
   */
  ready: boolean;
  /** `loading` (first read running), `ready`, or why the first read failed: `unreadable` (storage error) or `invalid` (damaged data). */
  status: SessionStatus;
  /** The latest progress could not be stored. It is kept in memory and written again by the next change or by `retrySave`. */
  saveFailed: boolean;
  /** A retry of a failed first read is running. */
  retrying: boolean;
  /** Reads the saved progress again after a failed read. Resolves to whether it is now known. */
  retryLoad: () => Promise<boolean>;
  /** Writes the latest progress again after a failed write. Resolves to whether it is stored. */
  retrySave: () => Promise<boolean>;
  /**
   * Notes the lesson being read as the resume point. Writes only when it differs from what is saved. While the saved progress is still being
   * read, the change is queued and applied after it; if the read fails it is dropped (never written against an unknown baseline). Unless `liveTitle` is false (the
   * lesson is shown from a saved copy), it also brings the title kept with the lesson's other records up to date (titles only).
   */
  recordOpened: (lesson: LessonRef, options?: { liveTitle?: boolean }) => void;
  /**
   * Brings the saved title of these lessons up to date with the published catalog (a lesson renamed in the CMS). Changes only titles: completion dates, positions and
   * quiz scores stay as they are, and nothing is written when the titles already match. The saved title stays the fallback when the catalog is not available.
   */
  syncTitles: (lessons: readonly TitledLesson[]) => void;
  isCompleted: (lessonId: string, level: LearningLevel) => boolean;
  /** Remembers where the learner is in an unfinished lesson (a scroll offset, plus the content anchor and published version when known). Ignored for completed lessons. */
  savePosition: (lesson: LessonRef, offset: number, extra?: PositionExtra) => void;
  /** The saved position of a lesson, or null. */
  positionOf: (lessonId: string, level: LearningLevel) => LessonPosition | null;
  /** The saved result of a quiz block for exactly this content (lesson, level, block, quiz and published version), or null. */
  quizResultFor: (identity: QuizIdentity) => QuizResult | null;
  /**
   * Keeps the finished attempt as the latest result of its quiz block. The result is available in memory at once; the promise says whether it
   * was also stored on this device (false: the storage failed, the saved progress is unavailable, or the progress was reset in the meantime).
   */
  recordQuizResult: (result: QuizResult) => Promise<boolean>;
  /** The explicit "mark complete / undo" action. Resolves to whether the change was stored (see ProgressSession.setCompleted). */
  setCompleted: (lesson: LessonRef, completed: boolean, completedAt?: number) => Promise<boolean>;
  /**
   * Forgets the resume point, all completion marks, saved positions and saved quiz results. The only thing that ever removes saved progress, and
   * only on the learner's own confirmed request. Resolves to whether the saved progress is really gone.
   */
  reset: () => Promise<boolean>;
};

const LearningContext = createContext<LearningContextValue>({
  progress: emptyLearningProgress,
  ready: false,
  status: 'loading',
  saveFailed: false,
  retrying: false,
  retryLoad: () => Promise.resolve(false),
  retrySave: () => Promise.resolve(false),
  recordOpened: () => undefined,
  syncTitles: () => undefined,
  savePosition: () => undefined,
  positionOf: () => null,
  isCompleted: () => false,
  setCompleted: () => Promise.resolve(false),
  quizResultFor: () => null,
  recordQuizResult: () => Promise.resolve(false),
  reset: () => Promise.resolve(false),
});

export function LearningProgressProvider({ children }: { children: ReactNode }) {
  // One session for the life of the provider. It reads the saved progress once, holds the safety rules (progress-session.ts) and writes
  // through store.ts. Everything below only reads its snapshot or forwards to it.
  const [session] = useState(() =>
    createProgressSession({ load: loadLearningProgress, save: saveLearningProgress, clear: clearLearningProgress }, emptyLearningProgress),
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    session.start();
  }, [session]);

  const value = useMemo<LearningContextValue>(
    () => ({
      progress: snapshot.progress,
      ready: snapshot.status === 'ready',
      status: snapshot.status,
      saveFailed: snapshot.saveFailed,
      retrying: snapshot.retrying,
      retryLoad: session.retryLoad,
      retrySave: session.retrySave,
      recordOpened: session.recordOpened,
      syncTitles: session.syncTitles,
      savePosition: session.savePosition,
      positionOf: (lessonId, level) => snapshot.progress.positions[completionKey(lessonId, level)] ?? null,
      isCompleted: (lessonId, level) => completionKey(lessonId, level) in snapshot.progress.completed,
      setCompleted: session.setCompleted,
      quizResultFor: (identity) => matchingQuizResult(snapshot.progress.quizResults, identity),
      recordQuizResult: session.recordQuizResult,
      reset: session.reset,
    }),
    [session, snapshot],
  );

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export const useLearningProgress = () => useContext(LearningContext);
