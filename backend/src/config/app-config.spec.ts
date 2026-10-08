import { parseConfig } from './app-config.js';

const valid = { DATABASE_URL: 'postgresql://user:pass@host/db' };

describe('parseConfig', () => {
  it('applies defaults', () => {
    expect(parseConfig(valid)).toEqual({
      nodeEnv: 'development',
      port: 3001,
      databaseUrl: valid.DATABASE_URL,
      corsOrigins: [],
    });
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
    expect(() => parseConfig({})).toThrow(/DATABASE_URL is required/);
  });

  it('reports every problem at once', () => {
    expect(() =>
      parseConfig({
        DATABASE_URL: 'mysql://x',
        PORT: 'abc',
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL/);
  });
});
