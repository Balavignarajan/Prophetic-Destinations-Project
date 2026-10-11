import { Readable } from 'node:stream';
import {
  BusinessRuleError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import type { StoredMediaAsset } from '../domain/models.js';
import type {
  MediaAssetRepository,
  NewMediaAsset,
} from '../persistence/media-asset.repository.js';
import { GIF, HTML, JPEG, PDF, PNG, SVG } from '../test-files.js';
import {
  type MediaStorage,
  StorageFailureError,
  StoredObjectNotFoundError,
} from '../storage/media-storage.js';
import { buildMediaSettings } from './media-settings.js';
import { MediaService } from './media.service.js';

class FakeStorage implements MediaStorage {
  objects = new Map<string, Buffer>();
  failNextPut = false;
  failNextDelete = false;
  calls: string[] = [];
  async put(key: string, data: Buffer) {
    this.calls.push(`put ${key}`);
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new StorageFailureError('put');
    }
    this.objects.set(key, data);
  }
  async open(key: string) {
    const data = this.objects.get(key);
    if (!data) throw new StoredObjectNotFoundError();
    return Readable.from([data]);
  }
  async delete(key: string) {
    this.calls.push(`delete ${key}`);
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new StorageFailureError('delete');
    }
    this.objects.delete(key);
  }
}

