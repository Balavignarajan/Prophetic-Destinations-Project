import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'courses' })
@Index('idx_courses_created_at_id', ['createdAt', 'id'])
@Check(
  'chk_courses_title',
  `btrim("title") <> '' AND char_length("title") <= 200`,
)
@Check(
  'chk_courses_status',
  `"status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
export class CourseEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;
}
