import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/platform/configure-app.js';

// The public learner route is rate limited per client IP by its own limiter. No lesson data is needed:
// the limiter runs before the route does anything, so requests that end in 400 or 404 count the same.

describe('Public lesson delivery rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PUBLIC_RATE_LIMIT = '4';
    process.env.PUBLIC_RATE_WINDOW_SECONDS = '60';
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

  const lesson = (id: string, query = '?level=BEGINNER') =>
    request(app.getHttpServer()).get(`/api/v1/lessons/${id}${query}`);

  it('blocks the request after the configured number with 429 in the standard error shape', async () => {
    // four allowed requests, whatever their outcome: a miss, a bad id, a missing level, an unknown lesson
    await lesson(randomUUID()).expect(404);
    await lesson('not-a-uuid').expect(400);
    await lesson(randomUUID(), '').expect(400);
    await lesson(randomUUID()).expect(404);

    const blocked = await lesson(randomUUID()).expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      requestId: expect.any(String),
    });
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.headers['cache-control']).toBe('no-store');
    // the project's standard body (the same one login returns); no stack trace or internals
    expect(Object.keys(blocked.body).sort()).toEqual([
      'code',
      'message',
      'requestId',
      'statusCode',
    ]);
    expect(blocked.text).not.toMatch(/stack|at \S+\.(ts|js)|node_modules/);

    // it stays blocked for the rest of the window, for any lesson and level
    await lesson(randomUUID(), '?level=ADVANCED').expect(429);
    await lesson('not-a-uuid').expect(429);
  });

  it('is its own limiter: it does not affect login, other routes or health, nor does login use up its allowance', async () => {
    // (the public limiter is already exhausted by the previous test in this file)
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/api/v1/admin/auth/me').expect(401);

    const login = () =>
      request(app.getHttpServer()).post('/api/v1/admin/auth/login').send({
        email: 'nobody@throttle-test.invalid',
        password: 'whatever-password',
      });
    for (let i = 0; i < 3; i += 1) await login().expect(401);
    await login().expect(429); // the login limiter is counted separately, and has its own limit (3)
  });

  it('applies to anonymous and authenticated callers alike (it is not bypassed by sending credentials)', async () => {
    await lesson(randomUUID())
      .set('Authorization', 'Bearer not-a-token')
      .expect(429);
  });
});
