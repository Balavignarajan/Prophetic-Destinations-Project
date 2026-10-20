import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Related lessons (workbook Data Model "RelatedLesson", CMS-006 / CMS-027: manually chosen links to other lessons). Lesson METADATA, not a
 * content block (the Continue Exploring block, BLK-022, is separate and depends on open decision D1).
 * Runs after AddHistoricalEvidenceBlockType1791750000000.
 *
 * One row per link, in the author's order. Both foreign keys CASCADE: deleting a lesson removes the links it owns and the links that point at
 * it, so no dangling link remains. Published lesson snapshots keep the ids they froze; they are never touched by this table.
 */
export class CreateLessonRelated1791760000000 implements MigrationInterface {
  name = 'CreateLessonRelated1791760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lesson_related" (
        "lesson_id" uuid NOT NULL,
        "related_lesson_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lesson_related" PRIMARY KEY ("lesson_id", "related_lesson_id"),
        CONSTRAINT "UQ_lesson_related_position" UNIQUE ("lesson_id", "position"),
        CONSTRAINT "FK_lesson_related_lesson" FOREIGN KEY ("lesson_id") REFERENCES "lessons" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_lesson_related_target" FOREIGN KEY ("related_lesson_id") REFERENCES "lessons" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_related_not_self" CHECK ("lesson_id" <> "related_lesson_id"),
        CONSTRAINT "chk_lesson_related_position" CHECK ("position" >= 1)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_lesson_related_target" ON "lesson_related" ("related_lesson_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lesson_related"`);
  }
}
