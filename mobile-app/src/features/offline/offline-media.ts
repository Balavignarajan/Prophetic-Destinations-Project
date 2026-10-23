import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Directory as DirectoryType } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { API_BASE_URL } from '@/config/api';
import { isRecord } from '@/storage/json-store';

import { listWebImages, putWebImage, readWebImage, removeWebImage, webHasRoomFor, webStoreSupported } from './web-image-store';

/**
 * Offline copies of the images the learner API serves for PUBLISHED content (lesson images, lesson covers, course covers).
 *
 * WHERE (native): files live in the app's document directory (`offline-media/`), which the system does not purge like a cache, and which
 * is separate from the HTTP/image cache. The native file module is loaded lazily and never on the web build.
 * WHERE (web): the pictures are kept in the browser's IndexedDB (web-image-store.ts), which survives reloads. Everything below (references, staged updates, sweeping,
 * status) is shared; only storing, showing and deleting a picture differ. Where a browser cannot keep pictures (no IndexedDB, or it is blocked) the web build behaves
 * as it did before: URLs are used and only the lesson text is saved. WEB POLICY for what is shown: the live (current published) image while the browser is online,
 * the saved copy while it is offline or when the live image could not be loaded. A saved picture is never an object URL on its own: its bytes are in IndexedDB, and
 * an object URL is only the temporary handle made from them to display it.
 *
 * IDENTITY: a file is named by its media asset id. The backend never changes or overwrites the bytes of a stored asset (the
 * content hash is its ETag and a changed picture is a NEW asset with a new id), so an id is a safe, stable cache key: a new
 * publication that uses a different picture has a different id and can never show an outdated one. Downloads still go through
 * the existing learner routes (`/lessons/:id/media/:mediaId`, `/courses/:id/media/:mediaId`), which only serve an image while an
 * active publication names it; no admin route is involved.
 *
 * WRITES: a download goes to `offline-media/.tmp/<id>-<random>.part` and is MOVED into place (overwriting) only after it
 * completed; only then is the asset recorded as available, so a half-written file is never used.
 *
 * REFERENCES (`refs[owner]`, owner = the content-cache key kind:id:level): the asset ids the SAVED version of an item needs.
 * A file is deleted only when no saved item, no staged update and no running download needs it.
 *
 * STAGED UPDATES (lessons only, see offline-assets.ts): when a newer publication of an already completely saved lesson needs
 * images that are not on the device yet, the new text is NOT written to the content cache yet. The old text and its images stay
 * usable; the new assets are downloaded under `staged[owner]` (kept in memory only, so an app restart abandons the update and the
 * next online load starts it again). When every new asset is on disk the update is promoted: refs and cache switch to the new
 * version. Old and new references are never mixed in what is shown: the cache entry and `refs[owner]` always describe the same
 * version, except for the short promotion step where refs are the union (so a crash in the middle loses nothing).
 *
 * CONCURRENCY: all state changes are synchronous in memory; the index is written by a single queue that always writes the latest
 * state, so no write can overwrite a newer one with an older snapshot. `epoch` is bumped when the whole offline cache is cleared;
 * work started in an earlier epoch is discarded and can neither recreate references nor promote a staged update.
 *
 * Index (AsyncStorage `pd.media.v1`): { files: string[] (asset ids on disk), refs: { [owner]: string[] } }.
 */
export type AssetRef = { mediaId: string; url: string | null };

/** What the learner should be told about an item's images. */
export type OwnerStatus =
  | 'complete' // the saved version has all its images
  | 'saving' // images of the saved version are downloading
  | 'incomplete' // the saved version is missing images and nothing is downloading
  | 'updating' // an older complete version is saved; a newer one is being saved
  | 'update-failed' // an older complete version is saved; the newer one could not be completed (this session)
  | 'no-room' // the browser has no room left for some of the images (web only)
  | 'text-only' // this platform (or this browser) keeps no image files: only the text is saved, images need a connection
  | 'unknown'; // saved before offline images existed (or not saved)

const INDEX_KEY = 'pd.media.v1';
const CONCURRENCY = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isWeb = Platform.OS === 'web';
/** True where pictures can be kept: the native build, and a web browser that has IndexedDB. (A browser whose storage then proves unusable is reported by `canSaveImages`.) */
export const offlineMediaEnabled = !isWeb || webStoreSupported();

type FsModule = typeof import('expo-file-system');
let fsModule: FsModule | null = null;
function fs(): FsModule {
  fsModule ??= require('expo-file-system') as FsModule;
  return fsModule;
}

