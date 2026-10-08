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
@Check('chk_admins_status', `"status" IN ('ACTIVE', 'DISABLED')`)
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;
}
