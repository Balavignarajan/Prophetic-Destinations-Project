import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Media Library descriptive metadata (workbook Data Model "MediaAsset": title, alt_text, source, rights_notes, tags; CMS-015). Runs after
 * AddRelatedLinkLabelAndLevels1791770000000. ADDITIVE: every existing asset keeps working with all descriptive fields empty.
 *
 *   "title"            optional display title (proposed limit 200)
 *   "alt_text"         optional DEFAULT alternative text offered when the image is chosen for content (proposed limit 500)
 *   "source"           optional source or credit line (proposed limit 300)
 *   "rights_notes"     optional internal rights information (proposed limit 1000). A note for staff, never proof of permission; admin API only.
 *   "tags"             optional labels (proposed: at most 20, each at most 40 characters)
 *   "metadata_version" optimistic-concurrency counter of the descriptive metadata; it rises only when the metadata really changes.
 *
 * The file itself (storage key, bytes, hash, content type, size) is untouched and stays immutable. Block and lesson content never reads these columns
 * after an image has been chosen, so editing them cannot change working content or published snapshots.
 */
export class AddMediaMetadata1791780000000 implements MigrationInterface {
  name = 'AddMediaMetadata1791780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "media_assets"
        ADD COLUMN "title" character varying(200),
        ADD COLUMN "alt_text" character varying(500),
        ADD COLUMN "source" character varying(300),
        ADD COLUMN "rights_notes" character varying(1000),
        ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "metadata_version" integer NOT NULL DEFAULT 1,
        ADD CONSTRAINT "chk_media_assets_tags" CHECK (cardinality("tags") <= 20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "media_assets"
        DROP CONSTRAINT "chk_media_assets_tags",
        DROP COLUMN "metadata_version",
        DROP COLUMN "tags",
        DROP COLUMN "rights_notes",
        DROP COLUMN "source",
        DROP COLUMN "alt_text",
        DROP COLUMN "title"
    `);
  }
}
