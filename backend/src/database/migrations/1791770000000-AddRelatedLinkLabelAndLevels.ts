import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Related-lesson link metadata (workbook Data Model "RelatedLesson": source_lesson_id, target_lesson_id, label, sort_order, level flags).
 * Runs after CreateLessonRelated1791760000000. ADDITIVE and nullable, so every existing link keeps its previous behaviour:
 *
 *   "label"  - the author's optional custom text for the link (plain text, at most 120 characters). NULL = show the target lesson's own published title.
 *   "levels" - the learning levels the LINK is shown at. NULL = every level (the previous behaviour). Otherwise a non-empty subset of
 *              BEGINNER / INTERMEDIATE / ADVANCED. This is the link's visibility only; it says nothing about whether the target lesson is
 *              available at a level.
 *
 * Nothing in published snapshots is touched: a snapshot freezes the link metadata when the source lesson is published.
 */
export class AddRelatedLinkLabelAndLevels1791770000000 implements MigrationInterface {
  name = 'AddRelatedLinkLabelAndLevels1791770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lesson_related"
        ADD COLUMN "label" character varying(120),
        ADD COLUMN "levels" text[],
        ADD CONSTRAINT "chk_lesson_related_label" CHECK ("label" IS NULL OR length(btrim("label")) > 0),
        ADD CONSTRAINT "chk_lesson_related_levels" CHECK (
          "levels" IS NULL OR (cardinality("levels") >= 1 AND "levels" <@ ARRAY['BEGINNER', 'INTERMEDIATE', 'ADVANCED']::text[])
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lesson_related"
        DROP CONSTRAINT "chk_lesson_related_levels",
        DROP CONSTRAINT "chk_lesson_related_label",
        DROP COLUMN "levels",
        DROP COLUMN "label"
    `);
  }
}
