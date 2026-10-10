import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lesson tables only: `lessons` and `lesson_levels`.
 * References `course_modules` (curriculum) but does not alter it.
 * down() removes exactly what up() creates.
 */
export class CreateLessonsTables1791493882971 implements MigrationInterface {
  name = 'CreateLessonsTables1791493882971';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lessons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "module_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "short_title" character varying(100),
        "subtitle" character varying(300),
        "introduction" text,
        "cover_media_id" uuid,
        "estimated_minutes" integer,
        "position" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_lessons_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lessons_module_id" FOREIGN KEY ("module_id")
          REFERENCES "course_modules" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "UQ_lessons_module_id_position"
          UNIQUE ("module_id", "position") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "chk_lessons_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_lessons_title"
          CHECK ("title" !~ '^\\s*$' AND char_length("title") <= 200),
        CONSTRAINT "chk_lessons_short_title"
          CHECK ("short_title" IS NULL OR ("short_title" !~ '^\\s*$' AND char_length("short_title") <= 100)),
        CONSTRAINT "chk_lessons_subtitle"
          CHECK ("subtitle" IS NULL OR ("subtitle" !~ '^\\s*$' AND char_length("subtitle") <= 300)),
        CONSTRAINT "chk_lessons_introduction"
          CHECK ("introduction" IS NULL OR ("introduction" !~ '^\\s*$' AND char_length("introduction") <= 5000)),
        CONSTRAINT "chk_lessons_estimated_minutes"
          CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0),
        CONSTRAINT "chk_lessons_status"
          CHECK ("status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'))
      )
    `);
    // The unique constraint above also serves lookups by (module_id) and (module_id, position).
    // cover_media_id has no foreign key yet: the media table does not exist. The Media migration adds it.

    await queryRunner.query(`
      CREATE TABLE "lesson_levels" (
        "lesson_id" uuid NOT NULL,
        "level" character varying(20) NOT NULL,
        CONSTRAINT "PK_lesson_levels" PRIMARY KEY ("lesson_id", "level"),
        CONSTRAINT "FK_lesson_levels_lesson_id" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_levels_level"
          CHECK ("level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lesson_levels"`);
    await queryRunner.query(`DROP TABLE "lessons"`);
  }
}
