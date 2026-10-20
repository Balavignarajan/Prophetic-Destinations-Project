import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LearningLevel } from '@/learning/levels';
import { isRecord, readJson, writeJson } from '@/storage/json-store';

import { cleanUp, invalidateAllMedia, mediaOwnerKey, registerOwnersProvider } from './offline-media';

/**
 * The offline cache of PUBLISHED content that was successfully fetched from the backend. Separate from the theme preference,
 * the bookmarks and all progress: clearing it never touches those.
 *
 * Stored per item, keyed by kind + id + level:   pd.cache.v1:<kind>:<id>:<level>
 * plus one small index of what exists:           pd.cache.v1.index
 * What is stored is the backend's own response body, unchanged, wrapped with when it was fetched. Public learner content
 * only: no credentials, tokens or personal data are ever part of a response, and none is added.
 *
 * Versioning:  the `v1` in the key and `v` in the entry. A new format means a new version; old entries are then ignored and
 *              pruned. An entry that fails the type guard (malformed or from an older shape) is deleted on read.
 *
 * Retention (applied on every write and on every read of an entry):
 *   - an entry older than MAX_AGE_MS (30 days) is deleted;
 *   - at most MAX_ENTRIES (60) entries are kept; beyond that the OLDEST by fetch time are deleted first.
 * A lesson response is a few KB, so this bounds the cache to a small, fixed size. The user can also clear it in Settings.
 *
 * Reads and writes are serialised through one queue so the index can never be corrupted by overlapping operations.
 */
export const CACHE_LIMITS = { maxEntries: 60, maxAgeMs: 30 * 24 * 60 * 60 * 1000 } as const;

export type CacheKind = 'catalog' | 'course' | 'lesson' | 'navigation' | 'related';

const PREFIX = 'pd.cache.v1';
const INDEX_KEY = `${PREFIX}.index`;

type IndexItem = { key: string; kind: CacheKind; id: string; level: LearningLevel; fetchedAt: number };
type Entry<T> = { v: 1; fetchedAt: number; data: T };

export type CachedValue<T> = { data: T; fetchedAt: number };

export const cacheKey = (kind: CacheKind, id: string, level: LearningLevel) => `${PREFIX}:${kind}:${id}:${level}`;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

const KINDS: readonly string[] = ['catalog', 'course', 'lesson', 'navigation', 'related'];
const LEVELS: readonly string[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

/** After the cache changed: the saved images follow it (a file is kept only while some remaining item still needs it). */
function syncMedia(index: IndexItem[]): void {
  const owners = new Set(index.filter((item) => item.kind !== 'navigation' && item.kind !== 'related').map((item) => mediaOwnerKey(item.kind, item.id, item.level)));
  void cleanUp(owners).catch(() => undefined);
}

// At start-up the saved images are reconciled with what this cache still holds.
registerOwnersProvider(() =>
  serial(async () => new Set((await readIndex()).filter((item) => item.kind !== 'navigation' && item.kind !== 'related').map((item) => mediaOwnerKey(item.kind, item.id, item.level)))),
);

function parseIndex(raw: unknown): IndexItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: IndexItem[] = [];
  for (const item of raw) {
    if (
      isRecord(item) &&
      typeof item.key === 'string' &&
      typeof item.kind === 'string' && KINDS.includes(item.kind) &&
      typeof item.id === 'string' &&
      typeof item.level === 'string' && LEVELS.includes(item.level) &&
      typeof item.fetchedAt === 'number'
    ) {
      items.push(item as unknown as IndexItem);
    }
  }
  return items;
}

/** A missing index is normal (nothing cached). A damaged one is rebuilt by dropping every cache entry, since they cannot be tracked. */
async function readIndex(): Promise<IndexItem[]> {
  const index = await readJson(INDEX_KEY, parseIndex);
  if (index) return index;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {
    // nothing more can be done
  }
  return [];
}

async function removeEntries(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // an orphan entry is harmless: it is no longer indexed and is ignored
  }
}

