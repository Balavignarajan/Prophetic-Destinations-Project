import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cover images for courses and lessons. Runs after AddCourseOrdering1791730000000.
 *
 *  - `courses.cover_media_id`: the working cover (nullable; every existing course simply has none).
 *  - `lessons.cover_media_id` already exists (always NULL so far); it now gets its foreign key to `media_assets`.
 *    ON DELETE RESTRICT is the backstop for the application's "asset in use" check.
 *  - `course_publications.course_cover_media_id`: the cover PUBLISHED with a catalog version (nullable; versions that
 *    already exist have none). No foreign key, like the other published references: history is immutable.
 *
 * No existing row, id, status or publication changes.
 */
export class AddCoverImages1791740000000 implements MigrationInterface {
  name = 'AddCoverImages1791740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courses" ADD COLUMN "cover_media_id" uuid`);
    await queryRunner.query(`
      ALTER TABLE "courses" ADD CONSTRAINT "FK_courses_cover_media_id"
        FOREIGN KEY ("cover_media_id") REFERENCES "media_assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "lessons" ADD CONSTRAINT "FK_lessons_cover_media_id"
        FOREIGN KEY ("cover_media_id") REFERENCES "media_assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`ALTER TABLE "course_publications" ADD COLUMN "course_cover_media_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "course_publications" DROP COLUMN "course_cover_media_id"`);
    await queryRunner.query(`ALTER TABLE "lessons" DROP CONSTRAINT "FK_lessons_cover_media_id"`);
    await queryRunner.query(`ALTER TABLE "courses" DROP CONSTRAINT "FK_courses_cover_media_id", DROP COLUMN "cover_media_id"`);
  }
}
