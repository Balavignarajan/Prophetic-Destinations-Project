export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  /** Login/refresh attempts allowed per client IP within the window. */
  authRateLimit: number;
  authRateWindowSeconds: number;
  /** Cookies get the Secure flag in production only (local dev runs on http). */
  secureCookies: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const NODE_ENVS = ['development', 'test', 'production'] as const;

/**
 * Validates raw environment variables and returns typed config.
 * Collects every problem so a misconfigured deploy fails once, with a full list.
 */
export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const problems: string[] = [];

  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  if (!NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) {
    problems.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must be a postgres:// or postgresql:// URL');
  }

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const jwtAccessSecret = env.JWT_ACCESS_SECRET ?? '';
  if (jwtAccessSecret.length < 32) {
    problems.push(
      'JWT_ACCESS_SECRET is required and must be at least 32 characters',
    );
  }

  const jwtAccessTtlSeconds = positiveInt(
    env,
    'JWT_ACCESS_TTL_SECONDS',
    900,
    problems,
  );
  const refreshTokenTtlDays = positiveInt(
    env,
    'REFRESH_TOKEN_TTL_DAYS',
    14,
    problems,
  );
  const authRateLimit = positiveInt(env, 'AUTH_RATE_LIMIT', 5, problems);
  const authRateWindowSeconds = positiveInt(
    env,
    'AUTH_RATE_WINDOW_SECONDS',
    60,
    problems,
  );

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${problems.join('\n- ')}`,
    );
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    corsOrigins,
    jwtAccessSecret,
    jwtAccessTtlSeconds,
    refreshTokenTtlDays,
    authRateLimit,
    authRateWindowSeconds,
    secureCookies: nodeEnv === 'production',
  };
}

function positiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  problems: string[],
): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    problems.push(`${name} must be a positive integer`);
  }
  return value;
}