class FakeAssets {
  rows = new Map<string, StoredMediaAsset>();
  failNextInsert = false;
  async insert(asset: NewMediaAsset): Promise<StoredMediaAsset> {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error('database unavailable');
    }
    const row: StoredMediaAsset = {
      ...asset,
      id: `00000000-0000-4000-8000-${String(this.rows.size + 1).padStart(12, '0')}`,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async list() {
    return { items: [...this.rows.values()], total: this.rows.size };
  }
  async delete(id: string) {
    const row = this.rows.get(id) ?? null;
    this.rows.delete(id);
    return row;
  }
}

function setup(overrides: { maxBytes?: number; allowed?: string[] } = {}) {
  const storage = new FakeStorage();
  const assets = new FakeAssets();
  const service = new MediaService(
    assets as unknown as MediaAssetRepository,
    storage,
    buildMediaSettings({
      mediaMaxBytes: overrides.maxBytes ?? 1024,
      mediaAllowedTypes: overrides.allowed ?? [
        'image/png',
        'image/jpeg',
        'image/webp',
      ],
    }),
  );
  return { storage, assets, service };
}

const admin = 'admin-1';
const file = (buffer: Buffer, originalname = 'photo.png') => ({
  buffer,
  originalname,
});

describe('MediaService.upload', () => {
  it('stores the bytes and the metadata, deciding the type from the bytes', async () => {
    const { service, storage, assets } = setup();
    const asset = await service.upload(admin, file(JPEG, 'looks-like.png'));
    expect(asset).toMatchObject({
      originalFilename: 'looks-like.png',
      contentType: 'image/jpeg', // the bytes, not the name
      sizeBytes: JPEG.length,
      createdBy: admin,
    });
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(asset)).not.toContain('storageKey');
    const [row] = [...assets.rows.values()];
    expect(storage.objects.get(row.storageKey)).toEqual(JPEG);
  });

  it('sanitises the display name and never uses it as a key', async () => {
    const { service, storage } = setup();
    const asset = await service.upload(
      admin,
      file(PNG, '../../etc/passwd.png'),
    );
    expect(asset.originalFilename).toBe('passwd.png');
    expect(
      [...storage.objects.keys()].every((k) =>
        /^[0-9a-f]{2}\/[0-9a-f]{32}$/.test(k),
      ),
    ).toBe(true);
  });

  it('refuses a missing, empty or oversized file without storing anything', async () => {
    const { service, storage, assets } = setup({ maxBytes: PNG.length });
    await expect(service.upload(admin, undefined)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(
      service.upload(admin, file(Buffer.alloc(0))),
    ).rejects.toMatchObject({
      details: { code: 'EMPTY_FILE' },
    });
    await expect(
      service.upload(admin, file(Buffer.concat([PNG, Buffer.from('x')]))),
    ).rejects.toMatchObject({ details: { code: 'FILE_TOO_LARGE' } });
    await expect(service.upload(admin, file(PNG))).resolves.toBeDefined(); // exactly at the limit is fine
    expect(storage.objects.size).toBe(1);
    expect(assets.rows.size).toBe(1);
  });

  it('refuses unsupported or disallowed types whatever the file is called', async () => {
    const { service, storage } = setup();
    for (const bytes of [SVG, HTML, PDF, GIF, Buffer.from('plain text')]) {
      await expect(
        service.upload(admin, file(bytes, 'photo.png')),
      ).rejects.toMatchObject({
        details: { code: 'UNSUPPORTED_TYPE' },
      });
    }
    expect(storage.objects.size).toBe(0);
    // a type becomes acceptable only when configured
    const wider = setup({ allowed: ['image/png', 'application/pdf'] });
    await expect(
      wider.service.upload(admin, file(PDF, 'doc.pdf')),
    ).resolves.toMatchObject({
      contentType: 'application/pdf',
    });
  });

  it('writes nothing to the database when the file cannot be stored', async () => {
    const { service, storage, assets } = setup();
    storage.failNextPut = true;
    await expect(service.upload(admin, file(PNG))).rejects.toBeInstanceOf(
      StorageFailureError,
    );
    expect(assets.rows.size).toBe(0);
  });

  it('removes the stored file again when the database row cannot be saved', async () => {
    const { service, storage, assets } = setup();
    assets.failNextInsert = true;
    await expect(service.upload(admin, file(PNG))).rejects.toThrow(
      'database unavailable',
    );
    expect(storage.objects.size).toBe(0);
    expect(storage.calls.map((c) => c.split(' ')[0])).toEqual([
      'put',
      'delete',
    ]);
  });

  it('still reports the database error when the clean-up also fails', async () => {
    const { service, storage, assets } = setup();
    assets.failNextInsert = true;
    storage.failNextDelete = true;
    await expect(service.upload(admin, file(PNG))).rejects.toThrow(
      'database unavailable',
    );
  });
});

describe('MediaService reads and deletes', () => {
  it('returns metadata, lists, and streams the stored bytes with the detected type', async () => {
    const { service } = setup();
    const a = await service.upload(admin, file(PNG));
    expect(await service.get(a.id)).toEqual(a);
    expect((await service.list(10, 0)).total).toBe(1);
    const content = await service.openContent(a.id);
    expect(content.inline).toBe(true);
    const chunks: Buffer[] = [];
    for await (const chunk of content.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(PNG);
  });

  it('answers 404 for an unknown id', async () => {
    const { service } = setup();
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.openContent('missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.delete('missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('answers 404 (not a crash) when the file behind an existing row is gone', async () => {
    const { service, storage, assets } = setup();
    const a = await service.upload(admin, file(PNG));
    storage.objects.clear();
    expect(assets.rows.size).toBe(1);
    await expect(service.openContent(a.id)).rejects.toThrow('missing');
    await expect(service.get(a.id)).resolves.toBeDefined(); // the metadata is still there
  });

  it('delete removes the row first and then the file, and a second delete is a 404', async () => {
    const { service, storage, assets } = setup();
    const a = await service.upload(admin, file(PNG));
    await service.delete(a.id);
    expect(assets.rows.size).toBe(0);
    expect(storage.objects.size).toBe(0);
    expect(storage.calls.at(-1)?.startsWith('delete')).toBe(true);
    await expect(service.delete(a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('delete still succeeds when the file cannot be removed (the row is gone, the orphan is logged)', async () => {
    const { service, storage, assets } = setup();
    const a = await service.upload(admin, file(PNG));
    storage.failNextDelete = true;
    await expect(service.delete(a.id)).resolves.toBeUndefined();
    expect(assets.rows.size).toBe(0);
  });
});

describe('buildMediaSettings', () => {
  it('refuses to start with a type it cannot verify', () => {
    expect(() =>
      buildMediaSettings({
        mediaMaxBytes: 1,
        mediaAllowedTypes: ['image/svg+xml'],
      }),
    ).toThrow(/cannot verify: image\/svg\+xml/);
    expect(() =>
      buildMediaSettings({
        mediaMaxBytes: 1,
        mediaAllowedTypes: ['video/mp4'],
      }),
    ).toThrow(/video\/mp4/);
  });
});
