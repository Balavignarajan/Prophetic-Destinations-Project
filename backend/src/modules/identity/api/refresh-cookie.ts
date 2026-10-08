import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'pd_refresh';

/** The cookie is only sent to the auth endpoints, never to the rest of the API. */
const COOKIE_PATH = '/api/v1/admin/auth';

function baseOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  rawToken: string,
  expiresAt: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE, rawToken, {
    ...baseOptions(secure),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
