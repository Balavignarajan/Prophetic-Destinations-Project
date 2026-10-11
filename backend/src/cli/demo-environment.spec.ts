import {
  demoEnvironmentProblem,
  loginFailureHint,
} from './demo-environment.js';

describe('demoEnvironmentProblem', () => {
  const local = 'http://localhost:3001/api/v1';

  it('allows a local server in a development environment', () => {
    expect(demoEnvironmentProblem({}, local)).toBeNull();
    expect(
      demoEnvironmentProblem({ NODE_ENV: 'development' }, local),
    ).toBeNull();
    expect(
      demoEnvironmentProblem({}, 'http://127.0.0.1:3001/api/v1'),
    ).toBeNull();
    expect(demoEnvironmentProblem({}, 'http://[::1]:3001/api/v1')).toBeNull();
  });

  it('refuses production unless it is explicitly allowed', () => {
    expect(demoEnvironmentProblem({ NODE_ENV: 'production' }, local)).toMatch(
      /production/,
    );
    expect(
      demoEnvironmentProblem(
        { NODE_ENV: 'production', DEMO_ALLOW_PRODUCTION: 'true' },
        local,
      ),
    ).toBeNull();
    expect(
      demoEnvironmentProblem(
        { NODE_ENV: 'production', DEMO_ALLOW_PRODUCTION: 'yes' },
        local,
      ),
    ).toMatch(/production/);
  });

  it('refuses a server that is not on this machine unless that is explicitly allowed', () => {
    const remote = 'https://api.example.org/api/v1';
    expect(demoEnvironmentProblem({}, remote)).toMatch(/api\.example\.org/);
    expect(
      demoEnvironmentProblem({ DEMO_ALLOW_REMOTE: 'true' }, remote),
    ).toBeNull();
    // looks local but is not
    expect(
      demoEnvironmentProblem({}, 'http://localhost.evil.example/api'),
    ).toMatch(/not at this machine/);
  });

  it('rejects a malformed URL', () => {
    expect(demoEnvironmentProblem({}, 'not a url')).toMatch(/not a valid URL/);
  });
});

describe('loginFailureHint', () => {
  it('points at the cause without echoing credentials', () => {
    expect(
      loginFailureHint(
        new Error(
          'POST /admin/auth/login -> 401 UNAUTHORIZED Authentication failed',
        ),
      ),
    ).toMatch(/seed:admin/);
    expect(
      loginFailureHint(new Error('POST /admin/auth/login -> 429')),
    ).toMatch(/rate limited/);
    expect(loginFailureHint(new TypeError('fetch failed'))).toMatch(
      /start:dev/,
    );
    expect(loginFailureHint(new Error('boom'))).toBe('Sign-in failed: boom');
  });
});
