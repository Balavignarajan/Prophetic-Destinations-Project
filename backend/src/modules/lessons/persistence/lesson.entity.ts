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
@Unique('UQ_lessons_module_id_position', ['moduleId', 'position'], {
  deferrable: 'INITIALLY IMMEDIATE',
})
@Check('chk_lessons_position', `"position" >= 1`)
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
@Check(
  'chk_lessons_status',
  `"status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
export class LessonEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

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
}
