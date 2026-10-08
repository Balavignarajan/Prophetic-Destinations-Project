import { canAuthenticate, toAuthenticatedAdmin } from './admin-account.js';
import { isValidEmail, normalizeEmail } from './email.js';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy,
} from './password-policy.js';
import {
  decideRefresh,
  generateRefreshToken,
  hashRefreshToken,
} from './refresh-token.js';
import { ROLES, Role, isRole, isRoleAllowed } from './role.js';

describe('roles', () => {
  it('are exactly ADMIN, EDITOR and REVIEWER', () => {
    expect([...ROLES].sort()).toEqual(['ADMIN', 'EDITOR', 'REVIEWER']);
  });

  it('recognises only known roles', () => {
    expect(isRole('EDITOR')).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
    expect(isRole('editor')).toBe(false);
  });

  it('allows only listed roles, with no implicit superuser', () => {
    expect(isRoleAllowed(Role.EDITOR, [Role.EDITOR, Role.REVIEWER])).toBe(true);
    expect(isRoleAllowed(Role.ADMIN, [Role.EDITOR])).toBe(false);
    expect(isRoleAllowed(Role.ADMIN, [])).toBe(false);
  });
});

describe('email', () => {
  it('is trimmed and lower-cased', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });

  it('checks basic shape', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.de')).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts a password within the limits', () => {
    expect(checkPasswordPolicy('x'.repeat(PASSWORD_MIN_LENGTH))).toEqual([]);
  });

  it('rejects short and oversized passwords', () => {
    expect(checkPasswordPolicy('short')).toHaveLength(1);
    expect(
      checkPasswordPolicy('x'.repeat(PASSWORD_MAX_LENGTH + 1)),
    ).toHaveLength(1);
  });
});

describe('admin account rules', () => {
  const account = {
    id: '1',
    email: 'a@b.co',
    passwordHash: 'hash',
    role: Role.EDITOR,
    status: 'ACTIVE' as const,
  };

  it('only active accounts can authenticate', () => {
    expect(canAuthenticate(account)).toBe(true);
    expect(canAuthenticate({ ...account, status: 'DISABLED' })).toBe(false);
  });

  it('exposes no password hash on the authenticated admin', () => {
    expect(toAuthenticatedAdmin(account)).toEqual({
      id: '1',
      email: 'a@b.co',
      role: 'EDITOR',
    });
  });
});

describe('refresh tokens', () => {
  it('are random and long', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateRefreshToken));
    expect(tokens.size).toBe(50);
    expect([...tokens][0].length).toBeGreaterThanOrEqual(43);
  });

  it('hash deterministically to a value that does not contain the token', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toBe(hashRefreshToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  describe('decideRefresh', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const active = {
      revokedAt: null,
      revokedReason: null,
      expiresAt: new Date('2026-01-02T12:00:00Z'),
    };

    it('accepts an active, unexpired token', () => {
      expect(decideRefresh(active, now)).toBe('accept');
    });

    it('rejects an expired token', () => {
      expect(decideRefresh({ ...active, expiresAt: now }, now)).toBe('reject');
    });

    it('flags replay of an already-rotated token', () => {
      expect(
        decideRefresh(
          { ...active, revokedAt: now, revokedReason: 'ROTATED' },
          now,
        ),
      ).toBe('reuse');
    });

    it.each(['LOGOUT', 'REUSE_DETECTED', 'ACCOUNT_DISABLED'] as const)(
      'rejects a token revoked by %s without treating it as replay',
      (revokedReason) => {
        expect(
          decideRefresh({ ...active, revokedAt: now, revokedReason }, now),
        ).toBe('reject');
      },
    );
  });
});
