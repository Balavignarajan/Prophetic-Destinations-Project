import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identity tables only: `admins` and `admin_refresh_tokens`.
 * Touches nothing else. down() removes exactly what up() creates.
 */
export class CreateIdentityTables1791490152347 implements MigrationInterface {
  name = 'CreateIdentityTables1791490152347';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(320) NOT NULL,
        "password_hash" text NOT NULL,
        "role" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_admins_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admins_email" UNIQUE ("email"),
        CONSTRAINT "chk_admins_email_normalized" CHECK ("email" = lower(btrim("email"))),
        CONSTRAINT "chk_admins_role" CHECK ("role" IN ('ADMIN', 'EDITOR', 'REVIEWER')),
        CONSTRAINT "chk_admins_status" CHECK ("status" IN ('ACTIVE', 'DISABLED'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "admin_id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "revoked_reason" character varying(20),
        "replaced_by_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_refresh_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_admin_refresh_tokens_admin_id" FOREIGN KEY ("admin_id")
          REFERENCES "admins" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "chk_admin_refresh_tokens_revocation"
          CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL)),
        CONSTRAINT "chk_admin_refresh_tokens_reason"
          CHECK ("revoked_reason" IS NULL OR "revoked_reason" IN ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'ACCOUNT_DISABLED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_admin_refresh_tokens_admin_id" ON "admin_refresh_tokens" ("admin_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_refresh_tokens_family_id" ON "admin_refresh_tokens" ("family_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_admin_refresh_tokens_expires_at" ON "admin_refresh_tokens" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "admin_refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "admins"`);
  }
}
