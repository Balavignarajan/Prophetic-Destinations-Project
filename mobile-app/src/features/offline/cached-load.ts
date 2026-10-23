import { ApiError, NetworkError, ResponseShapeError } from '@/api/errors';
import type { LearningLevel } from '@/learning/levels';

import { type CacheKind, cacheRead, cacheRemove } from './cache-store';
import { keepSaved, saveLoaded } from './offline-assets';
import { currentEpoch } from './offline-media';

/** A loaded value and where it came from. `cache` means a SAVED copy, shown because the live request could not be completed. */
export type Loaded<T> = {
  value: T;
  source: 'network' | 'cache';
  /** When the copy was fetched from the backend (now, for a network load). */
  fetchedAt: number;
  /** Why a saved copy is being shown. */
  reason?: 'offline' | 'server-problem';
  /** Network loads only: `false` when this device refused to save the copy, so it will NOT be readable offline. Absent otherwise. */
  saved?: boolean;
  /**
   * Network loads of content that names its published version only (lessons): how the live answer compares with the copy saved before.
   * `new` = nothing was saved; `updated` = a different published version (or a copy saved without a version) was saved and is replaced;
   * `unchanged` = the saved copy IS this published version, so nothing was rewritten.
   */
  change?: 'new' | 'updated' | 'unchanged';
};

type Options<T> = {
  kind: CacheKind;
  id: string;
  level: LearningLevel;
  fetch: () => Promise<T>;
  validate: (data: unknown) => data is T;
  /**
   * The published version a response names (for lessons: publication number + content hash), or null when it names none. When given, a live answer that names the
   * SAME version as the saved copy does not replace it; a different one does.
   */
  version?: (data: T) => string | null;
  signal?: AbortSignal;
};

/**
 * A 404 that the BACKEND sent (its error body carries a `code`): "this is not currently published". A 404 without that body (a proxy,
 * a wrong address, an error page) says nothing about the content, so it is treated like any other failed request.
 */
const isConfirmedUnavailable = (error: unknown): boolean => error instanceof ApiError && error.isNotFound && error.code !== 'ERROR';

/**
 * The backend is the source of truth; the cache is a fallback.
 *
 * - Online and successful: the (already validated) answer is returned and stored, replacing the previous copy. Whether it could be
 *   stored is reported (`saved`), so a copy the device refused is never presented as saved for offline use.
 * - A 404 from the backend: it says the item is not available (unpublished, withdrawn, unknown). The saved copy is DELETED and the 404
 *   is shown. A stale cached copy is never treated as proof that something is still published. This is the only thing that removes
 *   a saved copy because of a request.
 * - Cannot reach the server, timeout, 429, 5xx, a 404 that did not come from the backend, or an answer that fails validation: the
 *   saved copy is returned if there is one (flagged `source: 'cache'`, however old it is); a failed or invalid answer never
 *   overwrites or deletes a good copy. With no saved copy the original error is thrown, so uncached content is honestly reported as
 *   unavailable.
 * - Any other 4xx (a bad request) and a cancelled request are not cache situations and are thrown as they are.
 *
 * Published versions (lessons): the backend names the version of a published lesson (`publicationVersion` and `contentHash`), so a live answer is compared with
 * the saved copy by that identity. The same version is left exactly as it is saved (only its images are completed if some are missing); a different version, or a
 * copy saved before versions were recorded, is replaced as described above; an answer that does not name its version is rejected before it gets here (see
 * learner-api.ts) and never replaces anything.
 *
 * Conditional requests (ETag / If-None-Match) are not used by this loader: the backend already sends an ETag and `Cache-Control: public, no-cache` on every published
 * representation, so a browser or the system networking layer revalidates by itself where it keeps an HTTP cache; but a page on another origin cannot read the ETag
 * without a CORS change, a 304 would need its own path through the shared API client, and the version identity above already says exactly whether a saved lesson is
 * current, so a manual validator would only save bandwidth at the cost of a new way to fail.
 */
export async function loadCached<T>({ kind, id, level, fetch, validate, version, signal }: Options<T>): Promise<Loaded<T>> {
  const startedIn = currentEpoch(); // if the offline cache is cleared while this loads, nothing is written afterwards
  let value: T;
  try {
    value = await fetch();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (isConfirmedUnavailable(error)) {
      await cacheRemove(kind, id, level);
      throw error;
    }
    const fallbackAllowed =
      error instanceof NetworkError ||
      error instanceof ResponseShapeError ||
      (error instanceof ApiError && (error.status === 429 || error.status >= 500 || error.isNotFound));
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

  // Is this the version that is already saved? Only content that names its version is compared.
  let change: Loaded<T>['change'];
  if (version) {
    const fresh = version(value);
    const prior = fresh === null ? null : await cacheRead(kind, id, level, validate);
    if (prior === null) change = 'new';
    else if (fresh !== null && version(prior.data) === fresh) change = 'unchanged';
    else change = 'updated';
  }

  // The saved copy already is this published version: nothing is rewritten. Its images are completed if some are missing.
  if (change === 'unchanged') {
    let kept = true;
    try {
      kept = await keepSaved(kind, id, level, value, startedIn);
    } catch {
      kept = true; // the saved text is intact whatever happened to its images
    }
    return { value, source: 'network', fetchedAt: Date.now(), saved: kept, change };
  }

  // Saves the text (at once for a first save; staged until its images are on disk when it updates a completely saved lesson)
  // and starts saving the images in the background. Missing images are retried on every successful load. A problem while saving
  // never costs the learner the answer they already have.
  let saved = true;
  try {
    saved = await saveLoaded(kind, id, level, value, startedIn);
  } catch {
    saved = false;
  }
  return { value, source: 'network', fetchedAt: Date.now(), saved, ...(change ? { change } : {}) };
}
