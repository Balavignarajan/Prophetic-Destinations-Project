import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LearningLevel } from '@/learning/levels';
import { isRecord, readJsonResult, tryWriteJson } from '@/storage/json-store';

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
 * Versioning:  the `v1` in the key and `v` in the entry. A new format means a new version. An entry that fails the type guard
 *              (malformed or from an older shape) is deleted when it is read: the app could not show it anyway.
 *
 * Retention: NOTHING is deleted because of its age. A saved copy stays until
 *   - the same item is fetched again (it is replaced by the newer copy);
 *   - the backend says the item is no longer published (404), which the loader handles;
 *   - the learner clears the offline cache in Settings; or
 *   - its pool is over its limit (below).
 * `fetchedAt` is when the copy was fetched. It is shown to the learner ("saved on ...") and is the only age information; it never
 * causes a deletion, so a lesson read online once stays readable offline however long ago that was.
 *
 * Pools: each kind of entry has its own limit, so refreshing course lists, previous/next links or related lists can never push a
 * saved lesson out of the cache.
 *   lesson     the lessons themselves ....................... CACHE_LIMITS.lesson
 *   structure  course lists, Home topic lists and course pages ... CACHE_LIMITS.structure
 *   extras     previous/next and related lists, and the course list of each Home topic ... CACHE_LIMITS.extras
 * Beyond its limit a pool drops the entry fetched LEAST recently first. The limits are the explicit, configurable retention policy.
 * (A lesson is a few KB of text, but the storage the platform gives AsyncStorage is limited and shared with everything else the app
 * keeps, so the lesson limit is a placeholder for a product decision, not a promise of unlimited offline reading.)
 *
 * A write the storage refuses (it is full) is retried once after dropping a few of the oldest `extras` entries; lessons, course
 * pages and lists are never dropped to make room. If it still fails the write reports `false` and nothing is claimed as saved.
 *
 * Reading and bookkeeping never delete on a hunch: if the storage cannot be read right now, nothing is removed; a missing or damaged
 * index is rebuilt from the saved entries themselves instead of discarding them.
 *
 * Reads and writes are serialised through one queue so the index can never be corrupted by overlapping operations.
 */
export const CACHE_LIMITS = { lesson: 120, structure: 60, extras: 240 } as const;

export type CacheKind = 'catalog' | 'home' | 'topic' | 'course' | 'lesson' | 'navigation' | 'related';

type Pool = keyof typeof CACHE_LIMITS;
const POOLS: readonly Pool[] = ['lesson', 'structure', 'extras'];
const poolOf = (kind: CacheKind): Pool => (kind === 'lesson' ? 'lesson' : kind === 'catalog' || kind === 'home' || kind === 'course' ? 'structure' : 'extras');
/** How many of the oldest `extras` entries are dropped to make room when the storage refuses a write. */
const ROOM_BATCH = 12;

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

const KINDS: readonly string[] = ['catalog', 'home', 'topic', 'course', 'lesson', 'navigation', 'related'];
const LEVELS: readonly string[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

/** After the cache changed: the saved images follow it (a file is kept only while some remaining item still needs it). */
function syncMedia(index: IndexItem[]): void {
  const owners = new Set(index.filter((item) => item.kind !== 'navigation' && item.kind !== 'related').map((item) => mediaOwnerKey(item.kind, item.id, item.level)));
  void cleanUp(owners).catch(() => undefined);
}

// At start-up the saved images are reconciled with what this cache still holds. If the index cannot be read, the cache's contents are
// unknown, so this fails (the reconciliation is skipped) rather than report an empty cache and have every saved image deleted.
registerOwnersProvider(() =>
  serial(async () => {
    const index = await readIndex();
    if (index === null) throw new Error('the offline cache index could not be read');
    return new Set(index.filter((item) => item.kind !== 'navigation' && item.kind !== 'related').map((item) => mediaOwnerKey(item.kind, item.id, item.level)));
  }),
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

/** The kind, id and level a cache key names, or null when the key is not one of this cache's entries. */
function parseKey(key: string): Pick<IndexItem, 'kind' | 'id' | 'level'> | null {
  if (!key.startsWith(`${PREFIX}:`)) return null;
  const rest = key.slice(PREFIX.length + 1);
  const first = rest.indexOf(':');
  const last = rest.lastIndexOf(':');
  if (first <= 0 || last <= first) return null;
  const kind = rest.slice(0, first);
  const id = rest.slice(first + 1, last);
  const level = rest.slice(last + 1);
  if (!KINDS.includes(kind) || !LEVELS.includes(level) || id.length === 0) return null;
  return { kind: kind as CacheKind, id, level: level as LearningLevel };
}

/** Rebuilds the index from the saved entries themselves (their keys name the item, and each carries its fetch time). Null if the storage cannot be listed. */
async function rebuildIndex(): Promise<IndexItem[] | null> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`${PREFIX}:`));
    const items: IndexItem[] = [];
    if (keys.length > 0) {
      for (const [key, text] of await AsyncStorage.multiGet(keys)) {
        const parts = parseKey(key);
        if (!parts || text === null) continue;
        try {
          const raw: unknown = JSON.parse(text);
          if (isRecord(raw) && raw.v === 1 && typeof raw.fetchedAt === 'number') items.push({ key, ...parts, fetchedAt: raw.fetchedAt });
        } catch {
          // a damaged entry stays out of the index; it is removed if it is ever read
        }
      }
    }
    await tryWriteJson(INDEX_KEY, items); // best effort: the rebuilt list is used either way
    return items;
  } catch {
    return null;
  }
}

/**
 * What is saved. A missing or damaged index is rebuilt from the entries (nothing is discarded). Null means the storage could not be
 * read at all, so what is saved is unknown: callers must then leave everything as it is.
 */
