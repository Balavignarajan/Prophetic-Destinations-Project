import type { NextFunction, Request, Response } from 'express';

/** Every response of the public assessment routes starts as `Cache-Control: no-store`: an unpublished assessment or a result is never kept by a cache. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
