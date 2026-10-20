import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Manual course order. Adds `courses.position` and backfills it from the current order (creation time, then id),
 * so nothing visibly moves. Runs after AllowDirectCourseLessons1791720000000. No content, status, version or
 * publication row is changed. Positions only need to sort correctly (they are renumbered 1..n on every reorder).
 */
export class AddCourseOrdering1791730000000 implements MigrationInterface {
  name = 'AddCourseOrdering1791730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courses" ADD COLUMN "position" integer`);
    await queryRunner.query(`
      UPDATE "courses" c SET "position" = o."rn"
        FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id")::int AS "rn" FROM "courses") o
       WHERE o."id" = c."id"
    `);
    await queryRunner.query(`ALTER TABLE "courses" ALTER COLUMN "position" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "courses" ADD CONSTRAINT "chk_courses_position" CHECK ("position" >= 1)`);
    await queryRunner.query(`CREATE INDEX "idx_courses_position_id" ON "courses" ("position", "id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_courses_position_id"`);
    await queryRunner.query(`ALTER TABLE "courses" DROP CONSTRAINT "chk_courses_position", DROP COLUMN "position"`);
  }
}
