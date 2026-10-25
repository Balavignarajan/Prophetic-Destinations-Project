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
@Index('idx_courses_home_entry_id', ['homeEntryId'], { where: '"home_entry_id" IS NOT NULL' })
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

  /**
   * LEGACY, FROZEN (superseded by Home Entries, Batch 28): which Bible book this course used to be the fixed Home button for ('DANIEL' | 'REVELATION'). Nothing in the application
   * writes it any more; the migration CreateHomeEntries copied its values into Home Entries, and the public catalog still serves it unchanged so mobile builds released before
   * Home Entries keep their Daniel / Revelation buttons. The column is kept (not dropped) until those builds are retired.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  book: string | null;

  /**
   * The Home Entry (learner Home topic) this course belongs to, or null for an ordinary course. A classification like the manual order, not content: changing it moves neither the
   * course's status nor its version. The foreign key is ON DELETE SET NULL, so deleting an entry never deletes a course.
   */
  @Column({ name: 'home_entry_id', type: 'uuid', nullable: true })
  homeEntryId: string | null;

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
