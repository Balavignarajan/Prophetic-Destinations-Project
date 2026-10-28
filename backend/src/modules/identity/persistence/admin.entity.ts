import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'admins' })
@Check('chk_admins_email_normalized', `"email" = lower(btrim("email"))`)
@Check('chk_admins_role', `"role" IN ('ADMIN', 'EDITOR', 'REVIEWER')`)
@Check('chk_admins_status', `"status" IN ('ACTIVE', 'DISABLED', 'DELETED')`)
@Check('chk_admins_deleted_at', `("status" = 'DELETED') = ("deleted_at" IS NOT NULL)`)
export class AdminEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  role: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword: boolean;

  /**
   * Set once, when the account was permanently erased (status DELETED); null for every account that still exists. Only
   * AdminRepository.erase() writes it (raw SQL). The ORM never selects, inserts or updates it, so sign-in and every
   * other query work unchanged on a database that has not had the erasure migration applied yet.
   */
  @Column({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  deletedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;
}
