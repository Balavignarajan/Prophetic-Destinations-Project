import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { LearningLevel } from '@/learning/levels';

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
  /** The explicit "mark complete / undo" action. */
  setCompleted: (lesson: LessonRef, completed: boolean) => void;
  /** Forgets the resume point and all completion marks. */
  reset: () => void;
};

const LearningContext = createContext<LearningContextValue>({
  progress: emptyLearningProgress,
  ready: false,
  recordOpened: () => undefined,
  isCompleted: () => false,
  setCompleted: () => undefined,
  reset: () => undefined,
});

export function LearningProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<LearningProgress>(emptyLearningProgress);
  const [ready, setReady] = useState(false);
  const latest = useRef(progress);

  useEffect(() => {
    let cancelled = false;
    loadLearningProgress().then((loaded) => {
      if (cancelled) return;
      latest.current = loaded;
      setProgress(loaded);
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

  const reset = useCallback(() => {
    latest.current = emptyLearningProgress;
    setProgress(emptyLearningProgress);
    void clearLearningProgress();
  }, []);

  const value = useMemo<LearningContextValue>(
    () => ({
      progress,
      ready,
      recordOpened,
      isCompleted: (lessonId, level) => completionKey(lessonId, level) in progress.completed,
      setCompleted,
      reset,
    }),
    [progress, ready, recordOpened, setCompleted, reset],
  );

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export const useLearningProgress = () => useContext(LearningContext);
