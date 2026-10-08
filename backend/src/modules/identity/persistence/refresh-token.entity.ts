import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdminEntity } from './admin.entity.js';

@Entity({ name: 'admin_refresh_tokens' })
@Check(
  'chk_admin_refresh_tokens_revocation',
  `("revoked_at" IS NULL) = ("revoked_reason" IS NULL)`,
)
@Check(
  'chk_admin_refresh_tokens_reason',
  `"revoked_reason" IS NULL OR "revoked_reason" IN ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'ACCOUNT_DISABLED')`,
)
export class AdminRefreshTokenEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Index('idx_admin_refresh_tokens_admin_id')
  @Column({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @ManyToOne(() => AdminEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'admin_id',
    foreignKeyConstraintName: 'FK_admin_refresh_tokens_admin_id',
  })
  admin?: AdminEntity;

  @Index('idx_admin_refresh_tokens_family_id')
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Index('idx_admin_refresh_tokens_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    name: 'revoked_reason',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  revokedReason: string | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
