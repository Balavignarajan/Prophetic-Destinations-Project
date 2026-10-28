import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permanent deletion of staff accounts ("erasure").
 *
 * WHY A MIGRATION IS NEEDED. A row of `admins` cannot be removed: the account is the author / publisher / actor of rows in
 * lesson_publications, course_publications, assessment_publications, the lesson / catalog / assessment workflow events,
 * quizzes, assessments, media_assets, reusable_blocks and admin_account_events, all with ON DELETE RESTRICT, and the
 * two event tables are append-only (updates and deletes are rejected by triggers). Weakening those keys, or cascading,
 * would break or destroy curriculum and audit history, so this migration does not touch them. Instead an account is
 * ERASED IN PLACE: its e-mail address and credentials are destroyed and only an anonymous record with the same id
 * remains, so every reference stays valid. That needs a way to say "this account was erased":
 *
 *  - `admins.deleted_at`  when the account was erased (NULL for every existing account, so nothing changes for them).
 *  - `admins.status`      the CHECK is widened from ('ACTIVE','DISABLED') to also allow 'DELETED'. No row is touched.
 *  - `chk_admins_deleted_at`  status is DELETED exactly when deleted_at is set.
 *  - a trigger on `admins`  a DELETED row is final: any later UPDATE or DELETE of it is rejected, so an erased account
 *    can never be re-enabled, renamed or given a password again, whatever the application does.
 *  - `admin_account_events.action`  the CHECK also allows 'ACCOUNT_DELETED'. Events never contain an e-mail address,
 *    so the event survives the erasure and still points at the anonymous record.
 *
 * Existing accounts, sessions, events and curriculum are not modified. The application, not this migration, performs
 * erasures (AccountService.deletePermanently): until this migration is applied that endpoint cannot work.
 *
 * ROLLBACK: down() restores the narrower CHECKs. It FAILS, changing nothing (migrations run in one transaction), if any
 * account has been erased or any ACCOUNT_DELETED event exists: history is not rewritten to roll back. Erased accounts
 * cannot be un-erased, because the e-mail address and credentials no longer exist.
 */
export class AddAdminAccountErasure1791950000000 implements MigrationInterface {
  name = 'AddAdminAccountErasure1791950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "admins" DROP CONSTRAINT "chk_admins_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "admins" ADD CONSTRAINT "chk_admins_status"
        CHECK ("status" IN ('ACTIVE', 'DISABLED', 'DELETED'))
    `);
    await queryRunner.query(`
      ALTER TABLE "admins" ADD CONSTRAINT "chk_admins_deleted_at"
        CHECK (("status" = 'DELETED') = ("deleted_at" IS NOT NULL))
    `);

    await queryRunner.query(`
      CREATE FUNCTION "admins_deleted_is_final"() RETURNS trigger AS $$
      BEGIN
        IF OLD."status" = 'DELETED' THEN
          RAISE EXCEPTION 'a deleted admin account is final and cannot be changed'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_admins_deleted_is_final"
        BEFORE UPDATE OR DELETE ON "admins"
        FOR EACH ROW EXECUTE FUNCTION "admins_deleted_is_final"()
    `);

    await queryRunner.query(
      `ALTER TABLE "admin_account_events" DROP CONSTRAINT "chk_admin_account_events_action"`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_account_events" ADD CONSTRAINT "chk_admin_account_events_action" CHECK ("action" IN
        ('ACCOUNT_CREATED', 'ROLE_CHANGED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED',
         'PASSWORD_RESET_REQUIRED', 'PASSWORD_CHANGED', 'ACCOUNT_DELETED'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_account_events" DROP CONSTRAINT "chk_admin_account_events_action"`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_account_events" ADD CONSTRAINT "chk_admin_account_events_action" CHECK ("action" IN
        ('ACCOUNT_CREATED', 'ROLE_CHANGED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED',
         'PASSWORD_RESET_REQUIRED', 'PASSWORD_CHANGED'))
    `);

    await queryRunner.query(
      `DROP TRIGGER "trg_admins_deleted_is_final" ON "admins"`,
    );
    await queryRunner.query(`DROP FUNCTION "admins_deleted_is_final"()`);
    await queryRunner.query(
      `ALTER TABLE "admins" DROP CONSTRAINT "chk_admins_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admins" DROP CONSTRAINT "chk_admins_status"`,
    );
    // Fails (and rolls the whole migration back) if an account has been erased.
    await queryRunner.query(`
      ALTER TABLE "admins" ADD CONSTRAINT "chk_admins_status"
        CHECK ("status" IN ('ACTIVE', 'DISABLED'))
    `);
    await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "deleted_at"`);
  }
}
