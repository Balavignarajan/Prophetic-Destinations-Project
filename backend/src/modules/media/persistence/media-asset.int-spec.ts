import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigModule } from '../../../config/index.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { newStorageKey } from '../domain/filename.js';
import { MediaModule } from '../media.module.js';
import { MediaAssetRepository } from './media-asset.repository.js';

// Integration: the media metadata table and repository against the real database (see .env).
// Rows carry a per-run prefix and are deleted afterwards.
const runId = randomUUID().slice(0, 8);
const EMAIL = `media-${runId}@int-test.invalid`;
const SHA = 'a'.repeat(64);

describe('media assets (integration)', () => {
  let dataSource: DataSource;
  let assets: MediaAssetRepository;
  let adminId: string;
  let closeModule: () => Promise<void>;

  const cleanup = async () => {
    await dataSource.query(
      `DELETE FROM "media_assets" WHERE "created_by" IN (SELECT "id" FROM "admins" WHERE "email" = $1)`,
      [EMAIL],
    );
    await dataSource.query(`DELETE FROM "admins" WHERE "email" = $1`, [EMAIL]);
  };

  const fresh = (overrides: Record<string, unknown> = {}) => ({
    storageKey: newStorageKey(),
    originalFilename: 'photo.png',
    contentType: 'image/png',
    sizeBytes: 1234,
    sha256: SHA,
    createdBy: adminId,
    ...overrides,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, MediaModule],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    assets = moduleRef.get(MediaAssetRepository, { strict: false });
    closeModule = () => moduleRef.close();
    await cleanup();
    const [admin] = await dataSource.query(
      `INSERT INTO "admins" ("email","password_hash","role") VALUES ($1,'not-a-real-hash','EDITOR') RETURNING "id"`,
      [EMAIL],
    );
    adminId = admin.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeModule();
  });

  it('stores and finds an asset, returning a plain domain object with a numeric size', async () => {
    const input = fresh();
    const saved = await assets.insert(input);
    expect(saved).toMatchObject({ ...input, sizeBytes: 1234 });
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(await assets.findById(saved.id)).toEqual(saved);
    expect(await assets.findById(randomUUID())).toBeNull();
  });

  it('stores sizes beyond 32 bits', async () => {
    const big = await assets.insert(fresh({ sizeBytes: 3_000_000_000 }));
    expect((await assets.findById(big.id))?.sizeBytes).toBe(3_000_000_000);
  });

  it('lists newest first with a total, and pages', async () => {
    const first = await assets.insert(fresh());
    const second = await assets.insert(fresh());
    const page = await assets.list(1000, 0);
    const mine = page.items.filter((a) => a.createdBy === adminId);
    expect(mine.map((a) => a.id).indexOf(second.id)).toBeLessThan(
      mine.map((a) => a.id).indexOf(first.id),
    );
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect((await assets.list(1, 0)).items).toHaveLength(1);
  });

  it('deletes and returns the row it removed; deleting again returns null', async () => {
    const saved = await assets.insert(fresh());
    const removed = await assets.delete(saved.id);
    expect(removed).toEqual(saved);
    expect(await assets.findById(saved.id)).toBeNull();
    expect(await assets.delete(saved.id)).toBeNull();
  });

  describe('database constraints', () => {
    it('rejects a duplicate storage key', async () => {
      const key = newStorageKey();
      await assets.insert(fresh({ storageKey: key }));
      await expect(
        assets.insert(fresh({ storageKey: key })),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('rejects a key that is not a generated one (traversal, wrong shape)', async () => {
      for (const storageKey of [
        '../etc/passwd',
        'aa/short',
        'AA/' + 'A'.repeat(32),
        '/abs',
      ]) {
        await expect(
          assets.insert(fresh({ storageKey })),
        ).rejects.toMatchObject({
          code: '23514',
        });
      }
    });

    it('rejects an empty size and a malformed hash', async () => {
      await expect(
        assets.insert(fresh({ sizeBytes: 0 })),
      ).rejects.toMatchObject({
        code: '23514',
      });
      await expect(
        assets.insert(fresh({ sha256: 'xyz' })),
      ).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('rejects an uploader that does not exist, and blocks deleting an admin who uploaded media (RESTRICT)', async () => {
      await expect(
        assets.insert(fresh({ createdBy: randomUUID() })),
      ).rejects.toMatchObject({
        code: '23503',
      });
      await assets.insert(fresh());
      await expect(
        dataSource.query(`DELETE FROM "admins" WHERE "id" = $1`, [adminId]),
      ).rejects.toMatchObject({ code: '23001' });
    });
  });
});
