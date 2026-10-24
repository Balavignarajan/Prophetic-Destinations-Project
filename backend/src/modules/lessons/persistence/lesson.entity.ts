import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * `module_id` references course_modules(id) ON DELETE RESTRICT. That foreign key
 * exists in the database (see the migration) but is deliberately not modelled as
 * a TypeORM relation, because the entity belongs to the curriculum module.
 * `cover_media_id` will reference the media table once the Media module exists.
 */
@Entity({ name: 'lessons' })
// Deferrable so a shift or whole-module reorder is checked once, at the end of the statement.
@Check('chk_lessons_position', `"position" >= 1`)
@Check('chk_lessons_content_revision', `"content_revision" >= 1`)
@Check('chk_lessons_tags', `cardinality("tags") <= 10`)
@Check(
  'chk_lessons_title',
  `"title" !~ '^\\s*$' AND char_length("title") <= 200`,
)
@Check(
  'chk_lessons_short_title',
  `"short_title" IS NULL OR ("short_title" !~ '^\\s*$' AND char_length("short_title") <= 100)`,
)
@Check(
  'chk_lessons_subtitle',
  `"subtitle" IS NULL OR ("subtitle" !~ '^\\s*$' AND char_length("subtitle") <= 300)`,
)
@Check(
  'chk_lessons_introduction',
  `"introduction" IS NULL OR ("introduction" !~ '^\\s*$' AND char_length("introduction") <= 5000)`,
)
@Check(
  'chk_lessons_estimated_minutes',
  `"estimated_minutes" IS NULL OR "estimated_minutes" > 0`,
)
// A library lesson (course_id NULL) is standalone: it has no module either.
@Check('chk_lessons_library_has_no_module', `"course_id" IS NOT NULL OR "module_id" IS NULL`)
@Check(
  'chk_lessons_status',
  `"status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
export class LessonEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  /** NULL = a standalone library lesson (an authoring source that is copied into a course or module to be published). */
  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId: string | null;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'short_title', type: 'varchar', length: 100, nullable: true })
  shortTitle: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  subtitle: string | null;

  @Column({ type: 'text', nullable: true })
  introduction: string | null;

  @Column({ name: 'cover_media_id', type: 'uuid', nullable: true })
  coverMediaId: string | null;

  @Column({ name: 'estimated_minutes', type: 'integer', nullable: true })
  estimatedMinutes: number | null;

  /** Admin organisation tags (CMS-021): see Lesson.tags. Added by migration AddLessonTags1791900000000; existing lessons have none. */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  tags: string[];

  @Column({ type: 'integer' })
  position: number;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn({ default: 1 })
  version: number;

  /**
   * Counts effective changes to the lesson's authoring content (metadata, level
   * availability, blocks, visibility and variants). Bumped only by the lessons module, once
   * per logical change; never by workflow status transitions or no-op writes.
   */
  @Column({ name: 'content_revision', type: 'integer', default: 1 })
  contentRevision: number;
}
