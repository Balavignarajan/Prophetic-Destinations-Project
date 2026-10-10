import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unpublishing now preserves the working copy's status whenever that is not PUBLISHED:
 * PUBLISHED -> APPROVED, and DRAFT / READY_FOR_REVIEW / APPROVED stay as they are while the
 * active publication ends. This widens the transition-shape CHECK of `lesson_workflow_events`
 * accordingly (UNPUBLISH from READY_FOR_REVIEW and APPROVED to the same status). Nothing else
 * changes: it adds no table or column and touches no row, and the append-only triggers are not involved.
 *
 * down() restores the narrower CHECK. PostgreSQL validates existing rows when adding it, so it
 * fails (and changes nothing) if any UNPUBLISH event of the newly allowed shapes was recorded:
 * history is never rewritten to make a rollback succeed.
 */
export class AllowUnpublishToPreserveStatus1791650000000 implements MigrationInterface {
  name = 'AllowUnpublishToPreserveStatus1791650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lesson_workflow_events" DROP CONSTRAINT "chk_lesson_workflow_events_transition"`,
    );
    await queryRunner.query(`
      ALTER TABLE "lesson_workflow_events" ADD CONSTRAINT "chk_lesson_workflow_events_transition" CHECK (
        ("action" = 'SUBMIT_FOR_REVIEW' AND "from_status" = 'DRAFT' AND "to_status" = 'READY_FOR_REVIEW')
        OR ("action" = 'REQUEST_CHANGES' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'DRAFT')
        OR ("action" = 'APPROVE' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'APPROVED')
        OR ("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')
        OR ("action" = 'UNPUBLISH' AND (
              ("from_status" = 'PUBLISHED' AND "to_status" = 'APPROVED')
              OR ("from_status" <> 'PUBLISHED' AND "to_status" = "from_status")))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lesson_workflow_events" DROP CONSTRAINT "chk_lesson_workflow_events_transition"`,
    );
    await queryRunner.query(`
      ALTER TABLE "lesson_workflow_events" ADD CONSTRAINT "chk_lesson_workflow_events_transition" CHECK (
        ("action" = 'SUBMIT_FOR_REVIEW' AND "from_status" = 'DRAFT' AND "to_status" = 'READY_FOR_REVIEW')
        OR ("action" = 'REQUEST_CHANGES' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'DRAFT')
        OR ("action" = 'APPROVE' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'APPROVED')
        OR ("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')
        OR ("action" = 'UNPUBLISH' AND (
              ("from_status" = 'PUBLISHED' AND "to_status" = 'APPROVED')
              OR ("from_status" = 'DRAFT' AND "to_status" = 'DRAFT')))
      )
    `);
  }
}
