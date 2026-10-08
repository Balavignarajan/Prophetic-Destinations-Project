import type { Request } from 'express';
import type { AuthenticatedAdmin } from '../domain/admin-account.js';

const REQUEST_ADMIN_KEY = Symbol('authenticatedAdmin');

type RequestWithAdmin = Request & { [REQUEST_ADMIN_KEY]?: AuthenticatedAdmin };

/** The authenticated admin travels on the request under a private key, not as a raw JWT payload. */
export function setRequestAdmin(req: Request, admin: AuthenticatedAdmin): void {
  (req as RequestWithAdmin)[REQUEST_ADMIN_KEY] = admin;
}

export function getRequestAdmin(req: Request): AuthenticatedAdmin | undefined {
  return (req as RequestWithAdmin)[REQUEST_ADMIN_KEY];
}
