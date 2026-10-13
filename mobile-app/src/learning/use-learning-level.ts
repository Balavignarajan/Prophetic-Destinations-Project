import { useCallback, useEffect, useState } from 'react';

import { readLearningLevel, saveLearningLevel } from '@/storage/preferences';

import { DEFAULT_LEARNING_LEVEL, type LearningLevel } from './levels';

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

  const setLevel = useCallback((next: LearningLevel) => {
    setLevelState(next);
    void saveLearningLevel(next);
  }, []);

  return { level, setLevel, ready };
}
