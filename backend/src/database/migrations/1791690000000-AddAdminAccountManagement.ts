import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin account management.
 *
 *  - `admins.must_change_password`: set when an ADMIN creates an account with a temporary password or forces a
 *    reset. While it is true the account may sign in but may only change its password (enforced by the auth guard).
 *    Existing accounts get false, so nothing changes for them.
 *  - `admin_refresh_tokens`: two more revocation reasons (PASSWORD_CHANGED, PASSWORD_RESET). The CHECK is widened
 *    only; no row is touched.
 *  - `admin_account_events`: an append-only audit trail of account-management actions (who did what to which
 *    account). It never stores a password, a hash or a token. Updates, deletes and truncates are rejected by
 *    triggers; the foreign keys are RESTRICT, so an account with history cannot be deleted.
 *
 * ROLLBACK RISK: down() drops `admin_account_events`, so reverting DESTROYS the account-management audit history, and it
 * drops `must_change_password`. Never revert this against a database whose audit history matters without exporting
 * the table first. It restores the narrower CHECK as well. Restoring the CHECK fails (and
 * changes nothing) if a token was revoked with one of the new reasons: history is not rewritten to roll back.
 */
export class AddAdminAccountManagement1791690000000 implements MigrationInterface {
  name = 'AddAdminAccountManagement1791690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `ALTER TABLE "admin_refresh_tokens" DROP CONSTRAINT "chk_admin_refresh_tokens_reason"`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "chk_admin_refresh_tokens_reason" CHECK (
        "revoked_reason" IS NULL OR "revoked_reason" IN
          ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'ACCOUNT_DISABLED', 'PASSWORD_CHANGED', 'PASSWORD_RESET')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_account_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seq" bigint GENERATED ALWAYS AS IDENTITY,
        -- the account the action was about, and the account that did it (the same account for a password change)
        "subject_admin_id" uuid NOT NULL,
        "actor_admin_id" uuid NOT NULL,
        "action" character varying(30) NOT NULL,
        -- ROLE_CHANGED: the roles; ACCOUNT_CREATED: to_value is the role; PASSWORD_RESET_REQUIRED: what was done
        "from_value" character varying(40),
        "to_value" character varying(40),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT "PK_admin_account_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_account_events_seq" UNIQUE ("seq"),
        CONSTRAINT "FK_admin_account_events_subject" FOREIGN KEY ("subject_admin_id")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_admin_account_events_actor" FOREIGN KEY ("actor_admin_id")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_admin_account_events_action" CHECK ("action" IN
          ('ACCOUNT_CREATED', 'ROLE_CHANGED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED',
           'PASSWORD_RESET_REQUIRED', 'PASSWORD_CHANGED')),
        CONSTRAINT "chk_admin_account_events_roles" CHECK (
          ("action" <> 'ROLE_CHANGED' OR (
             "from_value" IN ('ADMIN', 'EDITOR', 'REVIEWER') AND "to_value" IN ('ADMIN', 'EDITOR', 'REVIEWER')
             AND "from_value" <> "to_value"))
          AND ("action" <> 'ACCOUNT_CREATED' OR "to_value" IN ('ADMIN', 'EDITOR', 'REVIEWER'))
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_admin_account_events_subject_seq" ON "admin_account_events" ("subject_admin_id", "seq")`,
    );

    await queryRunner.query(`
      CREATE FUNCTION "admin_account_events_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'admin_account_events is append-only'
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_admin_account_events_append_only"
        BEFORE UPDATE OR DELETE ON "admin_account_events"
        FOR EACH ROW EXECUTE FUNCTION "admin_account_events_append_only"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_admin_account_events_no_truncate"
        BEFORE TRUNCATE ON "admin_account_events"
        FOR EACH STATEMENT EXECUTE FUNCTION "admin_account_events_append_only"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_admin_account_events_no_truncate" ON "admin_account_events"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_admin_account_events_append_only" ON "admin_account_events"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "admin_account_events_append_only"()`,
    );
    await queryRunner.query(`DROP TABLE "admin_account_events"`);

    await queryRunner.query(
      `ALTER TABLE "admin_refresh_tokens" DROP CONSTRAINT "chk_admin_refresh_tokens_reason"`,
    );
    await queryRunner.query(`
      ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "chk_admin_refresh_tokens_reason" CHECK (
        "revoked_reason" IS NULL OR "revoked_reason" IN
          ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'ACCOUNT_DISABLED')
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "admins" DROP COLUMN "must_change_password"`,
    );
  }
}
