import { parseConfig } from './app-config.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@host/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseConfig', () => {
  it('applies defaults', () => {
    expect(parseConfig(valid)).toEqual({
      nodeEnv: 'development',
      port: 3001,
      databaseUrl: valid.DATABASE_URL,
      corsOrigins: [],
      jwtAccessSecret: valid.JWT_ACCESS_SECRET,
      jwtAccessTtlSeconds: 900,
      refreshTokenTtlDays: 14,
      authRateLimit: 5,
      authRateWindowSeconds: 60,
      publicRateLimit: 120,
      publicRateWindowSeconds: 60,
      secureCookies: false,
      mediaStorageRoot: './storage/media',
      mediaMaxBytes: 5 * 1024 * 1024,
      mediaAllowedTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
  });

  it('parses and validates the media settings', () => {
    const config = parseConfig({
      ...valid,
      MEDIA_STORAGE_ROOT: ' /var/data/media ',
      MEDIA_MAX_BYTES: '1048576',
      MEDIA_ALLOWED_TYPES: 'IMAGE/PNG, application/pdf ,',
    });
    expect(config.mediaStorageRoot).toBe('/var/data/media');
    expect(config.mediaMaxBytes).toBe(1048576);
    expect(config.mediaAllowedTypes).toEqual(['image/png', 'application/pdf']);
    expect(() => parseConfig({ ...valid, MEDIA_MAX_BYTES: '0' })).toThrow(
      /MEDIA_MAX_BYTES/,
    );
    expect(() =>
      parseConfig({ ...valid, MEDIA_MAX_BYTES: String(101 * 1024 * 1024) }),
    ).toThrow(/100 MiB/);
    expect(() => parseConfig({ ...valid, MEDIA_ALLOWED_TYPES: ' , ' })).toThrow(
      /MEDIA_ALLOWED_TYPES/,
    );
  });

  it('parses port, environment and CORS origins', () => {
    const config = parseConfig({
      ...valid,
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: 'http://localhost:3000, https://admin.example.com ,',
    });
    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(8080);
    expect(config.corsOrigins).toEqual([
      'http://localhost:3000',
      'https://admin.example.com',
    ]);
  });

  it('requires DATABASE_URL', () => {
    expect(() =>
      parseConfig({ JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET }),
    ).toThrow(/DATABASE_URL is required/);
  });

  it('requires a long JWT secret', () => {
    expect(() =>
      parseConfig({
        DATABASE_URL: valid.DATABASE_URL,
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('marks cookies secure only in production', () => {
    expect(
      parseConfig({ ...valid, NODE_ENV: 'production' }).secureCookies,
    ).toBe(true);
  });

  it('rejects non-positive numeric settings', () => {
    expect(() => parseConfig({ ...valid, AUTH_RATE_LIMIT: '0' })).toThrow(
      /AUTH_RATE_LIMIT/,
    );
  });

  it('reads the public learner API rate limit', () => {
    expect(
      parseConfig({
        ...valid,
        PUBLIC_RATE_LIMIT: '30',
        PUBLIC_RATE_WINDOW_SECONDS: '10',
      }),
    ).toMatchObject({ publicRateLimit: 30, publicRateWindowSeconds: 10 });
  });

  it.each(['PUBLIC_RATE_LIMIT', 'PUBLIC_RATE_WINDOW_SECONDS'])(
    'rejects a non-positive %s',
    (name) => {
      expect(() => parseConfig({ ...valid, [name]: '0' })).toThrow(
        new RegExp(name),
      );
      expect(() => parseConfig({ ...valid, [name]: 'many' })).toThrow(
        new RegExp(name),
      );
    },
  );

  it('reports every problem at once', () => {
    expect(() =>
      parseConfig({
        DATABASE_URL: 'mysql://x',
        PORT: 'abc',
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });
});
