/**
 * Safety checks for `npm run seed:demo`, kept apart from the command so they can be unit-tested.
 *
 * The demo command signs in as an ADMIN and publishes synthetic `[DEMO]` content into the real catalog of whatever
 * server it points at. That is exactly what a demo needs and exactly what must never happen to a real deployment by
 * accident, so the command refuses to run against a production-mode environment or a non-local server unless that
 * was asked for explicitly.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Why the demo command must not run with this environment and target, or null if it may. */
export function demoEnvironmentProblem(
  env: Readonly<Record<string, string | undefined>>,
  apiUrl: string,
): string | null {
  let host: string;
  try {
    host = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    return `DEMO_API_URL is not a valid URL: ${apiUrl}`;
  }
  if (env.NODE_ENV === 'production' && env.DEMO_ALLOW_PRODUCTION !== 'true') {
    return 'NODE_ENV is "production": the demo content would be published into the live catalog. Set DEMO_ALLOW_PRODUCTION=true only if that is really intended.';
  }
  if (!LOCAL_HOSTS.has(host) && env.DEMO_ALLOW_REMOTE !== 'true') {
    return `DEMO_API_URL points at "${host}", not at this machine. Set DEMO_ALLOW_REMOTE=true to seed the demo content into that server on purpose.`;
  }
  return null;
}

/** A hint for the person running the command, from what went wrong while signing in. Never includes credentials. */
export function loginFailureHint(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/-> 401/.test(message)) {
    return 'Sign-in was refused. SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD must belong to an existing, active ADMIN account. Run `npm run seed:admin` first; it never changes the password of an account that already exists.';
  }
  if (/-> 429/.test(message)) {
    return 'Sign-in is rate limited. Wait a minute and run the command again.';
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return 'The server could not be reached. Start it first (`npm run start:dev`) and check DEMO_API_URL.';
  }
  return `Sign-in failed: ${message}`;
}
