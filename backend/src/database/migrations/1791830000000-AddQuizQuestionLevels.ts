import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-question learning-level visibility (feature register QUIZ-002 "assign B/I/A visibility to question", QUIZ-003 "use only questions enabled for the
 * current level", acceptance AT-008). Runs after AddMediaAnimationBlockType1791820000000. ADDITIVE and nullable:
 *
 *   "levels"  the levels the question is shown at. NULL = EVERY level. That NULL is the backward-compatible default: all existing questions keep their
 *             previous behaviour (shown at all levels) with no data change, and "all three levels" is stored as NULL as well. Otherwise a non-empty
 *             subset of BEGINNER / INTERMEDIATE / ADVANCED. A question hidden at every level is not allowed (the requirement does not ask for one).
 *
 * The questions of a published lesson are frozen per level at publication (QuizEmbedService); this column only feeds that and the author's preview.
 */
export class AddQuizQuestionLevels1791830000000 implements MigrationInterface {
  name = 'AddQuizQuestionLevels1791830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quiz_questions"
        ADD COLUMN "levels" text[],
        ADD CONSTRAINT "chk_quiz_questions_levels" CHECK (
          "levels" IS NULL OR (cardinality("levels") >= 1 AND "levels" <@ ARRAY['BEGINNER', 'INTERMEDIATE', 'ADVANCED']::text[])
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quiz_questions" DROP CONSTRAINT "chk_quiz_questions_levels", DROP COLUMN "levels"`);
  }
}
