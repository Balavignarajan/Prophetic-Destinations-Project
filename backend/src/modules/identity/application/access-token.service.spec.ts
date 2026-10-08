import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../../../config/index.js';
import { Role } from '../domain/role.js';
import { AccessTokenService } from './access-token.service.js';

const secret = 's'.repeat(40);
const config = {
  jwtAccessSecret: secret,
  jwtAccessTtlSeconds: 900,
} as AppConfig;
const admin = { id: 'admin-1', email: 'a@b.co', role: Role.EDITOR };

function service(jwtSecret = secret, ttl = 900) {
  return new AccessTokenService(new JwtService({ secret: jwtSecret }), {
    ...config,
    jwtAccessSecret: jwtSecret,
    jwtAccessTtlSeconds: ttl,
  });
}

function decode(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

describe('AccessTokenService', () => {
  it('round-trips the admin id', async () => {
    const { token } = await service().sign(admin);
    expect(await service().verify(token)).toBe('admin-1');
  });

  it('carries only the minimum claims', async () => {
    const { token } = await service().sign(admin);
    const claims = decode(token);
    expect(Object.keys(claims).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'role', 'sub', 'typ'].sort(),
    );
    expect(claims).toMatchObject({
      sub: 'admin-1',
      role: 'EDITOR',
      typ: 'access',
    });
    expect(JSON.stringify(claims)).not.toContain('a@b.co');
  });

  it('is short-lived', async () => {
    const { token, expiresIn } = await service().sign(admin);
    const claims = decode(token) as { exp: number; iat: number };
    expect(expiresIn).toBe(900);
    expect(claims.exp - claims.iat).toBe(900);
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await service('o'.repeat(40)).sign(admin);
    expect(await service().verify(token)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const { token } = await service().sign(admin);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'someone-else', role: 'ADMIN', typ: 'access' }),
    ).toString('base64url');
    expect(
      await service().verify(`${header}.${forged}.${signature}`),
    ).toBeNull();
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: 'admin-1', typ: 'access' })}.`;
    expect(await service().verify(unsigned)).toBeNull();
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    try {
      const { token } = await service().sign(admin);
      vi.advanceTimersByTime(901 * 1000);
      expect(await service().verify(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a token that is not an access token', async () => {
    const jwt = new JwtService({ secret });
    const other = await jwt.signAsync(
      { sub: 'admin-1', typ: 'refresh' },
      { issuer: 'prophetic-destinations-api', audience: 'admin-cms' },
    );
    expect(await service().verify(other)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await service().verify('not.a.jwt')).toBeNull();
    expect(await service().verify('')).toBeNull();
  });
});
