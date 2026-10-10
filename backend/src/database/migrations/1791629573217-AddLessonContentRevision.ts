import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `lessons.content_revision`: a counter of effective changes to a lesson's
 * authoring content (metadata, level availability, blocks and their level
 * settings). It is bumped by the lessons module on every such change, never by
 * workflow status transitions and never by no-op writes. `lessons.version`
 * keeps its existing meaning. Existing rows start at 1.
 * Touches only the `lessons` table; down() removes exactly what up() adds.
 */
export class AddLessonContentRevision1791629573217 implements MigrationInterface {
  name = 'AddLessonContentRevision1791629573217';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD COLUMN "content_revision" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD CONSTRAINT "chk_lessons_content_revision" CHECK ("content_revision" >= 1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lessons" DROP CONSTRAINT "chk_lessons_content_revision"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" DROP COLUMN "content_revision"`,
    );
  }
}
