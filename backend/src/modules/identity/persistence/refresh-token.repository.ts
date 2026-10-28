import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, IsNull, Repository } from 'typeorm';
import type { RefreshSession, RevokedReason } from '../domain/refresh-token.js';
import { AdminRefreshTokenEntity } from './refresh-token.entity.js';

export type NewRefreshSession = Pick<
  RefreshSession,
  'id' | 'adminId' | 'familyId' | 'tokenHash' | 'expiresAt'
>;

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectRepository(AdminRefreshTokenEntity)
    private readonly tokens: Repository<AdminRefreshTokenEntity>,
  ) {}

  async insert(
    session: NewRefreshSession,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.repo(manager);
    await repo.insert(
      repo.create({
        ...session,
        revokedAt: null,
        revokedReason: null,
        replacedById: null,
      }),
    );
  }

  async findByHash(
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<RefreshSession | null> {
    const row = await this.repo(manager).findOne({ where: { tokenHash } });
    return row ? toSession(row) : null;
  }

  /** Locks the row until the surrounding transaction ends, so two refreshes cannot rotate the same token. */
  async findByHashForUpdate(
    tokenHash: string,
    manager: EntityManager,
  ): Promise<RefreshSession | null> {
    const row = await manager
      .getRepository(AdminRefreshTokenEntity)
      .findOne({ where: { tokenHash }, lock: { mode: 'pessimistic_write' } });
    return row ? toSession(row) : null;
  }

  async markRotated(
    id: string,
    replacedById: string,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(AdminRefreshTokenEntity)
      .update(
        { id },
        { revokedAt: now, revokedReason: 'ROTATED', replacedById },
      );
  }

  /** Revokes every still-active token of a session. Returns how many were revoked. */
  async revokeFamily(
    familyId: string,
    reason: RevokedReason,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.repo(manager).update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: now, revokedReason: reason },
    );
    return result.affected ?? 0;
  }

  /** Revokes every active session of an admin (e.g. when the account is disabled). */
  async revokeAllForAdmin(
    adminId: string,
    reason: RevokedReason,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.repo(manager).update(
      { adminId, revokedAt: IsNull() },
      { revokedAt: now, revokedReason: reason },
    );
    return result.affected ?? 0;
  }

  /**
   * Removes every session record of an admin, revoked or not (used when the account is permanently erased: nothing
   * that could ever have been presented as a credential should outlive it). Returns how many were removed.
   */
  async deleteAllForAdmin(
    adminId: string,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager
      .getRepository(AdminRefreshTokenEntity)
      .delete({ adminId });
    return result.affected ?? 0;
  }

  private repo(manager?: EntityManager): Repository<AdminRefreshTokenEntity> {
    return manager
      ? manager.getRepository(AdminRefreshTokenEntity)
      : this.tokens;
  }
}

function toSession(row: AdminRefreshTokenEntity): RefreshSession {
  return {
    id: row.id,
    adminId: row.adminId,
    familyId: row.familyId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason as RevokedReason | null,
    replacedById: row.replacedById,
  };
}
