import { useCallback, useEffect, useRef, useState } from 'react';

import { type Daniel2Progress, type QuizResult, emptyProgress, loadProgress, saveProgress } from './progress';

/**
 * Progress state for the Daniel 2 lesson. Pass the ordered scene ids once the lesson is loaded (or null while it is not).
 * Every action that changes meaningful progress is saved once; there are no timers or per-keystroke writes.
 */
export function useLessonProgress(sceneIds: readonly string[] | null) {
  const [progress, setProgress] = useState<Daniel2Progress>(emptyProgress);
  const [ready, setReady] = useState(false);
  const latest = useRef(progress);
  const idsKey = sceneIds?.join('|') ?? null;

  useEffect(() => {
    if (!sceneIds) return;
    let cancelled = false;
    loadProgress(sceneIds).then((saved) => {
      if (cancelled) return;
      latest.current = saved;
      setProgress(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // `idsKey` identifies the list; the array itself may be a new object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  /** Re-reads the saved progress, for a screen that stays mounted while the lesson (a different instance) changes it. */
  const reload = useCallback(() => {
    if (!sceneIds) return;
    loadProgress(sceneIds).then((saved) => {
      latest.current = saved;
      setProgress(saved);
      setReady(true);
    });
    // `idsKey` identifies the list; the array itself may be a new object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const commit = useCallback((next: Daniel2Progress) => {
    latest.current = next;
    setProgress(next);
    void saveProgress(next);
  }, []);

  const lastIndex = (sceneIds?.length ?? 1) - 1;
  const idAt = (index: number) => sceneIds?.[index];

  /** Open a scene (resume point only; does not complete anything). */
  const goTo = useCallback(
    (index: number) => {
      const current = latest.current;
      const target = Math.min(Math.max(index, 0), lastIndex);
      if (target !== current.currentIndex) commit({ ...current, currentIndex: target });
    },
    [commit, lastIndex],
  );

  /** The learner finished the current scene: mark it completed and move on. */
  const completeAndAdvance = useCallback(() => {
    const current = latest.current;
    const id = idAt(current.currentIndex);
    if (!id) return;
    commit({
      ...current,
      completed: current.completed.includes(id) ? current.completed : [...current.completed, id],
      currentIndex: Math.min(current.currentIndex + 1, lastIndex),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, lastIndex, idsKey]);

  /** Mark the current scene completed without moving (the last scene). */
  const completeCurrent = useCallback(() => {
    const current = latest.current;
    const id = idAt(current.currentIndex);
    if (!id || current.completed.includes(id)) return;
    commit({ ...current, completed: [...current.completed, id] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, idsKey]);

  const recordQuiz = useCallback(
    (result: QuizResult) => commit({ ...latest.current, quiz: result }),
    [commit],
  );

  /** Retake: forget the score and the quiz/summary completion so they must be earned again. */
  const resetQuiz = useCallback(() => {
    const current = latest.current;
    commit({
      ...current,
      quiz: null,
      completed: current.completed.filter((id) => id !== 'quiz' && id !== 'summary'),
    });
  }, [commit]);

  const restart = useCallback(() => commit(emptyProgress), [commit]);

  return { progress, ready, reload, goTo, completeAndAdvance, completeCurrent, recordQuiz, resetQuiz, restart };
}
