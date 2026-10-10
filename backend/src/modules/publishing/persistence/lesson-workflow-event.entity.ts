import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Append-only history of a lesson's workflow transitions. The migration also
 * installs triggers that reject every UPDATE, DELETE and TRUNCATE, and two
 * foreign keys (to lessons and to admins, both RESTRICT) that are deliberately
 * not modelled as relations because those entities belong to other modules.
 * `seq` is a database identity: never written by the application.
 */
@Entity({ name: 'lesson_workflow_events' })
@Index('idx_lesson_workflow_events_lesson_seq', ['lessonId', 'seq'])
@Check(
  'chk_lesson_workflow_events_action',
  `"action" IN ('SUBMIT_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'UNPUBLISH')`,
)
@Check(
  'chk_lesson_workflow_events_from_status',
  `"from_status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
@Check(
  'chk_lesson_workflow_events_to_status',
  `"to_status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')`,
)
@Check(
  'chk_lesson_workflow_events_actor_role',
  `"actor_role" IN ('ADMIN', 'EDITOR', 'REVIEWER')`,
)
@Check(
  'chk_lesson_workflow_events_note_required',
  `"action" <> 'REQUEST_CHANGES' OR "note" IS NOT NULL`,
)
@Check(
  'chk_lesson_workflow_events_note',
  `"note" IS NULL OR ("note" !~ '^\\s*$' AND char_length("note") <= 2000)`,
)
@Check(
  'chk_lesson_workflow_events_publication',
  `("publication_id" IS NOT NULL) = ("action" IN ('PUBLISH', 'UNPUBLISH'))`,
)
@Check('chk_lesson_workflow_events_content_revision', `"content_revision" >= 1`)
export class LessonWorkflowEventEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({
    type: 'bigint',
    unique: true,
    insert: false,
    update: false,
    generatedIdentity: 'ALWAYS',
  })
  seq: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ name: 'from_status', type: 'varchar', length: 20 })
  fromStatus: string;

  @Column({ name: 'to_status', type: 'varchar', length: 20 })
  toStatus: string;

  @Column({ name: 'actor_admin_id', type: 'uuid' })
  actorAdminId: string;

  @Column({ name: 'actor_role', type: 'varchar', length: 20 })
  actorRole: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'content_revision', type: 'integer' })
  contentRevision: number;

  @Column({ name: 'publication_id', type: 'uuid', nullable: true })
  publicationId: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'clock_timestamp()',
    insert: false,
    update: false,
  })
  createdAt: Date;
}
