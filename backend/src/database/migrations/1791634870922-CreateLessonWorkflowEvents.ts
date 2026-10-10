import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The workflow audit trail: the append-only `lesson_workflow_events` table.
 * References `lessons` and `admins` but alters neither. Rows can never be
 * updated, deleted or truncated (enforced by triggers), and both foreign keys
 * are RESTRICT, so the history is retained for as long as the lesson exists and
 * a lesson that has history cannot be deleted. down() removes exactly what up() creates.
 */
export class CreateLessonWorkflowEvents1791634870922 implements MigrationInterface {
  name = 'CreateLessonWorkflowEvents1791634870922';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lesson_workflow_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        -- Strictly increasing in the order events were recorded (inserts for one lesson are serialized
        -- by the lesson row lock), so history can be ordered without relying on clocks.
        "seq" bigint GENERATED ALWAYS AS IDENTITY,
        "lesson_id" uuid NOT NULL,
        "action" character varying(30) NOT NULL,
        "from_status" character varying(20) NOT NULL,
        "to_status" character varying(20) NOT NULL,
        "actor_admin_id" uuid NOT NULL,
        "actor_role" character varying(20) NOT NULL,
        "note" text,
        -- the lesson's content_revision at the moment of the transition (the revision that was reviewed)
        "content_revision" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT "PK_lesson_workflow_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lesson_workflow_events_seq" UNIQUE ("seq"),
        CONSTRAINT "FK_lesson_workflow_events_lesson_id" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_lesson_workflow_events_actor" FOREIGN KEY ("actor_admin_id")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_workflow_events_action" CHECK ("action" IN
          ('SUBMIT_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'UNPUBLISH')),
        CONSTRAINT "chk_lesson_workflow_events_from_status" CHECK ("from_status" IN
          ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_lesson_workflow_events_to_status" CHECK ("to_status" IN
          ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_lesson_workflow_events_actor_role" CHECK ("actor_role" IN
          ('ADMIN', 'EDITOR', 'REVIEWER')),
        -- Only the approved transitions can ever be recorded.
        CONSTRAINT "chk_lesson_workflow_events_transition" CHECK (
          ("action" = 'SUBMIT_FOR_REVIEW' AND "from_status" = 'DRAFT' AND "to_status" = 'READY_FOR_REVIEW')
          OR ("action" = 'REQUEST_CHANGES' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'DRAFT')
          OR ("action" = 'APPROVE' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'APPROVED')
          OR ("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')
          OR ("action" = 'UNPUBLISH' AND (
                ("from_status" = 'PUBLISHED' AND "to_status" = 'APPROVED')
                OR ("from_status" = 'DRAFT' AND "to_status" = 'DRAFT')))
        ),
        -- Requesting changes must say what to change.
        CONSTRAINT "chk_lesson_workflow_events_note_required"
          CHECK ("action" <> 'REQUEST_CHANGES' OR "note" IS NOT NULL),
        CONSTRAINT "chk_lesson_workflow_events_note"
          CHECK ("note" IS NULL OR ("note" !~ '^\\s*$' AND char_length("note") <= 2000)),
        CONSTRAINT "chk_lesson_workflow_events_content_revision" CHECK ("content_revision" >= 1)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_lesson_workflow_events_lesson_seq" ON "lesson_workflow_events" ("lesson_id", "seq")`,
    );

    // Append-only: history is never edited, deleted or truncated through the database.
    await queryRunner.query(`
      CREATE FUNCTION "lesson_workflow_events_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'lesson_workflow_events is append-only'
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_workflow_events_append_only"
        BEFORE UPDATE OR DELETE ON "lesson_workflow_events"
        FOR EACH ROW EXECUTE FUNCTION "lesson_workflow_events_append_only"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_workflow_events_no_truncate"
        BEFORE TRUNCATE ON "lesson_workflow_events"
        FOR EACH STATEMENT EXECUTE FUNCTION "lesson_workflow_events_append_only"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_workflow_events_no_truncate" ON "lesson_workflow_events"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_workflow_events_append_only" ON "lesson_workflow_events"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "lesson_workflow_events_append_only"()`,
    );
    await queryRunner.query(`DROP TABLE "lesson_workflow_events"`);
  }
}
