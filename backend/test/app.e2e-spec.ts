import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/platform/configure-app.js';

// Boots the real app (including the Neon connection from .env), configured
// exactly like main.ts. Read-only: no endpoint under test writes data.
describe('Application foundation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports liveness', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/db reports database connectivity', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/db')
      .expect(200);
    expect(res.body).toEqual({ database: 'connected' });
  });

  it('returns the standard error shape and a request id for unknown routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'test-request-1')
      .expect(404);

    expect(res.headers['x-request-id']).toBe('test-request-1');
    expect(res.body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      requestId: 'test-request-1',
    });
  });

  it('generates a request id when none is sent', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,}$/);
  });

  it('does not serve the health routes under the API prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(404);
  });
});