function prune(index: IndexItem[], now: number): { keep: IndexItem[]; drop: IndexItem[] } {
  const fresh = index.filter((item) => now - item.fetchedAt <= CACHE_LIMITS.maxAgeMs);
  const sorted = [...fresh].sort((a, b) => b.fetchedAt - a.fetchedAt);
  const keep = sorted.slice(0, CACHE_LIMITS.maxEntries);
  const keepKeys = new Set(keep.map((item) => item.key));
  return { keep, drop: index.filter((item) => !keepKeys.has(item.key)) };
}

/** The cached value for this item, or null if there is none, it is too old, or it fails `validate` (then it is deleted). */
export function cacheRead<T>(
  kind: CacheKind,
  id: string,
  level: LearningLevel,
  validate: (data: unknown) => data is T,
): Promise<CachedValue<T> | null> {
  return serial(async () => {
    const key = cacheKey(kind, id, level);
    const entry = await readJson(key, (raw) =>
      isRecord(raw) && raw.v === 1 && typeof raw.fetchedAt === 'number' && validate(raw.data)
        ? ({ v: 1, fetchedAt: raw.fetchedAt, data: raw.data } as Entry<T>)
        : null,
    );
    if (entry && Date.now() - entry.fetchedAt <= CACHE_LIMITS.maxAgeMs) {
      return { data: entry.data, fetchedAt: entry.fetchedAt };
    }
    // missing, too old or invalid: make sure no stale or broken copy lingers
    const index = await readIndex();
    if (index.some((item) => item.key === key)) {
      await removeEntries([key]);
      const rest = index.filter((item) => item.key !== key);
      await writeJson(INDEX_KEY, rest);
      syncMedia(rest);
    } else if (entry) {
      await removeEntries([key]);
    }
    return null;
  });
}

/** Stores a successfully fetched, already-validated response and applies the retention policy. */
export function cacheWrite(kind: CacheKind, id: string, level: LearningLevel, data: unknown): Promise<void> {
  return serial(async () => {
    const key = cacheKey(kind, id, level);
    const now = Date.now();
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ v: 1, fetchedAt: now, data } satisfies Entry<unknown>));
    } catch {
      return; // not cached; the live data is still shown
    }
    const index = (await readIndex()).filter((item) => item.key !== key);
    index.push({ key, kind, id, level, fetchedAt: now });
    const { keep, drop } = prune(index, now);
    await removeEntries(drop.map((item) => item.key));
    await writeJson(INDEX_KEY, keep);
    syncMedia(keep);
  });
}

/** Removes one item (used when the backend says it is no longer available). */
export function cacheRemove(kind: CacheKind, id: string, level: LearningLevel): Promise<void> {
  return serial(async () => {
    const key = cacheKey(kind, id, level);
    await removeEntries([key]);
    const index = await readIndex();
    const rest = index.filter((item) => item.key !== key);
    if (rest.length !== index.length) await writeJson(INDEX_KEY, rest);
    syncMedia(rest);
  });
}

/** Deletes the whole cache. Returns how many entries were removed. */
export function cacheClear(): Promise<number> {
  return serial(async () => {
    const index = await readIndex();
    let keys = index.map((item) => item.key);
    try {
      keys = Array.from(new Set([...keys, ...(await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX))]));
    } catch {
      // fall back to the indexed keys
    }
    const removed = keys.filter((key) => key !== INDEX_KEY).length;
    await removeEntries(keys);
    // Clearing ends everything pending: staged updates and running downloads are discarded and can recreate nothing.
    void invalidateAllMedia().catch(() => undefined); // not awaited: start-up reconciliation reads this queue
    return removed;
  });
}

/** What is cached now (for "saved for offline" tags). */
export function cacheEntries(): Promise<{ kind: CacheKind; id: string; level: LearningLevel; fetchedAt: number }[]> {
  return serial(async () => (await readIndex()).map(({ kind, id, level, fetchedAt }) => ({ kind, id, level, fetchedAt })));
}
