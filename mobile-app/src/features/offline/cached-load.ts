import { ApiError, NetworkError, ResponseShapeError } from '@/api/errors';
import type { LearningLevel } from '@/learning/levels';

import { type CacheKind, cacheRead, cacheRemove } from './cache-store';
import { saveLoaded } from './offline-assets';
import { currentEpoch } from './offline-media';

/** A loaded value and where it came from. `cache` means a SAVED copy, shown because the live request could not be completed. */
export type Loaded<T> = {
  value: T;
  source: 'network' | 'cache';
  /** When the copy was fetched from the backend (now, for a network load). */
  fetchedAt: number;
  /** Why a saved copy is being shown. */
  reason?: 'offline' | 'server-problem';
};

type Options<T> = {
  kind: CacheKind;
  id: string;
  level: LearningLevel;
  fetch: () => Promise<T>;
  validate: (data: unknown) => data is T;
  signal?: AbortSignal;
};

/**
 * The backend is the source of truth; the cache is a fallback.
 *
 * - Online and successful: the (already validated) answer is returned and stored, replacing the previous copy.
 * - 404: the backend says it is not available (unpublished, withdrawn, unknown). The saved copy is DELETED and the 404 is shown.
 *   A stale cached copy is never treated as proof that something is still published.
 * - Cannot reach the server, timeout, 429, 5xx, or an answer that fails validation: the saved copy is returned if there is one
 *   (flagged `source: 'cache'`); a failed or invalid answer never overwrites a good copy. With no saved copy the original error
 *   is thrown, so uncached content is honestly reported as unavailable.
 * - Any other 4xx (a bad request) and a cancelled request are not cache situations and are thrown as they are.
 *
 * Conditional requests (ETag / If-None-Match) are not used: the shared API client does not send validators, and the saved copy
 * is simply replaced by the fresh answer on each successful load.
 */
export async function loadCached<T>({ kind, id, level, fetch, validate, signal }: Options<T>): Promise<Loaded<T>> {
  const startedIn = currentEpoch(); // if the offline cache is cleared while this loads, nothing is written afterwards
  try {
    const value = await fetch();
    // Saves the text (at once for a first save; staged until its images are on disk when it updates a completely saved lesson)
    // and starts saving the images in the background. Missing images are retried on every successful load.
    await saveLoaded(kind, id, level, value, startedIn);
    return { value, source: 'network', fetchedAt: Date.now() };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError && error.isNotFound) {
      await cacheRemove(kind, id, level);
      throw error;
    }
    const fallbackAllowed =
      error instanceof NetworkError ||
      error instanceof ResponseShapeError ||
      (error instanceof ApiError && (error.status === 429 || error.status >= 500));
    if (!fallbackAllowed) throw error;
    const saved = await cacheRead(kind, id, level, validate);
    if (!saved) throw error;
    return {
      value: saved.data,
      source: 'cache',
      fetchedAt: saved.fetchedAt,
      reason: error instanceof NetworkError ? 'offline' : 'server-problem',
    };
  }
}
