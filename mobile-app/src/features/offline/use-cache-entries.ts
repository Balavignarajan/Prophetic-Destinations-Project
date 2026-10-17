import { useEffect, useState } from 'react';

import { cacheEntries } from './cache-store';

type Entries = Awaited<ReturnType<typeof cacheEntries>>;

/** What is saved for offline right now (read once when the screen opens). */
export function useCacheEntries(): Entries {
  const [entries, setEntries] = useState<Entries>([]);
  useEffect(() => {
    let cancelled = false;
    cacheEntries().then((items) => {
      if (!cancelled) setEntries(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return entries;
}
