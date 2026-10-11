import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../shared-kernel/index.js';
import {
  type AuthenticatedAdmin,
  canAuthenticate,
  toAuthenticatedAdmin,
} from '../domain/admin-account.js';
import { normalizeEmail } from '../domain/email.js';
import { AdminRepository } from '../persistence/admin.repository.js';
import { AccessTokenService } from './access-token.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

export interface AuthSession {
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  admin: AuthenticatedAdmin;
}

/** One message for every login failure so responses never reveal why. */
const LOGIN_FAILED = 'Authentication failed';

@Injectable()
export class AuthService {
  constructor(
    private readonly admins: AdminRepository,
    private readonly passwords: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionService,
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const account = await this.admins.findByEmail(normalizeEmail(email));

    let passwordMatches = false;
    if (account) {
      passwordMatches = await this.passwords.verify(
        account.passwordHash,
        password,
      );
    } else {
      await this.passwords.verifyAgainstDummy(password);
    }

    if (!account || !passwordMatches || !canAuthenticate(account)) {
      throw new UnauthorizedError(LOGIN_FAILED);
    }

    const admin = toAuthenticatedAdmin(account);
    const refresh = await this.sessions.start(admin.id, {
      passwordHash: account.passwordHash,
      mustChangePassword: account.mustChangePassword,
    });
    return this.buildSession(admin, refresh.rawToken, refresh.expiresAt);
  }

  /** Starts a new session for an admin who was just authenticated another way (after a password change). */
  async startSessionFor(admin: AuthenticatedAdmin): Promise<AuthSession> {
    const refresh = await this.sessions.start(admin.id);
    return this.buildSession(admin, refresh.rawToken, refresh.expiresAt);
  }

  async refresh(rawRefreshToken: string | undefined): Promise<AuthSession> {
    if (!rawRefreshToken) throw new UnauthorizedError(LOGIN_FAILED);
    const rotated = await this.sessions.rotate(rawRefreshToken);
    return this.buildSession(
      toAuthenticatedAdmin(rotated.admin),
      rotated.rawToken,
      rotated.expiresAt,
    );
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) await this.sessions.end(rawRefreshToken);
  }

  /**
   * Resolves an access token to the current admin. The account is re-read on
   * every request, so disabling an admin or changing their role takes effect
   * immediately rather than when the token expires.
   */
  async authenticate(accessToken: string): Promise<AuthenticatedAdmin> {
    const adminId = await this.accessTokens.verify(accessToken);
    const account = adminId ? await this.admins.findById(adminId) : null;
    if (!account || !canAuthenticate(account)) {
      throw new UnauthorizedError('Authentication required');
    }
    return toAuthenticatedAdmin(account);
  }

  private async buildSession(
    admin: AuthenticatedAdmin,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<AuthSession> {
    const access = await this.accessTokens.sign(admin);
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      refreshTokenExpiresAt,
      admin,
    };
  }
}
