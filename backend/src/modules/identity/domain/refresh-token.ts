import { createHash, randomBytes } from 'node:crypto';

export type RevokedReason =
  | 'ROTATED'
  | 'LOGOUT'
  | 'REUSE_DETECTED'
  | 'ACCOUNT_DISABLED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET';

/**
 * One refresh token. Tokens that descend from the same login share a familyId;
 * the family is the "session". Only a hash of the token is ever stored.
 */
export interface RefreshSession {
  id: string;
  adminId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RevokedReason | null;
  replacedById: string | null;
}

/** 256 bits of randomness, so a plain SHA-256 is enough to store (no password-style hashing needed). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * accept: rotate it.
 * reuse:  a token that was already rotated is being replayed; the whole session must be revoked.
 * reject: revoked for another reason, or expired; nothing more to do.
 */
export type RefreshDecision = 'accept' | 'reuse' | 'reject';

export function decideRefresh(
  session: Pick<RefreshSession, 'revokedAt' | 'revokedReason' | 'expiresAt'>,
  now: Date,
): RefreshDecision {
  if (session.revokedAt) {
    return session.revokedReason === 'ROTATED' ? 'reuse' : 'reject';
  }
  return session.expiresAt.getTime() <= now.getTime() ? 'reject' : 'accept';
}