let files = new Set<string>();
let refs: Record<string, string[]> = {};
const staged = new Map<string, { token: number; ids: string[] }>();
const failedUpdates = new Set<string>();
let stageCounter = 0;
let epoch = 0;
let version = 0;
let initPromise: Promise<void> | null = null;
let ownersProvider: (() => Promise<Set<string>>) | null = null;
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<boolean>>();

// Web only. Object URLs made from stored pictures, the pictures being turned into one, the sizes of what is kept, the pictures the browser had no room for, the
// pictures whose saved copy is shown even while online (their live image failed) and whether the browser's storage turned out to be unusable.
const webUrls = new Map<string, string>();
const hydrating = new Map<string, Promise<void>>();
let webSizes = new Map<string, number>();
const noRoom = new Set<string>();
const preferSaved = new Set<string>();
let webStoreFailed = false;
let webListening = false;

export const mediaOwnerKey = (kind: string, id: string, level: string) => `${kind}:${id}:${level}`;
export const currentEpoch = () => epoch;

/** The content cache registers how to list the owners it still holds (so start-up can reconcile). */
export function registerOwnersProvider(provider: () => Promise<Set<string>>): void {
  ownersProvider = provider;
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getVersion = () => version;

function dirs(): { root: DirectoryType; tmp: DirectoryType } {
  const { Directory, Paths } = fs();
  const root = new Directory(Paths.document, 'offline-media');
  return { root, tmp: new Directory(root, '.tmp') };
}

/** One writer at a time, always writing the latest state: a slow earlier write can never land after a newer one. */
let writing: Promise<void> = Promise.resolve();
function persist(): Promise<void> {
  writing = writing.then(async () => {
    try {
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify({ files: [...files], refs }));
    } catch {
      // the in-memory state is still correct for this session
    }
  });
  return writing;
}

function neededIds(): Set<string> {
  const needed = new Set<string>(Object.values(refs).flat());
  for (const entry of staged.values()) entry.ids.forEach((id) => needed.add(id));
  return needed;
}

function deleteFile(id: string): void {
  if (isWeb) {
    const url = webUrls.get(id);
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // nothing to release
      }
      webUrls.delete(id);
    }
    preferSaved.delete(id);
    webSizes.delete(id);
    noRoom.delete(id);
    void removeWebImage(id);
    return;
  }
  try {
    const { File } = fs();
    const file = new File(dirs().root, id);
    if (file.exists) file.delete();
  } catch {
    // a stray file is removed by a later sweep
  }
}

/** Deletes every file nothing needs (no saved item, staged update or running download), and any unknown file in the folder. */
async function sweep(): Promise<void> {
  if (!offlineMediaEnabled) return;
  const needed = neededIds();
  let changed = false;
  for (const id of [...files]) {
    if (!needed.has(id) && !inFlight.has(id)) {
      files.delete(id);
      deleteFile(id);
      changed = true;
    }
  }
  try {
    if (isWeb) {
      for (const stored of (await listWebImages()) ?? []) {
        if (!files.has(stored.id) && !inFlight.has(stored.id) && !needed.has(stored.id)) deleteFile(stored.id);
      }
    } else {
      const { File } = fs();
      for (const entry of dirs().root.list()) {
        if (entry instanceof File && !files.has(entry.name) && !inFlight.has(entry.name) && !needed.has(entry.name)) entry.delete();
      }
    }
  } catch {
    // best effort
  }
  if (changed) {
    notify();
    await persist();
  }
}

/** Drops references of items the content cache no longer holds, then deletes what nothing needs any more. */
function reconcileOwners(ownersNow: ReadonlySet<string>): Promise<void> {
  for (const owner of Object.keys(refs)) if (!ownersNow.has(owner)) delete refs[owner];
  for (const owner of [...staged.keys()]) if (!ownersNow.has(owner) && !refs[owner]) staged.delete(owner);
  for (const owner of [...failedUpdates]) if (!ownersNow.has(owner)) failedUpdates.delete(owner);
  return sweep();
}

/**
 * Start-up: load the index, make the folders, remove partial downloads of a run that was interrupted, forget index entries whose
 * file has gone, adopt a complete file that was moved into place but never recorded (when something still needs it), and follow
 * the content cache's own retention.
 */