async function readIndex(): Promise<IndexItem[] | null> {
  const read = await readJsonResult(INDEX_KEY, parseIndex);
  if (read.status === 'ok') return read.value;
  if (read.status === 'unreadable') return null;
  return rebuildIndex();
}

async function trySetItem(key: string, text: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

async function removeEntries(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // an orphan entry is harmless: it is no longer indexed and is ignored
  }
}

/** Applies each pool's limit: the entries fetched least recently go first. */
function prune(index: IndexItem[]): { keep: IndexItem[]; drop: IndexItem[] } {
  const keep: IndexItem[] = [];
  for (const pool of POOLS) {
    const inPool = index.filter((item) => poolOf(item.kind) === pool).sort((a, b) => b.fetchedAt - a.fetchedAt);
    keep.push(...inPool.slice(0, CACHE_LIMITS[pool]));
  }
  const keepKeys = new Set(keep.map((item) => item.key));
  return { keep, drop: index.filter((item) => !keepKeys.has(item.key)) };
}

/** Makes a little room after a refused write by dropping the oldest `extras` entries only. Returns the remaining index, or null when there was nothing to drop. */
async function freeRoom(index: IndexItem[]): Promise<IndexItem[] | null> {
  const oldest = index.filter((item) => poolOf(item.kind) === 'extras').sort((a, b) => a.fetchedAt - b.fetchedAt).slice(0, ROOM_BATCH);
  if (oldest.length === 0) return null;
  await removeEntries(oldest.map((item) => item.key));
  const gone = new Set(oldest.map((item) => item.key));
  return index.filter((item) => !gone.has(item.key));
}

/** Stops listing an entry that is gone or unusable (and deletes it when it is unusable). */
async function forget(key: string, deleteEntry: boolean): Promise<void> {
  if (deleteEntry) await removeEntries([key]);
  const index = await readIndex();
  if (index === null || !index.some((item) => item.key === key)) return;
  const rest = index.filter((item) => item.key !== key);
  if (await tryWriteJson(INDEX_KEY, rest)) syncMedia(rest);
}

/**
 * The cached value for this item, or null if there is none or it cannot be used. Age never matters. An entry that fails `validate`
 * (damaged, or from an older shape) is deleted; if the storage merely cannot be read right now, nothing is deleted.
 */
export function cacheRead<T>(
  kind: CacheKind,
  id: string,
  level: LearningLevel,
  validate: (data: unknown) => data is T,
): Promise<CachedValue<T> | null> {
  return serial(async () => {
    const key = cacheKey(kind, id, level);
    const read = await readJsonResult(key, (raw) =>
      isRecord(raw) && raw.v === 1 && typeof raw.fetchedAt === 'number' && validate(raw.data)
        ? ({ v: 1, fetchedAt: raw.fetchedAt, data: raw.data } as Entry<T>)
        : null,
    );
    if (read.status === 'ok') return { data: read.value.data, fetchedAt: read.value.fetchedAt };
    if (read.status === 'unreadable') return null; // the copy may well be fine: touch nothing
    await forget(key, read.status === 'invalid');
    return null;
  });
}

/**
 * Stores a successfully fetched, already-validated response and applies the retention policy. Resolves to whether it was stored:
 * `false` means the storage refused it (or could not be read), so the item must not be reported as saved for offline use.
 */
export function cacheWrite(kind: CacheKind, id: string, level: LearningLevel, data: unknown): Promise<boolean> {
  return serial(async () => {
    const key = cacheKey(kind, id, level);
    let index = await readIndex();
    if (index === null) return false; // what is saved is unknown: saving blind could break the bookkeeping
    const now = Date.now();
    let text: string;
    try {
      text = JSON.stringify({ v: 1, fetchedAt: now, data } satisfies Entry<unknown>);
    } catch {
      return false;
    }
    let stored = await trySetItem(key, text);
    if (!stored) {
      const roomy = await freeRoom(index);
      if (roomy) {
        index = roomy;
        stored = await trySetItem(key, text);
      }
    }
    if (!stored) return false;

    const existed = index.some((item) => item.key === key);
    const next = index.filter((item) => item.key !== key);
    next.push({ key, kind, id, level, fetchedAt: now });
    const { keep, drop } = prune(next);
    // The index first, then the removals: if the index cannot be written, nothing has been dropped yet.
    if (!(await tryWriteJson(INDEX_KEY, keep))) {
      if (!existed) await removeEntries([key]); // an entry the index does not list would escape the retention rules
      return existed; // an existing item now holds the newer copy; the index only has the older fetch time
    }
    await removeEntries(drop.map((item) => item.key));
    syncMedia(keep);
    return true;
  });
}

/** Removes one item (used when the backend says it is no longer available). */
export function cacheRemove(kind: CacheKind, id: string, level: LearningLevel): Promise<void> {
  return serial(async () => {
    const key = cacheKey(kind, id, level);
    await removeEntries([key]);
    const index = await readIndex();
    if (index === null) return;
    const rest = index.filter((item) => item.key !== key);
    if (rest.length !== index.length) await tryWriteJson(INDEX_KEY, rest);
    syncMedia(rest);
  });
}

/** Deletes the whole cache. Returns how many entries were removed. */
export function cacheClear(): Promise<number> {
  return serial(async () => {
    const listed = await readJsonResult(INDEX_KEY, parseIndex);
    let keys = listed.status === 'ok' ? listed.value.map((item) => item.key) : [];
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
  return serial(async () => ((await readIndex()) ?? []).map(({ kind, id, level, fetchedAt }) => ({ kind, id, level, fetchedAt })));
}
