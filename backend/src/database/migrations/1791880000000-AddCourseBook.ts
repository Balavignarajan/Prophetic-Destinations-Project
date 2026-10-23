import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A stable, CMS-managed way to identify the Daniel and Revelation courses (feature register APP-013 / APP-014: dedicated Home entries).
 * Runs after AddQuizScriptureAndOptionFeedback1791870000000. ADDITIVE and nullable: nothing existing changes, no data is rewritten.
 *
 *   courses."book"  which Bible book the course is the dedicated entry for: 'DANIEL' or 'REVELATION'. NULL = none, which is every existing course.
 *
 * It is a classification, not content: the learner catalog reads it live for courses that have an ACTIVE catalog publication (like the manual
 * course order), so a course that is not published can never be reached through it. More than one course may carry the same value; the learner
 * app opens the first of them in the published course order.
 *
 * ROLLBACK: down() drops the column and whatever was set in it.
 */
export class AddCourseBook1791880000000 implements MigrationInterface {
  name = 'AddCourseBook1791880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "courses"
        ADD COLUMN "book" varchar(20),
        ADD CONSTRAINT "chk_courses_book" CHECK ("book" IS NULL OR "book" IN ('DANIEL', 'REVELATION'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courses" DROP CONSTRAINT "chk_courses_book", DROP COLUMN "book"`);
  }
}
