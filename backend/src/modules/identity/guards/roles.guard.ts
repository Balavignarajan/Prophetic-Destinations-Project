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
import { type Role, isRoleAllowed } from '../domain/role.js';
import { ROLES_KEY } from './roles.decorator.js';
import { getRequestAdmin } from './request-admin.js';

/**
 * Checks the fixed role against @Roles(). Contains no business rules: rules like
 * "reviewers cannot approve their own work" belong to the modules that own them.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      )
    ) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (!allowed || allowed.length === 0) return true;

    const admin = getRequestAdmin(context.switchToHttp().getRequest<Request>());
    if (!admin) throw new UnauthorizedError('Authentication required');
    if (!isRoleAllowed(admin.role, allowed)) {
      throw new ForbiddenError('You do not have permission to do this');
    }
    return true;
  }
}
