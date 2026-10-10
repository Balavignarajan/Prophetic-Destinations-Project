import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lesson blocks only: the `lesson_blocks` table and the trigger that keeps a
 * block's type immutable. References `lessons` but does not alter it.
 * down() removes exactly what up() creates.
 */
export class CreateLessonBlocksTable1791495283678 implements MigrationInterface {
  name = 'CreateLessonBlocksTable1791495283678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lesson_blocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "lesson_id" uuid NOT NULL,
        "type" character varying(40) NOT NULL,
        "position" integer NOT NULL,
        "shared_content" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_lesson_blocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lesson_blocks_lesson_id" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "UQ_lesson_blocks_lesson_id_position"
          UNIQUE ("lesson_id", "position") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "chk_lesson_blocks_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_lesson_blocks_type" CHECK ("type" IN (
          'RICH_TEXT', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION',
          'IMAGE', 'INTERACTIVE_IMAGE', 'SYMBOL_STUDY', 'WORD_STUDY', 'MAP', 'TIMELINE',
          'PROPHECY_EQUIVALENCE', 'PROPHECY_CALCULATION', 'PROPHECY_COMPARISON',
          'NARRATIVE_SCENE', 'EXPLORE_DEEPER', 'REFLECTION_STUDY_ACTIVITY', 'SUMMARY', 'QUIZ'
        )),
        CONSTRAINT "chk_lesson_blocks_shared_content" CHECK (
          "shared_content" IS NULL
          OR (jsonb_typeof("shared_content") = 'object' AND octet_length("shared_content"::text) <= 200000)
        )
      )
    `);
    // The unique constraint above also serves lookups by (lesson_id) and (lesson_id, position).

    // A block's type never changes after creation (a different type means a different content shape).
    await queryRunner.query(`
      CREATE FUNCTION "lesson_blocks_prevent_type_change"() RETURNS trigger AS $$
      BEGIN
        IF NEW."type" IS DISTINCT FROM OLD."type" THEN
          RAISE EXCEPTION 'lesson_blocks.type is immutable' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_blocks_type_immutable"
        BEFORE UPDATE OF "type" ON "lesson_blocks"
        FOR EACH ROW EXECUTE FUNCTION "lesson_blocks_prevent_type_change"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_blocks_type_immutable" ON "lesson_blocks"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "lesson_blocks_prevent_type_change"()`,
    );
    await queryRunner.query(`DROP TABLE "lesson_blocks"`);
  }
}
