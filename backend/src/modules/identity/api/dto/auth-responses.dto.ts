import type { AuthenticatedAdmin } from '../../domain/admin-account.js';
import type { AuthSession } from '../../application/auth.service.js';
import type { Role } from '../../domain/role.js';

/** The only admin fields the API ever returns. */
export class AdminSummaryDto {
  id: string;
  email: string;
  role: Role;
  /** Present (true) only while the account must change its password before doing anything else. */
  passwordChangeRequired?: true;

  static from(admin: AuthenticatedAdmin): AdminSummaryDto {
    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      ...(admin.passwordChangeRequired
        ? { passwordChangeRequired: true as const }
        : {}),
    };
  }
}

/** Login and refresh response. The refresh token travels only in the httpOnly cookie. */
export class AuthSessionResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
  admin: AdminSummaryDto;

  static from(session: AuthSession): AuthSessionResponseDto {
    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.expiresIn,
      admin: AdminSummaryDto.from(session.admin),
    };
  }
}
