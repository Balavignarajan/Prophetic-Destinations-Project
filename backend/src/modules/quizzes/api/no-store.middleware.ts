import type { NextFunction, Request, Response } from 'express';

/**
 * Starts every response of the public quiz routes as `Cache-Control: no-store`, so an error, a quiz that was just
 * unpublished, or a result is never kept by a browser, proxy or CDN.
 */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
