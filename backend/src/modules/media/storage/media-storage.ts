import type { Readable } from 'node:stream';

/**
 * Where the bytes of a media asset live. The media module talks to this interface only, so the local-filesystem
 * adapter used in development can be replaced by object storage (S3 or similar) at deployment without touching the
 * business layer. Keys are opaque, server-generated strings (see `newStorageKey`); an adapter must refuse any key
 * that is not one.
 */
export interface MediaStorage {
  /** Stores the bytes under a new key. Fails if the key already exists (a stored object is never overwritten). */
  put(key: string, data: Buffer): Promise<void>;
  /** A stream of the stored bytes. Throws `StoredObjectNotFoundError` if there is no such object. */
  open(key: string): Promise<Readable>;
  /** Removes the object. Removing one that does not exist is not an error (deletes are repeatable). */
  delete(key: string): Promise<void>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/** The key does not name a stored object. */
export class StoredObjectNotFoundError extends Error {
  constructor() {
    super('The stored object does not exist');
    this.name = 'StoredObjectNotFoundError';
  }
}

/** The key is not a key this system generates (a path-traversal attempt, a wrong shape, anything unexpected). */
export class InvalidStorageKeyError extends Error {
  constructor() {
    super('The storage key is not valid');
    this.name = 'InvalidStorageKeyError';
  }
}

/** The storage backend failed (disk full, permissions, network). The message never contains a path. */
export class StorageFailureError extends Error {
  constructor(
    readonly operation: 'put' | 'open' | 'delete',
    cause?: unknown,
  ) {
    super(`Media storage failed during ${operation}`, { cause });
    this.name = 'StorageFailureError';
  }
}
