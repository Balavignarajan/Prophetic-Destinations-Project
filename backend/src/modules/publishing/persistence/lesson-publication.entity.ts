import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/**
 * One published version of a lesson. The migration also installs the partial unique
 * index "one active publication per lesson", the end-once/never-reactivate trigger,
 * and foreign keys (to lessons and admins, all RESTRICT) that are deliberately not
 * modelled as relations because those entities belong to other modules.
 * Written only through PublicationRepository.
 */
@Entity({ name: 'lesson_publications' })
@Unique('UQ_lesson_publications_lesson_version', ['lessonId', 'version'])
@Unique('UQ_lesson_publications_id_lesson', ['id', 'lessonId'])
@Index('uq_lesson_publications_active', ['lessonId'], {
  unique: true,
  where: '"ended_at" IS NULL',
})
@Check('chk_lesson_publications_version', `"version" >= 1`)
@Check(
  'chk_lesson_publications_source_revision',
  `"source_content_revision" >= 1`,
)
@Check(
  'chk_lesson_publications_schema_version',
  `"snapshot_schema_version" >= 1`,
)
@Check(
  'chk_lesson_publications_ended_reason',
  `"ended_reason" IS NULL OR "ended_reason" IN ('SUPERSEDED', 'UNPUBLISHED')`,
)
@Check(
  'chk_lesson_publications_end_fields',
  `("ended_at" IS NULL) = ("ended_by" IS NULL) AND ("ended_at" IS NULL) = ("ended_reason" IS NULL)`,
)
@Check(
  'chk_lesson_publications_end_after_start',
  `"ended_at" IS NULL OR "ended_at" >= "published_at"`,
)
export class LessonPublicationEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'module_id', type: 'uuid', nullable: true })
  moduleId: string | null;

  @Column({ name: 'source_content_revision', type: 'integer' })
  sourceContentRevision: number;

  @Column({ name: 'snapshot_schema_version', type: 'integer' })
  snapshotSchemaVersion: number;

  @Column({
    name: 'published_at',
    type: 'timestamptz',
    default: () => 'clock_timestamp()',
    insert: false,
    update: false,
  })
  publishedAt: Date;

  @Column({ name: 'published_by', type: 'uuid' })
  publishedBy: string;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'ended_by', type: 'uuid', nullable: true })
  endedBy: string | null;

  @Column({
    name: 'ended_reason',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  endedReason: string | null;
}
