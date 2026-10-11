import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/platform/configure-app.js';

// The rate limiter keys on the connection's own address. Forwarded-address headers sent by a client are
// NOT trusted (Express `trust proxy` is off), so a client cannot dodge the limit by inventing them.
// Trusting a proxy is a deployment decision made explicitly (see docs/architecture.md), not a default.

describe('Public lesson delivery rate limit and forwarded headers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PUBLIC_RATE_LIMIT = '3';
    process.env.PUBLIC_RATE_WINDOW_SECONDS = '60';

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

  it('does not trust proxy headers by default', () => {
    const express = app.getHttpAdapter().getInstance() as {
      get: (name: string) => unknown;
    };
    expect(express.get('trust proxy')).toBeFalsy();
  });

  it('counts requests per connection address whatever forwarded-address headers claim', async () => {
    const attempt = (n: number) =>
      request(app.getHttpServer())
        .get(`/api/v1/lessons/${randomUUID()}?level=BEGINNER`)
        // every request claims to come from a different client, in every common header form
        .set('X-Forwarded-For', `203.0.113.${n}, 198.51.100.${n}`)
        .set('X-Real-IP', `192.0.2.${n}`)
        .set('Forwarded', `for=203.0.113.${n};proto=https`)
        .set('X-Client-IP', `10.0.0.${n}`);

    for (let n = 1; n <= 3; n += 1) await attempt(n).expect(404);

    const blocked = await attempt(4).expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });
    await attempt(5).expect(429);
  });
});
