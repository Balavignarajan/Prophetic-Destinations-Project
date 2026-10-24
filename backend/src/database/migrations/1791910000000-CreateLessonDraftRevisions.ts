import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Draft revisions (CMS-029): `lesson_draft_revisions`, complete copies of a lesson's editable state that "Restore draft" can put back. Runs after AddLessonTags1791900000000.
 * MUST BE APPLIED before the backend is used again: every edit of a lesson now stores a revision first, so lesson edits fail until the table exists.
 *
 * One new table, nothing changed in any existing one:
 *  - One row per (lesson, content_revision): the editable state of the lesson at that value of `lessons.content_revision`, stored once, just before the first change that replaces it. It
 *    is never updated.
 *  - `snapshot` holds the lesson's own fields (with tags), its levels, every block (id, type, place, shared content, level settings with their own versions) and the related links. It
 *    holds no learner progress, quiz attempt or reading position, and it is NOT a published snapshot: no publication table is read or written.
 *  - `lesson_id` cascades on lesson deletion (a deleted lesson has nothing left to restore). `restored_by` is the admin who restored it (SET NULL if that account is deleted).
 *  - There is no clean-up and no retention limit: nothing is removed automatically.
 *
 * ROLLBACK: down() drops the table and every stored revision in it. Lessons are not affected.
 */
export class CreateLessonDraftRevisions1791910000000 implements MigrationInterface {
  name = 'CreateLessonDraftRevisions1791910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lesson_draft_revisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "lesson_id" uuid NOT NULL,
        "content_revision" integer NOT NULL,
        "saved_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "captured_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "restored_from_revision" integer,
        "restored_by" uuid,
        "snapshot" jsonb NOT NULL,
        CONSTRAINT "PK_lesson_draft_revisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lesson_draft_revisions_lesson_revision" UNIQUE ("lesson_id", "content_revision"),
        CONSTRAINT "FK_lesson_draft_revisions_lesson" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_lesson_draft_revisions_restored_by" FOREIGN KEY ("restored_by")
          REFERENCES "admins" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_draft_revisions_revision" CHECK ("content_revision" >= 1),
        CONSTRAINT "chk_lesson_draft_revisions_snapshot" CHECK (jsonb_typeof("snapshot") = 'object')
      )
    `);
    // No separate index: the UNIQUE constraint on (lesson_id, content_revision) already serves every lookup by lesson.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lesson_draft_revisions"`);
  }
}
