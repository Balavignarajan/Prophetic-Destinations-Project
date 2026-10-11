import type { Response } from 'express';

/**
 * Freshness policy of a published representation: it MAY be stored by a cache but must be revalidated
 * (with the ETag) before every reuse. Published representations are cheap to revalidate (a bodiless 304),
 * and a withdrawn one stops being served on the very next request instead of lingering for a freshness
 * lifetime. Errors are `no-store` (see no-store.middleware.ts).
 */
export const PUBLISHED_CACHE_CONTROL = 'public, no-cache';

/** Sets the validators on a successful representation and returns its body (or nothing for a 304). */
export function respond<T>(
  res: Response,
  result:
    | { kind: 'NOT_MODIFIED'; etag: string }
    | { kind: 'OK'; etag: string; body: T },
): T | undefined {
  res.setHeader('ETag', result.etag);
  res.setHeader('Cache-Control', PUBLISHED_CACHE_CONTROL);
  if (result.kind === 'NOT_MODIFIED') {
    res.status(304);
    return undefined;
  }
  return result.body;
}
