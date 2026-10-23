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
@Index('idx_courses_position_id', ['position', 'id'])
@Check('chk_courses_position', `"position" >= 1`)
@Check(
  'chk_courses_title',
  `btrim("title") <> '' AND char_length("title") <= 200`,
)
@Check(
  'chk_courses_status',
  `"status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
@Check('chk_courses_book', `"book" IS NULL OR "book" IN ('DANIEL', 'REVELATION')`)
export class CourseEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  /** Working cover image (a media_assets id); the published cover is stored with each catalog version. */
  @Column({ name: 'cover_media_id', type: 'uuid', nullable: true })
  coverMediaId: string | null;

  /** Optional: which Bible book this course is the dedicated Home entry for ('DANIEL' | 'REVELATION'); null for every other course. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  book: string | null;

  /** 1-based place in the manual course order (the learner catalog follows it too). */
  @Column({ type: 'int' })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;
}
