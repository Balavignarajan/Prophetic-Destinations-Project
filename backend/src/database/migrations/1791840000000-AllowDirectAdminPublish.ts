import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Direct ADMIN publishing (project workflow change): an ADMIN may publish a lesson, module or course from DRAFT or
 * READY_FOR_REVIEW as well as from APPROVED, without a submit/approve step. The audit event records the status the
 * item really left (PUBLISH from DRAFT to PUBLISHED), so no review is invented. This widens the transition-shape
 * CHECK of `lesson_workflow_events` and `catalog_workflow_events` by those PUBLISH shapes only. It adds no table or
 * column and touches no row; the append-only triggers are not involved.
 *
 * down() restores the narrower CHECKs. PostgreSQL validates existing rows when adding them, so down() fails (and
 * changes nothing) once a direct publish was recorded: history is never rewritten to make a rollback succeed.
 */
export class AllowDirectAdminPublish1791840000000 implements MigrationInterface {
  name = 'AllowDirectAdminPublish1791840000000';

  private async replaceCheck(
    queryRunner: QueryRunner,
    table: 'lesson_workflow_events' | 'catalog_workflow_events',
    publishShape: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${table}" DROP CONSTRAINT "chk_${table}_transition"`,
    );
    await queryRunner.query(`
      ALTER TABLE "${table}" ADD CONSTRAINT "chk_${table}_transition" CHECK (
        ("action" = 'SUBMIT_FOR_REVIEW' AND "from_status" = 'DRAFT' AND "to_status" = 'READY_FOR_REVIEW')
        OR ("action" = 'REQUEST_CHANGES' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'DRAFT')
        OR ("action" = 'APPROVE' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'APPROVED')
        OR ${publishShape}
        OR ("action" = 'UNPUBLISH' AND (
              ("from_status" = 'PUBLISHED' AND "to_status" = 'APPROVED')
              OR ("from_status" <> 'PUBLISHED' AND "to_status" = "from_status")))
      )
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceCheck(
      queryRunner,
      'lesson_workflow_events',
      `("action" = 'PUBLISH' AND "from_status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED') AND "to_status" = 'PUBLISHED')`,
    );
    // catalog events keep the earlier "refresh" shape (PUBLISHED to PUBLISHED)
    await this.replaceCheck(
      queryRunner,
      'catalog_workflow_events',
      `("action" = 'PUBLISH' AND "from_status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED') AND "to_status" = 'PUBLISHED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceCheck(
      queryRunner,
      'lesson_workflow_events',
      `("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')`,
    );
    await this.replaceCheck(
      queryRunner,
      'catalog_workflow_events',
      `("action" = 'PUBLISH' AND "from_status" IN ('APPROVED', 'PUBLISHED') AND "to_status" = 'PUBLISHED')`,
    );
  }
}
