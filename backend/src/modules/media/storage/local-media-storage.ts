import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { isValidStorageKey } from '../domain/filename.js';
import {
  InvalidStorageKeyError,
  type MediaStorage,
  StorageFailureError,
  StoredObjectNotFoundError,
} from './media-storage.js';

/** Files are readable by the service account and its group only. */
const FILE_MODE = 0o640;
const DIRECTORY_MODE = 0o750;
const TEMP_DIRECTORY = '.tmp';

/**
 * Development storage on the local filesystem, under one configurable root.
 *
 * - Only keys this system generates are accepted (`ab/<32 hex>`); anything else is refused BEFORE a path is built,
 *   and the resolved path is checked to still be inside the root (defence in depth against traversal).
 * - A write goes to a temporary file under the root and is linked into place (which fails if the key exists), so a
 *   reader never sees a half-written object, an existing object is never overwritten, and a crash leaves at most a
 *   stray file under `.tmp`.
 * - Errors carry the operation but never the path.
 */
export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    const temporary = join(
      this.root,
      TEMP_DIRECTORY,
      randomBytes(12).toString('hex'),
    );
    try {
      await mkdir(dirname(temporary), {
        recursive: true,
        mode: DIRECTORY_MODE,
      });
      await mkdir(dirname(target), { recursive: true, mode: DIRECTORY_MODE });
      await writeFile(temporary, data, { flag: 'wx', mode: FILE_MODE });
      // A hard link fails if the target exists, so an object is never overwritten, even by a racing writer.
      await link(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new StorageFailureError('put', error);
    }
    await rm(temporary, { force: true }).catch(() => undefined);
  }

  async open(key: string): Promise<Readable> {
    const target = this.pathFor(key);
    try {
      const info = await stat(target);
      if (!info.isFile()) throw new StoredObjectNotFoundError();
    } catch (error) {
      if (
        error instanceof StoredObjectNotFoundError ||
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        throw new StoredObjectNotFoundError();
      }
      throw new StorageFailureError('open', error);
    }
    return createReadStream(target);
  }

  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    try {
      await rm(target, { force: true });
    } catch (error) {
      throw new StorageFailureError('delete', error);
    }
  }

  /** The absolute path of a valid key, guaranteed to lie inside the root. */
  private pathFor(key: string): string {
    if (!isValidStorageKey(key)) throw new InvalidStorageKeyError();
    const target = resolve(this.root, key);
    if (!target.startsWith(this.root + sep)) throw new InvalidStorageKeyError();
    return target;
  }
}
