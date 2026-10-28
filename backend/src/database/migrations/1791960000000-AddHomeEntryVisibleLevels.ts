import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-level visibility of Home Entries (Batch 54): an administrator chooses which learning levels see a Home Entry on the learner Home screen. Runs after
 * AddAdminAccountErasure1791950000000. ADDITIVE and nullable, with the same convention as the quiz-question and related-link levels:
 *
 *   "visible_levels"  the levels the entry is shown at. NULL = EVERY level. That NULL is the backward-compatible default: all existing entries keep showing at all three levels
 *                     with no data change, and "all three levels" is stored as NULL as well. Otherwise a non-empty subset of BEGINNER / INTERMEDIATE / ADVANCED with no
 *                     level twice. An entry hidden at every level is not allowed (disable the entry instead).
 *
 * This is only the administrators' choice. Whether a learner then actually sees the entry still depends on everything it depended on before: the entry is enabled, and at least one
 * course assigned to it is published with a lesson at the learner's level. No course, lesson, publication or progress row is touched, and no entry changes position or version.
 *
 * MUST BE APPLIED before the updated backend serves Home Entries: the Admin Home Entries screen and GET /home-entries answer with an error until the column exists.
 * ROLLBACK: down() drops the column, so every level choice made since is lost (all entries show at all levels again, as before this batch).
 */
export class AddHomeEntryVisibleLevels1791960000000 implements MigrationInterface {
  name = 'AddHomeEntryVisibleLevels1791960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "home_entries"
        ADD COLUMN "visible_levels" text[],
        ADD CONSTRAINT "chk_home_entries_visible_levels" CHECK (
          "visible_levels" IS NULL OR (
            cardinality("visible_levels") >= 1
            AND "visible_levels" <@ ARRAY['BEGINNER', 'INTERMEDIATE', 'ADVANCED']::text[]
            AND cardinality(array_positions("visible_levels", 'BEGINNER')) <= 1
            AND cardinality(array_positions("visible_levels", 'INTERMEDIATE')) <= 1
            AND cardinality(array_positions("visible_levels", 'ADVANCED')) <= 1
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "home_entries" DROP CONSTRAINT "chk_home_entries_visible_levels", DROP COLUMN "visible_levels"`);
  }
}