export function initOfflineMedia(): Promise<void> {
  if (!offlineMediaEnabled) return Promise.resolve();
  initPromise ??= (async () => {
    try {
      const text = await AsyncStorage.getItem(INDEX_KEY);
      const raw: unknown = text ? JSON.parse(text) : null;
      if (isRecord(raw)) {
        if (Array.isArray(raw.files)) files = new Set(raw.files.filter((id): id is string => typeof id === 'string' && UUID.test(id)));
        if (isRecord(raw.refs)) {
          for (const [owner, ids] of Object.entries(raw.refs)) {
            if (Array.isArray(ids)) refs[owner] = ids.filter((id): id is string => typeof id === 'string');
          }
        }
      }
    } catch {
      files = new Set();
      refs = {};
    }
    if (isWeb) {
      // The pictures are in IndexedDB: believe the index only for pictures that are really stored, and adopt a stored one something still needs.
      const stored = await listWebImages();
      if (stored === null) {
        webStoreFailed = true; // this browser's storage cannot be used: only the text is saved, as before
        files = new Set();
      } else {
        webSizes = new Map(stored.map((entry) => [entry.id, entry.size]));
        for (const id of [...files]) if (!webSizes.has(id)) files.delete(id);
        const needed = neededIds();
        for (const entry of stored) if (UUID.test(entry.id) && !files.has(entry.id) && needed.has(entry.id)) files.add(entry.id);
      }
      listenForConnectivity();
    } else {
      try {
        const { File } = fs();
        const { root, tmp } = dirs();
        root.create({ intermediates: true, idempotent: true });
        if (tmp.exists) tmp.delete(); // nothing is downloading yet at start-up: whatever is here was abandoned
        tmp.create({ intermediates: true, idempotent: true });
        for (const id of [...files]) if (!new File(root, id).exists) files.delete(id);
        const needed = neededIds();
        for (const entry of root.list()) {
          if (entry instanceof File && UUID.test(entry.name) && !files.has(entry.name) && needed.has(entry.name)) files.add(entry.name);
        }
      } catch {
        files = new Set(); // no usable storage: nothing is ever marked available
      }
    }
    try {
      if (ownersProvider) await reconcileOwners(await ownersProvider());
      else await sweep();
    } catch {
      // reconciliation is best effort
    }
    notify();
    await persist();
  })();
  return initPromise;
}

/** True when the browser reports that it is offline (a hint only: a page can be "online" and still not reach the server, which `switchToSavedWebCopy` covers). */
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Components re-render when the browser goes offline or comes back, so the picture they show follows (live while online, saved while offline). */
function listenForConnectivity(): void {
  if (webListening || typeof window === 'undefined') return;
  webListening = true;
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
}

/** Turns a stored picture into an object URL to show it (once; the stored picture itself stays in IndexedDB). A picture that is gone or damaged is forgotten, so it is saved again. */
function hydrateWebAsset(mediaId: string): Promise<void> {
  const running = hydrating.get(mediaId);
  if (running) return running;
  const task = (async () => {
    try {
      const blob = await readWebImage(mediaId);
      if (blob === null) {
        preferSaved.delete(mediaId);
        webSizes.delete(mediaId);
        if (files.delete(mediaId)) void persist();
      } else if (files.has(mediaId) && !webUrls.has(mediaId)) {
        webUrls.set(mediaId, URL.createObjectURL(blob));
      }
    } catch {
      preferSaved.delete(mediaId);
    }
  })().finally(() => {
    hydrating.delete(mediaId);
    notify();
  });
  hydrating.set(mediaId, task);
  return task;
}

/** What a web page shows for a saved picture: the saved copy while the browser is offline or when the live image failed, otherwise nothing (the live image is used). */
function webAssetUri(mediaId: string): string | null {
  if (!files.has(mediaId) || !(preferSaved.has(mediaId) || browserOffline())) return null;
  const url = webUrls.get(mediaId);
  if (url) return url;
  queueMicrotask(() => void hydrateWebAsset(mediaId)); // deferred: this runs while a component renders
  return null;
}

/** True when a web page could show a saved copy of this picture instead of the live one that failed to load. */
export function canSwitchToSavedWebCopy(mediaId: string | null | undefined): boolean {
  if (!isWeb || !offlineMediaEnabled || webStoreFailed || !mediaId || !files.has(mediaId)) return false;
  return !(preferSaved.has(mediaId) && webUrls.has(mediaId)); // already showing the saved copy: it is the saved copy that failed
}

