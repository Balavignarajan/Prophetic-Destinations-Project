import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../platform/public.decorator.js';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared-kernel/index.js';
import { AuthService } from '../application/auth.service.js';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from './allow-password-change-pending.decorator.js';
import { setRequestAdmin } from './request-admin.js';

/**
 * Registered globally: every route requires a valid access token unless it is
 * marked @Public(). On success the current admin is attached to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(req);
    if (!token) throw new UnauthorizedError('Authentication required');

    const admin = await this.auth.authenticate(token);
    if (admin.passwordChangeRequired) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenError(
          'You must change your password before you can continue',
          { reason: 'PASSWORD_CHANGE_REQUIRED' },
        );
      }
    }
    setRequestAdmin(req, admin);
    return true;
  }
}

function bearerToken(req: Request): string | undefined {
  const [scheme, token, ...rest] = (req.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && rest.length === 0
    ? token
    : undefined;
}
