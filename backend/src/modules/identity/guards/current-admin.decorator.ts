import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthorizedError } from '../../../shared-kernel/index.js';
import type { AuthenticatedAdmin } from '../domain/admin-account.js';
import { getRequestAdmin } from './request-admin.js';

/** Injects the authenticated admin into a controller parameter. Not usable on @Public() routes. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const admin = getRequestAdmin(context.switchToHttp().getRequest<Request>());
    if (!admin) throw new UnauthorizedError('Authentication required');
    return admin;
  },
);
