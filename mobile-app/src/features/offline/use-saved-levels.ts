import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { cacheEntries } from './cache-store';
import { type SavedByLevel, savedLessonsByLevel } from './saved-levels';

/**
 * How many lessons are saved at each learning level, read from the cache INDEX (one small stored list, never the saved lessons themselves) each time the screen
 * comes into view, so it follows a lesson saved since. Null until the first read, and left as it was if a later read fails: this is information only and never
 * changes the cache.
 */
export function useSavedLevels(): SavedByLevel | null {
  const [counts, setCounts] = useState<SavedByLevel | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      cacheEntries().then(
        (entries) => {
          if (!cancelled) setCounts(savedLessonsByLevel(entries));
        },
        () => undefined,
      );
      return () => {
        cancelled = true;
      };
    }, []),
  );
  return counts;
}
