import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../platform/public.decorator.js';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared-kernel/index.js';
import type { AuthService } from '../application/auth.service.js';
import { Role } from '../domain/role.js';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from './allow-password-change-pending.decorator.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { getRequestAdmin, setRequestAdmin } from './request-admin.js';
import { ROLES_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

type Metadata = { isPublic?: boolean; roles?: Role[] };

/** Builds an ExecutionContext whose handler/class carry the given metadata. */
function contextFor(
  metadata: Metadata,
  req: Record<string, unknown> = { headers: {} },
) {
  const handler = () => undefined;
  class Controller {}
  if (metadata.isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  if (metadata.roles)
    Reflect.defineMetadata(ROLES_KEY, metadata.roles, handler);
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

const admin = { id: 'a1', email: 'a@b.co', role: Role.EDITOR };

describe('JwtAuthGuard', () => {
  const authenticate = vi.fn();
  const guard = new JwtAuthGuard(new Reflector(), {
    authenticate,
  } as unknown as AuthService);

  beforeEach(() => {
    authenticate.mockReset();
  });

  it('lets @Public() routes through without looking at credentials', async () => {
    const { context } = contextFor({ isPublic: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('denies by default when there is no token', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it.each(['Basic abc', 'Bearer', 'Bearer a b', 'abc', 'bearer'])(
    'rejects a malformed Authorization header (%s)',
    async (header) => {
      const { context } = contextFor(
        {},
        { headers: { authorization: header } },
      );
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('attaches the authenticated admin for a valid bearer token', async () => {
    authenticate.mockResolvedValue(admin);
    const { context, req } = contextFor(
      {},
      { headers: { authorization: 'Bearer tok' } },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('tok');
    expect(getRequestAdmin(req as never)).toEqual(admin);
  });

  it('propagates authentication failures', async () => {
    authenticate.mockImplementation(() =>
      Promise.reject(new UnauthorizedError('Authentication required')),
    );
    const { context } = contextFor(
      {},
      { headers: { authorization: 'Bearer bad' } },
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  function withAdmin(metadata: Metadata, role?: Role) {
    const built = contextFor(metadata);
    if (role) setRequestAdmin(built.req as never, { ...admin, role });
    return built.context;
  }

  it('allows any authenticated admin when no roles are required', () => {
    expect(guard.canActivate(withAdmin({}, Role.REVIEWER))).toBe(true);
  });

  it('allows a listed role', () => {
    expect(
      guard.canActivate(
        withAdmin({ roles: [Role.ADMIN, Role.EDITOR] }, Role.EDITOR),
      ),
    ).toBe(true);
  });

  it('forbids an unlisted role, including ADMIN', () => {
    expect(() =>
      guard.canActivate(withAdmin({ roles: [Role.EDITOR] }, Role.REVIEWER)),
    ).toThrow(ForbiddenError);
    expect(() =>
      guard.canActivate(withAdmin({ roles: [Role.EDITOR] }, Role.ADMIN)),
    ).toThrow(ForbiddenError);
  });

  it('reports 401, not 403, when no admin was authenticated', () => {
    expect(() => guard.canActivate(withAdmin({ roles: [Role.ADMIN] }))).toThrow(
      UnauthorizedError,
    );
  });

  it('skips @Public() routes', () => {
    expect(
      guard.canActivate(withAdmin({ isPublic: true, roles: [Role.ADMIN] })),
    ).toBe(true);
  });
});

describe('CurrentAdmin', () => {
  function resolve(req: object) {
    class Probe {
      handler(@CurrentAdmin() _admin: unknown) {}
    }
    const metadata = Reflect.getMetadata(
      '__routeArguments__',
      Probe,
      'handler',
    ) as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => unknown }
    >;
    const { factory } = Object.values(metadata)[0];
    return factory(undefined, {
      switchToHttp: () => ({ getRequest: () => req }),
    } as never);
  }

  it('returns the authenticated admin', () => {
    const req = { headers: {} };
    setRequestAdmin(req as never, admin);
    expect(resolve(req)).toEqual(admin);
  });

  it('throws when used on a route without an authenticated admin', () => {
    expect(() => resolve({ headers: {} })).toThrow(UnauthorizedError);
  });
});

describe('JwtAuthGuard while a password change is pending', () => {
  const authenticate = vi.fn();
  const guard = new JwtAuthGuard(new Reflector(), {
    authenticate,
  } as unknown as AuthService);
  const pending = { ...admin, passwordChangeRequired: true };

  beforeEach(() => {
    authenticate.mockReset();
    authenticate.mockResolvedValue(pending);
  });

  function contextWith(allow: boolean) {
    const handler = () => undefined;
    class Controller {}
    if (allow) {
      Reflect.defineMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true, handler);
    }
    const req = { headers: { authorization: 'Bearer tok' } };
    return {
      req,
      context: {
        getHandler: () => handler,
        getClass: () => Controller,
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext,
    };
  }

  it('refuses every route that does not allow it, with a machine-readable reason', async () => {
    const { context, req } = contextWith(false);
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).details).toEqual({
      reason: 'PASSWORD_CHANGE_REQUIRED',
    });
    expect(getRequestAdmin(req as never)).toBeUndefined();
  });

  it('lets the routes that allow it through', async () => {
    const { context, req } = contextWith(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getRequestAdmin(req as never)).toEqual(pending);
  });

  it('does not affect an admin who has nothing pending', async () => {
    authenticate.mockResolvedValue(admin);
    const { context } = contextWith(false);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
