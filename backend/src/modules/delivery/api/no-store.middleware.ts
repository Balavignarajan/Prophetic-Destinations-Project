import type { NextFunction, Request, Response } from 'express';

/**
 * Starts every response of the public lesson route as `Cache-Control: no-store`, before any guard,
 * pipe or handler runs. Only a successful lesson (or its 304) replaces it with the revalidation
 * policy, so errors (400 validation, 404, 429, 500) can never be cached by a browser, proxy or CDN.
 */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
