import { Check, Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * One stored draft revision of a lesson (CMS-029): the complete editable state of the lesson at one value of its `content_revision`, as `snapshot` (see
 * domain/lesson-revisions.ts). Rows are only ever INSERTED (a revision is never edited) and are removed only when the lesson itself is deleted (ON DELETE CASCADE);
 * there is no automatic clean-up and no retention limit, because none has been approved.
 *
 * Not a published snapshot: nothing here is read by Publishing or by any learner API. `restored_by` is the admin who restored it (SET NULL: deleting that account
 * keeps the revision).
 */
@Entity({ name: 'lesson_draft_revisions' })
@Unique('UQ_lesson_draft_revisions_lesson_revision', ['lessonId', 'contentRevision'])
@Check('chk_lesson_draft_revisions_revision', `"content_revision" >= 1`)
@Check('chk_lesson_draft_revisions_snapshot', `jsonb_typeof("snapshot") = 'object'`)
export class LessonDraftRevisionEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ name: 'content_revision', type: 'integer' })
  contentRevision: number;

  /** When that state was last changed: the lesson's own updated time when the copy was taken. */
  @Column({ name: 'saved_at', type: 'timestamptz' })
  savedAt: Date;

  @CreateDateColumn({ name: 'captured_at', type: 'timestamptz' })
  capturedAt: Date;

  /** Set when this state is the result of restoring another revision: that revision's number. */
  @Column({ name: 'restored_from_revision', type: 'integer', nullable: true })
  restoredFromRevision: number | null;

  @Column({ name: 'restored_by', type: 'uuid', nullable: true })
  restoredBy: string | null;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;
}
