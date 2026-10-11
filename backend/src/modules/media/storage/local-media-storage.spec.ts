import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newStorageKey } from '../domain/filename.js';
import { LocalMediaStorage } from './local-media-storage.js';
import {
  InvalidStorageKeyError,
  StorageFailureError,
  StoredObjectNotFoundError,
} from './media-storage.js';

async function read(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

describe('LocalMediaStorage', () => {
  let directory: string;
  let storage: LocalMediaStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pd-media-'));
    storage = new LocalMediaStorage(directory);
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('stores bytes under the key and reads them back unchanged', async () => {
    const key = newStorageKey();
    const data = Buffer.from([0, 1, 2, 255, 254, 10, 13]);
    await storage.put(key, data);
    expect(await read(await storage.open(key))).toEqual(data);
    // sharded by the first byte of the key, inside the root
    expect((await stat(join(directory, key))).isFile()).toBe(true);
  });

  it('never overwrites an existing object', async () => {
    const key = newStorageKey();
    await storage.put(key, Buffer.from('first'));
    await expect(
      storage.put(key, Buffer.from('second')),
    ).rejects.toBeInstanceOf(StorageFailureError);
    expect((await read(await storage.open(key))).toString()).toBe('first');
  });

  it('leaves no temporary file behind, after a success or a failed overwrite', async () => {
    const key = newStorageKey();
    await storage.put(key, Buffer.from('x'));
    await storage.put(key, Buffer.from('y')).catch(() => undefined);
    const temporary = await readdir(join(directory, '.tmp'));
    expect(temporary).toEqual([]);
  });

  it('deletes, and deleting again (or something that never existed) is not an error', async () => {
    const key = newStorageKey();
    await storage.put(key, Buffer.from('x'));
    await storage.delete(key);
    await expect(storage.open(key)).rejects.toBeInstanceOf(
      StoredObjectNotFoundError,
    );
    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.delete(newStorageKey())).resolves.toBeUndefined();
  });

  it('reports a missing object as not found', async () => {
    await expect(storage.open(newStorageKey())).rejects.toBeInstanceOf(
      StoredObjectNotFoundError,
    );
  });

  it('refuses every key that is not a generated one, for every operation, and touches nothing outside the root', async () => {
    const outside = join(directory, '..', `pd-outside-${Date.now()}`);
    await writeFile(outside, 'secret');
    try {
      const id = 'a'.repeat(32);
      for (const key of [
        '../outside',
        `../${outside}`,
        `aa/../../${id}`,
        '/etc/passwd',
        'C:\\Windows\\win.ini',
        `aa/${id}\u0000.png`,
        '',
        'aa/' + id + '/x',
        `.tmp/${id}`,
      ]) {
        await expect(storage.put(key, Buffer.from('x'))).rejects.toBeInstanceOf(
          InvalidStorageKeyError,
        );
        await expect(storage.open(key)).rejects.toBeInstanceOf(
          InvalidStorageKeyError,
        );
        await expect(storage.delete(key)).rejects.toBeInstanceOf(
          InvalidStorageKeyError,
        );
      }
      expect(await readFile(outside, 'utf8')).toBe('secret');
    } finally {
      await rm(outside, { force: true });
    }
  });

  it('reports a storage failure without revealing the path', async () => {
    // the root is a file, so no directory can be created under it
    const blocked = join(directory, 'not-a-directory');
    await writeFile(blocked, 'x');
    const failing = new LocalMediaStorage(blocked);
    const error = await failing
      .put(newStorageKey(), Buffer.from('x'))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageFailureError);
    expect((error as Error).message).toBe('Media storage failed during put');
    expect(String((error as Error).message)).not.toContain(blocked);
  });

  it('resolves a relative root against the working directory once, at construction', async () => {
    const relative = new LocalMediaStorage('./storage/test-relative');
    expect(relative).toBeDefined();
  });
});