/**
 * The live image of a picture could not be loaded (no connection, the server is down): shows the saved copy instead. Resolves to whether a saved copy is now being
 * shown; false means there is none that can be used (and a damaged one has been forgotten), so the caller shows its "could not be loaded" state.
 */
export async function switchToSavedWebCopy(mediaId: string): Promise<boolean> {
  if (!canSwitchToSavedWebCopy(mediaId)) return false;
  preferSaved.add(mediaId);
  if (webUrls.has(mediaId)) notify();
  else await hydrateWebAsset(mediaId);
  return webUrls.has(mediaId);
}

/** The local file for a saved asset, or null (not saved, not loaded yet, or not supported on this platform). On the web, see `webAssetUri`. */
export function localAssetUri(mediaId: string | null | undefined): string | null {
  if (!offlineMediaEnabled || !mediaId || !files.has(mediaId)) return null;
  if (isWeb) return webAssetUri(mediaId);
  try {
    const file = new (fs().File)(dirs().root, mediaId);
    if (file.exists) return file.uri;
    // Recorded as saved but the file has gone: show the live picture, and stop counting it as saved so the next successful load fetches it again.
    // (Deferred: this runs while a component renders, and forgetting it notifies the components.)
    queueMicrotask(() => reportBrokenAsset(mediaId));
    return null;
  } catch {
    return null;
  }
}

/**
 * Forgets saved files that have gone from the disk (the system or the learner removed them), so they are downloaded again by the next
 * successful load instead of being reported as saved. Call after `initOfflineMedia()`. If the disk cannot be checked, nothing changes.
 */
export function forgetMissingFiles(assets: AssetRef[]): void {
  if (!offlineMediaEnabled || isWeb) return; // the web store was reconciled at start-up, and a picture that proves unusable is forgotten when it is shown
  let changed = false;
  try {
    const { File } = fs();
    const { root } = dirs();
    for (const asset of assets) {
      if (files.has(asset.mediaId) && !new File(root, asset.mediaId).exists) {
        files.delete(asset.mediaId);
        changed = true;
      }
    }
  } catch {
    return;
  }
  if (changed) {
    void persist();
    notify();
  }
}

/** Forgets a saved file that could not be displayed, so the next successful load downloads it again. */
export function reportBrokenAsset(mediaId: string): void {
  if (!files.delete(mediaId)) return;
  deleteFile(mediaId);
  void persist();
  notify();
}

const WEB_DOWNLOAD_TIMEOUT_MS = 30_000;
const LEARNER_MEDIA_PATH = /\/(lessons|courses)\/[^/]+\/media\/[^/]+$/;

/** Only the learner media routes of this app's own API are ever fetched and kept: no admin route, no other site (whose CORS rules could not be relied on anyway). */
function isLearnerMediaUrl(url: string): boolean {
  if (API_BASE_URL === null || !url.startsWith(`${API_BASE_URL}/`)) return false;
  try {
    const parsed = new URL(url);
    return LEARNER_MEDIA_PATH.test(parsed.pathname) && /^(BEGINNER|INTERMEDIATE|ADVANCED)$/.test(parsed.searchParams.get('level') ?? '');
  } catch {
    return false;
  }
}

