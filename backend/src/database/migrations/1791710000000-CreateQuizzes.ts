import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Basic quizzes: a quiz, its questions and their answer options.
 *
 *  - A question has exactly one correct option BY CONSTRUCTION: `quiz_questions.correct_option_id` is a foreign key
 *    (with the question id, so the option must belong to that very question) to `quiz_options`. It is DEFERRED, so a
 *    question and its options can be written in one transaction, and the transaction fails at commit if the
 *    correct option is missing or belongs to another question.
 *  - Positions are unique per parent, so the order shown to learners is stored, not implied.
 *  - `type` is a column with a one-value CHECK so further question types can be added by widening it.
 *  - The questions and options of a PUBLISHED quiz cannot be added, changed or removed one by one: triggers refuse any
 *    such write while the quiz's status is PUBLISHED, whoever issues it. (Deleting the whole quiz is a separate
 *    operation: the application refuses it while published; the database does not.) Unpublish first.
 *  - Deleting a quiz deletes its questions and options (CASCADE); nothing else references them yet.
 *
 * ROLLBACK: down() drops the three tables and everything authored in them. Export them first if that matters.
 */
export class CreateQuizzes1791710000000 implements MigrationInterface {
  name = 'CreateQuizzes1791710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "quizzes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(200) NOT NULL,
        "description" text,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "version" integer NOT NULL DEFAULT 1,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "published_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_quizzes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quizzes_created_by" FOREIGN KEY ("created_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_quizzes_status" CHECK ("status" IN ('DRAFT', 'PUBLISHED')),
        CONSTRAINT "chk_quizzes_title" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
        CONSTRAINT "chk_quizzes_description" CHECK ("description" IS NULL OR char_length("description") <= 2000),
        CONSTRAINT "chk_quizzes_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_quizzes_published_at" CHECK (("status" = 'PUBLISHED') = ("published_at" IS NOT NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_quizzes_created_at_id" ON "quizzes" ("created_at", "id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "quiz_questions" (
        "id" uuid NOT NULL,
        "quiz_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "type" character varying(20) NOT NULL DEFAULT 'SINGLE_CHOICE',
        "prompt" text NOT NULL,
        "explanation" text,
        "correct_option_id" uuid NOT NULL,
        CONSTRAINT "PK_quiz_questions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quiz_questions_quiz_position" UNIQUE ("quiz_id", "position"),
        CONSTRAINT "FK_quiz_questions_quiz" FOREIGN KEY ("quiz_id")
          REFERENCES "quizzes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "chk_quiz_questions_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_quiz_questions_type" CHECK ("type" IN ('SINGLE_CHOICE')),
        CONSTRAINT "chk_quiz_questions_prompt" CHECK (char_length(btrim("prompt")) BETWEEN 1 AND 1000),
        CONSTRAINT "chk_quiz_questions_explanation" CHECK
          ("explanation" IS NULL OR (char_length(btrim("explanation")) >= 1 AND char_length("explanation") <= 1000))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quiz_options" (
        "id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "text" character varying(300) NOT NULL,
        CONSTRAINT "PK_quiz_options_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quiz_options_question_position" UNIQUE ("question_id", "position"),
        -- lets the question point at one of ITS OWN options
        CONSTRAINT "UQ_quiz_options_id_question" UNIQUE ("id", "question_id"),
        CONSTRAINT "FK_quiz_options_question" FOREIGN KEY ("question_id")
          REFERENCES "quiz_questions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "chk_quiz_options_position" CHECK ("position" BETWEEN 1 AND 6),
        CONSTRAINT "chk_quiz_options_text" CHECK (char_length(btrim("text")) >= 1)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "quiz_questions" ADD CONSTRAINT "FK_quiz_questions_correct_option"
        FOREIGN KEY ("correct_option_id", "id") REFERENCES "quiz_options" ("id", "question_id")
        ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED
    `);

    // A published quiz is frozen: no question or option may be added, changed or removed while it is PUBLISHED.
    await queryRunner.query(`
      CREATE FUNCTION "quiz_content_frozen_when_published"() RETURNS trigger AS $$
      DECLARE
        target_quiz uuid;
        frozen boolean;
      BEGIN
        IF TG_TABLE_NAME = 'quiz_questions' THEN
          target_quiz := COALESCE(NEW."quiz_id", OLD."quiz_id");
        ELSE
          SELECT q."quiz_id" INTO target_quiz FROM "quiz_questions" q
           WHERE q."id" = COALESCE(NEW."question_id", OLD."question_id");
        END IF;
        SELECT (z."status" = 'PUBLISHED') INTO frozen FROM "quizzes" z WHERE z."id" = target_quiz;
        IF frozen THEN
          RAISE EXCEPTION 'the content of a published quiz cannot be changed'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of ['quiz_questions', 'quiz_options']) {
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
          FOR EACH ROW EXECUTE FUNCTION "quiz_content_frozen_when_published"()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "quiz_questions" CASCADE`);
    await queryRunner.query(`DROP TABLE "quiz_options"`);
    await queryRunner.query(`DROP TABLE "quizzes"`);
    await queryRunner.query(
      `DROP FUNCTION "quiz_content_frozen_when_published"()`,
    );
  }
}
