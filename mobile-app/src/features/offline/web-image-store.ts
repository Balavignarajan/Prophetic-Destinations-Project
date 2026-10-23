/**
 * Persistent image storage for the WEB build (OFF-001, LESS-006, NFR-001): the browser counterpart of the files the native build keeps in the app's document folder.
 * It stores the bytes of images the learner routes serve for PUBLISHED content, in IndexedDB, so they survive reloads and work with no connection. Nothing here
 * knows about lessons: offline-media.ts decides what is kept and for how long, exactly as it does for the native files.
 *
 * WHY IndexedDB, not the Cache API or an in-memory object URL: IndexedDB is available in every browser context (the Cache API needs a secure context), stores binary
 * data directly and is what the browser persists across reloads. An object URL is only the temporary handle offline-media makes from a stored image to show it; the stored
 * image itself is the persisted representation.
 *
 * LAYOUT: database `pd-offline-images`, store `images` (key = media asset id -> { blob, type, size, savedAt }) and store `meta` (key = id -> { size }) so the amount
 * kept can be counted without reading any image. An image and its meta are written and removed in ONE transaction.
 *
 * LIMITS: browser storage is not unlimited and may be evicted. A save is refused (`no-room`) when it would pass this app's own budget, when the browser's own estimate
 * says there is not enough room left, or when the browser reports its quota is exceeded. A refused or failed save never throws and never affects any lesson text.
 * An unsupported or unusable IndexedDB (a private window that blocks it, a blocked upgrade) makes every function report "unavailable"; callers then keep only the
 * lesson text, as before.
 */
const DB_NAME = 'pd-offline-images';
const DB_VERSION = 1;
const IMAGES = 'images';
const META = 'meta';

/** The most image data this app keeps in the browser (the saved lessons' pictures). Beyond it new pictures are not saved; the lesson text always is. */
export const WEB_IMAGE_BUDGET_BYTES = 120 * 1024 * 1024;
/** No single picture larger than this is kept. */
export const WEB_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Room the browser's own estimate must still show after a picture is added, so the app never takes the last of the storage the lessons' text also needs. */
const HEADROOM_BYTES = 16 * 1024 * 1024;

export type PutResult = 'stored' | 'no-room' | 'failed';

/** True when this browser has what is needed to keep images (evaluated when called, never at import, so it is safe during the static web build). */
export function webStoreSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof fetch === 'function' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

let opening: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    if (!webStoreSupported()) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the database, or the browser closing it: let go so nothing is blocked, and open again on the next use.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        db.onclose = () => {
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    if (db === null) opening = null; // a later use may succeed (the first attempt can fail while the browser is still starting up)
    return db;
  });
  return opening;
}

function finished(tx: IDBTransaction): Promise<'done' | 'quota' | 'failed'> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve('done');
    const fail = () => resolve(tx.error?.name === 'QuotaExceededError' ? 'quota' : 'failed');
    tx.onerror = fail;
    tx.onabort = fail;
  });
}

function asPromise<T>(request: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

/** The saved pictures (id and byte size), or null when the browser's storage cannot be used at all. */
export async function listWebImages(): Promise<{ id: string; size: number }[] | null> {
  const db = await openDatabase();
  if (db === null) return null;
  try {
    const tx = db.transaction(META, 'readonly');
    const store = tx.objectStore(META);
    // Both requests are issued before waiting, so the transaction is never left idle between them.
    const [keys, values] = await Promise.all([asPromise(store.getAllKeys()), asPromise(store.getAll())]);
    if (!keys || !values) return null;
    const out: { id: string; size: number }[] = [];
    keys.forEach((key, index) => {
      const meta = values[index] as { size?: unknown } | undefined;
      if (typeof key === 'string' && meta && typeof meta.size === 'number' && meta.size > 0) out.push({ id: key, size: meta.size });
    });
    return out;
  } catch {
    return null;
  }
}

/** Whether the browser says it can take `bytes` more and still leave room for everything else. An unknown estimate is not a reason to refuse. */
async function browserHasRoomFor(bytes: number): Promise<boolean> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate && typeof estimate.quota === 'number' && typeof estimate.usage === 'number') return estimate.quota - estimate.usage >= bytes + HEADROOM_BYTES;
  } catch {
    // no estimate: go on
  }
  return true;
}

/** True when `bytes` more would fit in this app's budget and the browser's own estimate (used to avoid downloading a picture that cannot be kept). */
export async function webHasRoomFor(bytes: number, usedBytes: number): Promise<boolean> {
  return usedBytes + bytes <= WEB_IMAGE_BUDGET_BYTES && (await browserHasRoomFor(bytes));
}

/** Keeps a picture. `usedBytes` is what is already kept (not counting this id, which is replaced if it exists). */
export async function putWebImage(id: string, blob: Blob, usedBytes: number): Promise<PutResult> {
  if (!(blob.size > 0) || blob.size > WEB_MAX_IMAGE_BYTES) return 'failed';
  if (!(await webHasRoomFor(blob.size, usedBytes))) return 'no-room';
  const db = await openDatabase();
  if (db === null) return 'failed';
  try {
    const tx = db.transaction([IMAGES, META], 'readwrite');
    const done = finished(tx);
    tx.objectStore(IMAGES).put({ blob, type: blob.type, size: blob.size, savedAt: Date.now() }, id);
    tx.objectStore(META).put({ size: blob.size }, id);
    const outcome = await done;
    return outcome === 'done' ? 'stored' : outcome === 'quota' ? 'no-room' : 'failed';
  } catch (error) {
    return (error as { name?: string } | null)?.name === 'QuotaExceededError' ? 'no-room' : 'failed';
  }
}

/**
 * The saved picture, or null when there is none or it cannot be used. A record that is damaged (not a picture, or empty) is removed so it is saved again by the next
 * online load, instead of failing every time it is shown.
 */
export async function readWebImage(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  if (db === null) return null;
  try {
    const record = await asPromise(db.transaction(IMAGES, 'readonly').objectStore(IMAGES).get(id));
    if (record === undefined) return null;
    const blob = (record as { blob?: unknown } | null)?.blob;
    if (blob instanceof Blob && blob.size > 0) return blob;
    await removeWebImage(id);
    return null;
  } catch {
    return null;
  }
}

/** Removes a picture (and its meta). Never throws. */
export async function removeWebImage(id: string): Promise<void> {
  const db = await openDatabase();
  if (db === null) return;
  try {
    const tx = db.transaction([IMAGES, META], 'readwrite');
    const done = finished(tx);
    tx.objectStore(IMAGES).delete(id);
    tx.objectStore(META).delete(id);
    await done;
  } catch {
    // a leftover record is removed by a later sweep
  }
}