/** Fetches a picture from its learner route and keeps it in IndexedDB. Never throws. The same commit rules as a native download apply. */
async function downloadOneWeb(asset: AssetRef, startedIn: number): Promise<boolean> {
  if (webStoreFailed || !asset.url || !UUID.test(asset.mediaId) || !isLearnerMediaUrl(asset.url)) return false;
  const used = () => [...webSizes].reduce((sum, [id, size]) => (id === asset.mediaId ? sum : sum + size), 0);
  // A picture the browser had no room for is not fetched again until there is room.
  if (noRoom.has(asset.mediaId) && !(await webHasRoomFor(1024 * 1024, used()))) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_DOWNLOAD_TIMEOUT_MS);
  try {
    // No cookies or credentials: the learner routes are public, and nothing private can ride along.
    const response = await fetch(asset.url, { credentials: 'omit', signal: controller.signal });
    if (!response.ok) return false;
    const blob = await response.blob();
    if (!(blob.size > 0) || !blob.type.startsWith('image/')) return false; // an error page or an empty answer is not a picture
    const result = await putWebImage(asset.mediaId, blob, used());
    if (result === 'no-room') {
      noRoom.add(asset.mediaId);
      notify();
      return false;
    }
    if (result !== 'stored') return false;
    noRoom.delete(asset.mediaId);
    if (startedIn !== epoch || !neededIds().has(asset.mediaId)) {
      deleteFile(asset.mediaId); // cleared or released while it was downloading: nothing may keep it
      return false;
    }
    webSizes.set(asset.mediaId, blob.size);
    files.add(asset.mediaId);
    notify();
    void persist();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function downloadOne(asset: AssetRef, startedIn: number): Promise<boolean> {
  const existing = inFlight.get(asset.mediaId);
  if (existing) return existing;
  const task = (async () => {
    if (isWeb) return downloadOneWeb(asset, startedIn);
    if (!asset.url || !UUID.test(asset.mediaId)) return false;
    const { File } = fs();
    const { root, tmp } = dirs();
    const part = new File(tmp, `${asset.mediaId}-${Math.random().toString(36).slice(2)}.part`);
    try {
      tmp.create({ intermediates: true, idempotent: true });
      // Destination is a file inside an existing folder; `idempotent` lets a retry overwrite a leftover part file.
      await File.downloadFileAsync(asset.url, part, { idempotent: true });
      if (!part.exists || !(part.size > 0)) throw new Error('empty download');
      // Move is the commit: after it the file has its final name (and `part` points there). A non-2xx answer never gets here.
      await part.move(new File(root, asset.mediaId), { overwrite: true });
      if (startedIn !== epoch || !neededIds().has(asset.mediaId)) {
        deleteFile(asset.mediaId); // cleared or released while it was downloading: nothing may keep it
        return false;
      }
      files.add(asset.mediaId);
      notify();
      void persist();
      return true;
    } catch {
      try {
        if (part.exists) part.delete();
      } catch {
        // ignore
      }
      return false;
    }
  })().finally(() => {
    inFlight.delete(asset.mediaId);
    notify();
  });
  inFlight.set(asset.mediaId, task);
  notify();
  return task;
}

/** Downloads the assets that are not on disk yet (each at most once, three at a time). Resolves to how many are still missing. */
async function downloadMissing(assets: AssetRef[], startedIn: number): Promise<number> {
  const todo = [...new Map(assets.map((asset) => [asset.mediaId, asset])).values()].filter((asset) => !files.has(asset.mediaId));
  let next = 0;
  let missing = 0;
  const worker = async () => {
    while (next < todo.length) {
      const asset = todo[next++];
      if (startedIn !== epoch || !(await downloadOne(asset, startedIn))) missing += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return missing;
}

const idsOf = (assets: AssetRef[]) => [...new Set(assets.map((asset) => asset.mediaId))];

/** True when every one of these assets is on disk now. */
export function hasAllAssets(assets: AssetRef[]): boolean {
  return assets.every((asset) => files.has(asset.mediaId));
}

/**
 * Makes `assets` the references of the saved version of `owner`, synchronously (so the references exist before the content that
 * needs them is written). Call after `initOfflineMedia()`.
 */
export function setSavedAssets(owner: string, assets: AssetRef[]): void {
  if (!offlineMediaEnabled) return;
  refs[owner] = idsOf(assets);
  failedUpdates.delete(owner);
  staged.delete(owner);
  void persist();
  notify();
}

/** The asset ids the saved version of `owner` needs right now (a copy), or undefined when nothing is recorded. */
export function savedAssetIds(owner: string): string[] | undefined {
  const saved = refs[owner];
  return saved === undefined ? undefined : [...saved];
}

/**
 * Puts the references of `owner` back to what they were (see `savedAssetIds`) when the content they were switched for could not be written
 * to the content cache, so the saved text and its references keep describing the same version.
 */
export function restoreSavedAssets(owner: string, ids: string[] | undefined): void {
  if (!offlineMediaEnabled) return;
  if (ids === undefined) delete refs[owner];
  else refs[owner] = ids;
  void persist();
  notify();
  void sweep().catch(() => undefined);
}

/** Downloads what the saved version of `owner` is missing. Never throws; a failed asset is retried by the next successful load. */
export async function downloadSaved(owner: string, assets: AssetRef[], startedIn: number): Promise<void> {
  if (!offlineMediaEnabled || startedIn !== epoch) return;
  await downloadMissing(assets, startedIn);
  if (startedIn === epoch) await sweep();
}

/**
 * Stages a newer version of an already completely saved item: downloads `assets` while the old version stays untouched, then,
 * if everything arrived and nothing newer or a clear intervened, runs `promote` (which writes the new content to the cache).
 * The references switch to the new version around that write. On failure the old version stays and the item is marked
 * 'update-failed' for this session; the staged references are released.
 */
export async function stageUpdate(owner: string, assets: AssetRef[], startedIn: number, promote: () => Promise<void>): Promise<void> {
  if (!offlineMediaEnabled || startedIn !== epoch) return;
  const token = ++stageCounter;
  const ids = idsOf(assets);
  staged.set(owner, { token, ids });
  failedUpdates.delete(owner);
  notify();

  const missing = await downloadMissing(assets, startedIn);
  const current = () => startedIn === epoch && staged.get(owner)?.token === token;
  if (!current()) return; // superseded by a newer load, or the cache was cleared
  if (missing > 0) {
    staged.delete(owner);
    failedUpdates.add(owner);
    notify();
    await sweep();
    return;
  }
  const old = refs[owner] ?? [];
  refs[owner] = [...new Set([...old, ...ids])]; // protect both versions while the content switches
  await persist();
  try {
    await promote();
  } catch {
    // the content was not switched: keep the old version
    refs[owner] = old;
    staged.delete(owner);
    failedUpdates.add(owner);
    notify();
    await persist();
    await sweep();
    return;
  }
  if (startedIn !== epoch) return; // cleared while promoting: the clear already reset everything
  refs[owner] = ids;
  staged.delete(owner);
  failedUpdates.delete(owner);
  notify();
  await persist();
  await sweep();
}

/** Follows the content cache's retention: forgets saved items it no longer holds and deletes the files nothing needs. */
export async function cleanUp(ownersNow: ReadonlySet<string>): Promise<void> {
  if (!offlineMediaEnabled) return;
  await initOfflineMedia();
  await reconcileOwners(ownersNow);
  notify();
}

/** The whole offline cache was cleared: forget every reference, drop staged work, and make running downloads delete their result. */
export async function invalidateAllMedia(): Promise<void> {
  if (!offlineMediaEnabled) return;
  // Synchronously first, so nothing started before the clear can finish into the new state...
  const reset = () => {
    epoch += 1;
    refs = {};
    staged.clear();
    failedUpdates.clear();
    noRoom.clear();
    preferSaved.clear();
    notify();
  };
  reset();
  // ...and again once an unfinished start-up has loaded the old index.
  await initOfflineMedia();
  refs = {};
  staged.clear();
  failedUpdates.clear();
  notify();
  await persist();
  await sweep();
}

/** False where pictures cannot be kept: a platform without file storage, or a browser without usable IndexedDB. Components use it to word their "not saved" messages. */
export const canSaveImages = () => offlineMediaEnabled && !webStoreFailed;

export function ownerStatus(owner: string): OwnerStatus {
  if (!canSaveImages()) return 'text-only'; // this platform or browser keeps no image files: the text can be saved, the images cannot
  const saved = refs[owner];
  const complete = saved !== undefined && saved.every((id) => files.has(id));
  if (staged.has(owner)) return 'updating';
  if (failedUpdates.has(owner) && complete) return 'update-failed';
  if (saved === undefined) return 'unknown';
  if (complete) return 'complete';
  if (saved.some((id) => inFlight.has(id))) return 'saving';
  return saved.some((id) => !files.has(id) && noRoom.has(id)) ? 'no-room' : 'incomplete';
}

/** True once every asset the saved version needs is on disk. */
export const isOwnerComplete = (owner: string) => ownerStatus(owner) === 'complete';

/** True when an older complete version is saved but a newer, fully downloaded one is not (so "saved" does not mean "latest"). */
export const hasOlderSavedVersion = (owner: string) => ['updating', 'update-failed'].includes(ownerStatus(owner));

/**
 * Hook for components: re-renders when assets become available, downloads start or finish, or saved versions change, and starts
 * loading the index.
 */
export function useOfflineMedia(): {
  uriFor: (mediaId: string | null | undefined) => string | null;
  status: (owner: string) => OwnerStatus;
  isComplete: (owner: string) => boolean;
} {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useEffect(() => {
    void initOfflineMedia();
  }, []);
  return { uriFor: localAssetUri, status: ownerStatus, isComplete: isOwnerComplete };
}

/** The address to show an asset from: the saved local file when there is one, otherwise the learner URL (null if unknown). */
export function useAssetUri(mediaId: string | null | undefined, remoteUrl: string | null): string | null {
  const { uriFor } = useOfflineMedia();
  return uriFor(mediaId) ?? remoteUrl;
}
