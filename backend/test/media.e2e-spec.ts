import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AdminProvisioningService } from './../src/modules/identity/application/admin-provisioning.service.js';
import { Role } from './../src/modules/identity/index.js';
import {
  HTML,
  JPEG,
  PDF,
  PNG,
  SVG,
} from './../src/modules/media/test-files.js';
import { configureApp } from './../src/platform/configure-app.js';

// The admin media library over HTTP: who may do what, what is accepted, what is never exposed, and how a missing
// file or a repeated delete behaves. Storage is a temporary directory and the size limit is small.

const PASSWORD = 'e2e-test-password-123';
const runId = randomUUID().slice(0, 8);
const EMAIL_SUFFIX = '@e2e-test.invalid';
const emailFor = (name: string) => `e2e-media-${runId}-${name}${EMAIL_SUFFIX}`;
const API = '/api/v1';
const MEDIA = `${API}/admin/media`;
const MAX_BYTES = 2048;
const MISSING = '3f1b8b6e-7c1d-4a52-9d2e-0a1b2c3d4e5f';

describe('Admin media library (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storageRoot: string;
  const tokens: Record<string, string> = {};
  const adminIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (role: Role) => `Bearer ${tokens[role]}`;

  const upload = (
    role: Role,
    bytes: Buffer,
    filename = 'photo.png',
    contentType = 'image/png',
  ) =>
    http()
      .post(MEDIA)
      .set('Authorization', as(role))
      .attach('file', bytes, { filename, contentType });

  const storedFiles = async (): Promise<string[]> => {
    const found: string[] = [];
    if (!existsSync(storageRoot)) return found;
    for (const shard of await readdir(storageRoot)) {
      if (shard === '.tmp') continue;
      for (const name of await readdir(join(storageRoot, shard))) {
        found.push(`${shard}/${name}`);
      }
    }
    return found;
  };
  const mediaRows = async () =>
    (
      await dataSource.query(
        `SELECT count(*)::int AS "n" FROM "media_assets" WHERE "created_by" = ANY($1::uuid[])`,
        [adminIds],
      )
    )[0].n as number;
  const storageKeyOf = async (id: string) =>
    (
      await dataSource.query(
        `SELECT "storage_key" FROM "media_assets" WHERE "id" = $1`,
        [id],
      )
    )[0]?.storage_key as string | undefined;

  const cleanup = async () => {
    await dataSource.query(
      `DELETE FROM "media_assets" WHERE "created_by" IN (SELECT "id" FROM "admins" WHERE "email" LIKE $1)`,
      [`e2e-media-${runId}-%${EMAIL_SUFFIX}`],
    );
    await dataSource.query(`DELETE FROM "admins" WHERE "email" LIKE $1`, [
      `e2e-media-${runId}-%${EMAIL_SUFFIX}`,
    ]);
  };

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'pd-media-e2e-'));
    process.env.MEDIA_STORAGE_ROOT = storageRoot;
    process.env.MEDIA_MAX_BYTES = String(MAX_BYTES);
    delete process.env.MEDIA_ALLOWED_TYPES; // the conservative default: png, jpeg, webp
    process.env.AUTH_RATE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    await cleanup();
    for (const role of [Role.ADMIN, Role.EDITOR, Role.REVIEWER]) {
      const created = await app.get(AdminProvisioningService).create({
        email: emailFor(role),
        password: PASSWORD,
        role,
      });
      adminIds.push((created as { id: string }).id);
      const res = await http()
        .post(`${API}/admin/auth/login`)
        .send({ email: emailFor(role), password: PASSWORD })
        .expect(200);
      tokens[role] = res.body.accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  describe('who may do what', () => {
    it('requires authentication on every route', async () => {
      await http().post(MEDIA).attach('file', PNG, 'a.png').expect(401);
      await http().get(MEDIA).expect(401);
      await http().get(`${MEDIA}/${MISSING}`).expect(401);
      await http().get(`${MEDIA}/${MISSING}/content`).expect(401);
      await http().delete(`${MEDIA}/${MISSING}`).expect(401);
    });

    it('lets ADMIN and EDITOR upload and delete, and REVIEWER only read', async () => {
      const byAdmin = await upload(Role.ADMIN, PNG).expect(201);
      const byEditor = await upload(
        Role.EDITOR,
        JPEG,
        'b.jpg',
        'image/jpeg',
      ).expect(201);
      await upload(Role.REVIEWER, PNG).expect(403);
      await http()
        .delete(`${MEDIA}/${byAdmin.body.id}`)
        .set('Authorization', as(Role.REVIEWER))
        .expect(403);

      for (const path of [
        '',
        `/${byAdmin.body.id}`,
        `/${byAdmin.body.id}/content`,
      ]) {
        await http()
          .get(`${MEDIA}${path}`)
          .set('Authorization', as(Role.REVIEWER))
          .expect(200);
      }
      await http()
        .delete(`${MEDIA}/${byAdmin.body.id}`)
        .set('Authorization', as(Role.EDITOR))
        .expect(204);
      await http()
        .delete(`${MEDIA}/${byEditor.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });

    it('is not available to anonymous visitors in any form', async () => {
      const made = await upload(Role.ADMIN, PNG).expect(201);
      await http().get(`${API}/media/${made.body.id}`).expect(404);
      await http().get(`${API}/media/${made.body.id}/content`).expect(404);
      await http().get(`${MEDIA}/${made.body.id}/content`).expect(401);
      await http()
        .delete(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });
  });

  describe('uploading', () => {
    it('stores the file and returns metadata without any storage key or path', async () => {
      const res = await upload(Role.EDITOR, PNG, 'Holy Land.png').expect(201);
      expect(Object.keys(res.body).sort((a, b) => a.localeCompare(b))).toEqual([
        'contentType',
        'createdAt',
        'createdBy',
        'id',
        'originalFilename',
        'sha256',
        'sizeBytes',
      ]);
      expect(res.body).toMatchObject({
        originalFilename: 'Holy Land.png',
        contentType: 'image/png',
        sizeBytes: PNG.length,
        createdBy: adminIds[1],
      });
      expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(res.body)).not.toContain(storageRoot);
      expect(JSON.stringify(res.body)).not.toMatch(/storage|path/i);
      expect(res.headers['cache-control']).toBe('no-store');

      // the file is on disk under a server-generated key, inside the storage root
      const key = await storageKeyOf(res.body.id);
      expect(key).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{32}$/);
      expect((await stat(join(storageRoot, key!))).size).toBe(PNG.length);
    });

    it('never uses the client file name as a path', async () => {
      const before = await storedFiles();
      const res = await upload(Role.ADMIN, PNG, '../../../evil.png').expect(
        201,
      );
      expect(res.body.originalFilename).toBe('evil.png');
      const after = await storedFiles();
      expect(after).toHaveLength(before.length + 1);
      expect(
        after.every((file) => /^[0-9a-f]{2}\/[0-9a-f]{32}$/.test(file)),
      ).toBe(true);
      expect(existsSync(join(storageRoot, '..', 'evil.png'))).toBe(false);
      await http()
        .delete(`${MEDIA}/${res.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });

    it('decides the type from the bytes: a script called .png, an SVG or a PDF is refused by default', async () => {
      const files = await storedFiles();
      const rows = await mediaRows();
      for (const [bytes, name, claimed] of [
        [HTML, 'photo.png', 'image/png'],
        [SVG, 'logo.svg', 'image/svg+xml'],
        [SVG, 'logo.png', 'image/png'],
        [PDF, 'doc.pdf', 'application/pdf'],
        [Buffer.from('just text'), 'notes.jpg', 'image/jpeg'],
      ] as const) {
        const res = await upload(
          Role.ADMIN,
          Buffer.from(bytes),
          name,
          claimed,
        ).expect(422);
        expect(res.body.details.code).toBe('UNSUPPORTED_TYPE');
      }
      expect(await storedFiles()).toEqual(files);
      expect(await mediaRows()).toBe(rows);
    });

    it('records the real type even when the client lies about it', async () => {
      const res = await upload(Role.ADMIN, JPEG, 'x.png', 'image/png').expect(
        201,
      );
      expect(res.body.contentType).toBe('image/jpeg');
      await http()
        .delete(`${MEDIA}/${res.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });

    it('enforces the size limit with 413 and stores nothing', async () => {
      const files = await storedFiles();
      const rows = await mediaRows();
      const tooBig = Buffer.concat([PNG, Buffer.alloc(MAX_BYTES)]);
      await upload(Role.ADMIN, tooBig).expect(413);
      // exactly at the limit is fine
      const atLimit = Buffer.concat([
        PNG,
        Buffer.alloc(MAX_BYTES - PNG.length, 1),
      ]);
      const ok = await upload(Role.ADMIN, atLimit).expect(201);
      expect(ok.body.sizeBytes).toBe(MAX_BYTES);
      await http()
        .delete(`${MEDIA}/${ok.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
      expect(await storedFiles()).toEqual(files);
      expect(await mediaRows()).toBe(rows);
    });

    it('rejects an empty file, a missing file, the wrong field name and several files', async () => {
      await upload(Role.ADMIN, Buffer.alloc(0)).expect(422);
      await http()
        .post(MEDIA)
        .set('Authorization', as(Role.ADMIN))
        .send({ file: 'text' })
        .expect(422);
      await http()
        .post(MEDIA)
        .set('Authorization', as(Role.ADMIN))
        .field('note', 'x')
        .expect(400);
      await http()
        .post(MEDIA)
        .set('Authorization', as(Role.ADMIN))
        .attach('image', PNG, 'a.png')
        .expect(400);
      await http()
        .post(MEDIA)
        .set('Authorization', as(Role.ADMIN))
        .attach('file', PNG, 'a.png')
        .attach('file', PNG, 'b.png')
        .expect(400);
    });
  });

  describe('reading', () => {
    it('lists, shows metadata, and streams the exact bytes with safe headers', async () => {
      const made = await upload(Role.ADMIN, PNG, 'map.png').expect(201);
      const list = await http()
        .get(`${MEDIA}?limit=100`)
        .set('Authorization', as(Role.EDITOR))
        .expect(200);
      expect(list.body.items.map((a: { id: string }) => a.id)).toContain(
        made.body.id,
      );
      expect(JSON.stringify(list.body)).not.toMatch(/storage|path/i);
      await http()
        .get(`${MEDIA}?limit=0`)
        .set('Authorization', as(Role.ADMIN))
        .expect(400);

      const one = await http()
        .get(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.EDITOR))
        .expect(200);
      expect(one.body).toEqual(made.body);

      const content = await http()
        .get(`${MEDIA}/${made.body.id}/content`)
        .set('Authorization', as(Role.REVIEWER))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.from(content.body)).toEqual(PNG);
      expect(content.headers['content-type']).toBe('image/png');
      expect(content.headers['content-length']).toBe(String(PNG.length));
      expect(content.headers['content-disposition']).toBe('inline');
      expect(content.headers['x-content-type-options']).toBe('nosniff');
      expect(content.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(content.headers['cache-control']).toBe('private, no-store');
      await http()
        .delete(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
    });

    it('validates ids and answers 404 for unknown media', async () => {
      const admin = as(Role.ADMIN);
      await http()
        .get(`${MEDIA}/not-a-uuid`)
        .set('Authorization', admin)
        .expect(400);
      await http()
        .get(`${MEDIA}/${MISSING}`)
        .set('Authorization', admin)
        .expect(404);
      await http()
        .get(`${MEDIA}/${MISSING}/content`)
        .set('Authorization', admin)
        .expect(404);
      await http()
        .delete(`${MEDIA}/${MISSING}`)
        .set('Authorization', admin)
        .expect(404);
    });

    it('reports a missing stored file as 404 while the metadata is still available', async () => {
      const made = await upload(Role.ADMIN, PNG).expect(201);
      const key = (await storageKeyOf(made.body.id))!;
      await rm(join(storageRoot, key));
      const res = await http()
        .get(`${MEDIA}/${made.body.id}/content`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      expect(JSON.stringify(res.body)).not.toContain(storageRoot);
      await http()
        .get(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(200);
      // deleting it anyway still works, and a second delete is a 404
      await http()
        .delete(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(204);
      await http()
        .delete(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
    });
  });

  describe('deleting', () => {
    it('removes the row and the file, and repeating it is a 404', async () => {
      const made = await upload(Role.ADMIN, PNG).expect(201);
      const key = (await storageKeyOf(made.body.id))!;
      expect(existsSync(join(storageRoot, key))).toBe(true);
      await http()
        .delete(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.EDITOR))
        .expect(204);
      expect(existsSync(join(storageRoot, key))).toBe(false);
      expect(await storageKeyOf(made.body.id)).toBeUndefined();
      await http()
        .get(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.ADMIN))
        .expect(404);
      await http()
        .delete(`${MEDIA}/${made.body.id}`)
        .set('Authorization', as(Role.EDITOR))
        .expect(404);
    });
  });
});
