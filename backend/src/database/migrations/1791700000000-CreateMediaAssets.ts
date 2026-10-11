import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Metadata of uploaded media. The bytes live in a storage adapter (the local filesystem in development), addressed by
 * the server-generated `storage_key`; nothing about a path or a client file name reaches the key.
 *
 *  - `sha256` and `size_bytes` describe the stored bytes (integrity, and a sanity check against the configured limit).
 *  - `created_by` is the admin who uploaded it (RESTRICT: an account that uploaded media cannot be deleted; accounts
 *    are disabled, not deleted).
 *  - Nothing references these rows yet (no enabled block type or lesson field uses media), so deleting one needs no
 *    reference check. When a media reference is introduced, that check, and the foreign key that backs it, come with it.
 *
 * ROLLBACK: down() drops the table, forgetting which stored files exist. The files themselves stay on disk (the
 * migration does not touch the storage root), so export the table or remove the directory if that matters.
 */
export class CreateMediaAssets1791700000000 implements MigrationInterface {
  name = 'CreateMediaAssets1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "media_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "storage_key" character varying(40) NOT NULL,
        "original_filename" character varying(255) NOT NULL,
        "content_type" character varying(100) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "sha256" character(64) NOT NULL,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_assets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_assets_created_by" FOREIGN KEY ("created_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_media_assets_size" CHECK ("size_bytes" > 0),
        CONSTRAINT "chk_media_assets_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_media_assets_storage_key" CHECK ("storage_key" ~ '^[0-9a-f]{2}/[0-9a-f]{32}$')
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_media_assets_storage_key" ON "media_assets" ("storage_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_media_assets_created_at_id" ON "media_assets" ("created_at", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "media_assets"`);
  }
}
