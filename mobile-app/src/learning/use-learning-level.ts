import { useCallback, useEffect, useState } from 'react';

import { readLearningLevel, saveLearningLevel } from '@/storage/preferences';

import { DEFAULT_LEARNING_LEVEL, type LearningLevel } from './levels';

// Tab screens stay mounted, so a level chosen in one place (the assessment result, More, Learn) must reach every other screen that shows it.
// Each hook instance listens here; `applyLearningLevel` stores the level and tells them all. Storage stays the single source of truth.
const listeners = new Set<(level: LearningLevel) => void>();

/** Makes `level` the learner's level everywhere: saved on the device and applied by every screen that uses `useLearningLevel`. */
export function applyLearningLevel(level: LearningLevel): void {
  void saveLearningLevel(level);
  for (const listener of listeners) listener(level);
}

/** The learner's chosen level, restored from device storage. `ready` is false until the saved value has been read. */
export function useLearningLevel() {
  const [level, setLevelState] = useState<LearningLevel>(DEFAULT_LEARNING_LEVEL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readLearningLevel().then((saved) => {
      if (cancelled) return;
      if (saved) setLevelState(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listeners.add(setLevelState);
    return () => {
      listeners.delete(setLevelState);
    };
  }, []);

  const setLevel = useCallback((next: LearningLevel) => applyLearningLevel(next), []);

  return { level, setLevel, ready };
}
