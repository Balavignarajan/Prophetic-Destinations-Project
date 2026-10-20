import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { LearningLevel } from '@/learning/levels';

import { type LessonPosition, type QuizIdentity, type QuizResult, matchingQuizResult, withPosition, withQuizResult } from './progress-model';
import {
  type LearningProgress,
  type LessonRef,
  completionKey,
  emptyLearningProgress,
  loadLearningProgress,
  saveLearningProgress,
  clearLearningProgress,
} from './store';

type LearningContextValue = {
  progress: LearningProgress;
  ready: boolean;
  /** Notes the lesson being read as the resume point. Writes only when it differs from what is saved. */
  recordOpened: (lesson: LessonRef) => void;
  isCompleted: (lessonId: string, level: LearningLevel) => boolean;
  /** Remembers where the learner is in an unfinished lesson (a scroll offset). Ignored for completed lessons. */
  savePosition: (lesson: LessonRef, offset: number) => void;
  /** The saved position of a lesson, or null. */
  positionOf: (lessonId: string, level: LearningLevel) => LessonPosition | null;
  /** The saved result of a quiz block for exactly this content (lesson, level, block, quiz and published version), or null. */
  quizResultFor: (identity: QuizIdentity) => QuizResult | null;
  /**
   * Keeps the finished attempt as the latest result of its quiz block. The result is available in memory at once; the promise says whether it
   * was also stored on this device (false: the storage failed, or the progress was reset in the meantime).
   */
  recordQuizResult: (result: QuizResult) => Promise<boolean>;
  /** The explicit "mark complete / undo" action. */
  setCompleted: (lesson: LessonRef, completed: boolean) => void;
  /** Forgets the resume point, all completion marks, saved positions and saved quiz results. */
  reset: () => void;
};

const LearningContext = createContext<LearningContextValue>({
  progress: emptyLearningProgress,
  ready: false,
  recordOpened: () => undefined,
  savePosition: () => undefined,
  positionOf: () => null,
  isCompleted: () => false,
  setCompleted: () => undefined,
  quizResultFor: () => null,
  recordQuizResult: () => Promise.resolve(false),
  reset: () => undefined,
});

export function LearningProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<LearningProgress>(emptyLearningProgress);
  const [ready, setReady] = useState(false);
  const latest = useRef(progress);
  // Counts resets. A load that was started before a reset must not bring the old progress back, and a result recorded before a reset must not
  // report "saved" for data that has since been erased.
  const generation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const startedIn = generation.current;
    loadLearningProgress().then((loaded) => {
      if (cancelled) return;
      if (startedIn === generation.current) {
        latest.current = loaded;
        setProgress(loaded);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback((next: LearningProgress) => {
    latest.current = next;
    setProgress(next);
    void saveLearningProgress(next);
  }, []);

  const recordOpened = useCallback(
    (lesson: LessonRef) => {
      const current = latest.current;
      const last = current.lastOpened;
      if (last && last.lessonId === lesson.lessonId && last.level === lesson.level && last.courseId === lesson.courseId && last.title === lesson.title) return;
      commit({ ...current, lastOpened: { ...lesson, openedAt: Date.now() } });
    },
    [commit],
  );

  const savePosition = useCallback(
    (lesson: LessonRef, offset: number) => {
      const current = latest.current;
      const key = completionKey(lesson.lessonId, lesson.level);
      if (key in current.completed) return;
      const saved = current.positions[key];
      const rounded = Number.isFinite(offset) && offset > 0 ? Math.round(offset) : 0;
      if (saved && saved.offset === rounded && saved.title === lesson.title && saved.courseId === lesson.courseId) return;
      commit({ ...current, positions: withPosition(current.positions, lesson, offset, Date.now()) });
    },
    [commit],
  );

  const setCompleted = useCallback(
    (lesson: LessonRef, completed: boolean) => {
      const current = latest.current;
      const key = completionKey(lesson.lessonId, lesson.level);
      const done = key in current.completed;
      if (completed === done) return;
      const next = { ...current.completed };
      if (completed) next[key] = { title: lesson.title, completedAt: Date.now() };
      else delete next[key];
      commit({ ...current, completed: next });
    },
    [commit],
  );

  const recordQuizResult = useCallback(async (result: QuizResult): Promise<boolean> => {
    const startedIn = generation.current;
    const next = { ...latest.current, quizResults: withQuizResult(latest.current.quizResults, result) };
    latest.current = next;
    setProgress(next);
    const stored = await saveLearningProgress(next);
    return stored && startedIn === generation.current;
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    latest.current = emptyLearningProgress;
    setProgress(emptyLearningProgress);
    void clearLearningProgress();
  }, []);

  const value = useMemo<LearningContextValue>(
    () => ({
      progress,
      ready,
      recordOpened,
      savePosition,
      positionOf: (lessonId, level) => progress.positions[completionKey(lessonId, level)] ?? null,
      isCompleted: (lessonId, level) => completionKey(lessonId, level) in progress.completed,
      setCompleted,
      quizResultFor: (identity) => matchingQuizResult(progress.quizResults, identity),
      recordQuizResult,
      reset,
    }),
    [progress, ready, recordOpened, savePosition, setCompleted, recordQuizResult, reset],
  );

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export const useLearningProgress = () => useContext(LearningContext);
