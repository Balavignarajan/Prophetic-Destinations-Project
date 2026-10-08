import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/platform/configure-app.js';

describe('Login rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '3';
    process.env.AUTH_RATE_WINDOW_SECONDS = '60';

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

  it('blocks repeated login attempts with 429 in the standard error shape, and does not throttle other routes', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/v1/admin/auth/login').send({
        email: 'nobody@throttle-test.invalid',
        password: 'whatever-password',
      });

    for (let i = 0; i < 3; i++) await attempt().expect(401);

    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      requestId: expect.any(String),
    });

    // Health and the authenticated routes are not affected by the login limiter.
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/api/v1/admin/auth/me').expect(401);
  });
});
