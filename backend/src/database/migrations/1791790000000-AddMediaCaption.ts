import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Media Library caption (workbook Data Model "MediaAsset": title, alt_text, caption, source, rights_notes, tags). Runs after
 * AddMediaMetadata1791780000000, which it does not modify. ADDITIVE and nullable: every existing asset stays valid with no caption.
 *
 *   "caption"  optional DEFAULT caption offered when the image is chosen for a content field that has a caption (proposed limit 500, the same as
 *              the caption of the Image block). It is a library note; content that already uses the image keeps its own caption.
 *
 * It shares the descriptive-metadata version counter ("metadata_version") added by AddMediaMetadata1791780000000.
 */
export class AddMediaCaption1791790000000 implements MigrationInterface {
  name = 'AddMediaCaption1791790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media_assets" ADD COLUMN "caption" character varying(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN "caption"`);
  }
}
