import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A PUBLISHED course or module that is currently listed may be published again (a catalog "refresh": a new
 * catalog version from the approved current data, without an outage). Its audit event is PUBLISH from
 * PUBLISHED to PUBLISHED, so this widens the transition-shape CHECK of `catalog_workflow_events` by that one
 * shape. Nothing else changes: no table or column is added and no row is touched; the append-only
 * triggers are not involved.
 *
 * down() restores the narrower CHECK. PostgreSQL validates existing rows when adding it, so it fails (and
 * changes nothing) if a refresh event was recorded: history is never rewritten to make a rollback succeed.
 */
export class AllowCatalogRefreshEvent1791680000000 implements MigrationInterface {
  name = 'AllowCatalogRefreshEvent1791680000000';

  private async replaceCheck(
    queryRunner: QueryRunner,
    publishShape: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "catalog_workflow_events" DROP CONSTRAINT "chk_catalog_workflow_events_transition"`,
    );
    await queryRunner.query(`
      ALTER TABLE "catalog_workflow_events" ADD CONSTRAINT "chk_catalog_workflow_events_transition" CHECK (
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
      `("action" = 'PUBLISH' AND "from_status" IN ('APPROVED', 'PUBLISHED') AND "to_status" = 'PUBLISHED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceCheck(
      queryRunner,
      `("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')`,
    );
  }
}
