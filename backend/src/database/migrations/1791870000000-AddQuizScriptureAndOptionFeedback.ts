import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two OPTIONAL additions to the quiz library (feature register QUIZ-001 "Question, options, correct option, explanations, Scripture"; CMS-019 "explanations,
 * Scripture and level visibility"). Runs after CreateAssessments1791860000000. ADDITIVE and nullable: nothing existing changes, no data is rewritten.
 *
 *   quiz_questions."scripture"  the question's optional Scripture reference(s): a JSON list of { "reference": { bookId, chapter, startVerse, endVerse } }
 *                               (the shared structured reference model, never Bible text; at most 3). NULL = none, which is every existing question.
 *   quiz_options."feedback"     optional feedback for ONE answer option, shown after the learner checks their answer. NULL = none, which is every existing option.
 *
 * Existing quizzes, question and option ids, correct options and published lesson snapshots are untouched. The triggers that freeze the questions and options of a
 * PUBLISHED quiz keep applying to these columns too.
 *
 * ROLLBACK: down() drops the two columns and whatever was authored in them.
 */
export class AddQuizScriptureAndOptionFeedback1791870000000 implements MigrationInterface {
  name = 'AddQuizScriptureAndOptionFeedback1791870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quiz_questions"
        ADD COLUMN "scripture" jsonb,
        ADD CONSTRAINT "chk_quiz_questions_scripture" CHECK (
          "scripture" IS NULL OR (jsonb_typeof("scripture") = 'array' AND jsonb_array_length("scripture") BETWEEN 1 AND 3)
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "quiz_options"
        ADD COLUMN "feedback" text,
        ADD CONSTRAINT "chk_quiz_options_feedback" CHECK (
          "feedback" IS NULL OR (char_length(btrim("feedback")) >= 1 AND char_length("feedback") <= 500)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quiz_options" DROP CONSTRAINT "chk_quiz_options_feedback", DROP COLUMN "feedback"`);
    await queryRunner.query(`ALTER TABLE "quiz_questions" DROP CONSTRAINT "chk_quiz_questions_scripture", DROP COLUMN "scripture"`);
  }
}
