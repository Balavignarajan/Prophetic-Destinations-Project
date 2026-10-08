import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../../config/index.js';
import type { AuthenticatedAdmin } from '../domain/admin-account.js';

export const JWT_ISSUER = 'prophetic-destinations-api';
export const JWT_AUDIENCE = 'admin-cms';

/** Claims are the minimum needed: who (sub), their role, and what kind of token this is. */
interface AccessTokenClaims {
  sub: string;
  role: string;
  typ: 'access';
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async sign(
    admin: AuthenticatedAdmin,
  ): Promise<{ token: string; expiresIn: number }> {
    const claims: AccessTokenClaims = {
      sub: admin.id,
      role: admin.role,
      typ: 'access',
    };
    const token = await this.jwt.signAsync(claims, {
      algorithm: 'HS256',
      expiresIn: this.config.jwtAccessTtlSeconds,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return { token, expiresIn: this.config.jwtAccessTtlSeconds };
  }

  /** Returns the admin id the token was issued to, or null for anything invalid or expired. */
  async verify(token: string): Promise<string | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      return claims.typ === 'access' && typeof claims.sub === 'string'
        ? claims.sub
        : null;
    } catch {
      return null;
    }
  }
}
