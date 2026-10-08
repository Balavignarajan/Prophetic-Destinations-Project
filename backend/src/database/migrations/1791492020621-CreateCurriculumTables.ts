import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Curriculum tables only: `courses` and `course_modules`.
 * Touches nothing else. down() removes exactly what up() creates.
 */
export class CreateCurriculumTables1791492020621 implements MigrationInterface {
  name = 'CreateCurriculumTables1791492020621';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "courses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(200) NOT NULL,
        "description" text,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_courses_id" PRIMARY KEY ("id"),
        CONSTRAINT "chk_courses_title"
          CHECK (btrim("title") <> '' AND char_length("title") <= 200),
        CONSTRAINT "chk_courses_status"
          CHECK ("status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_courses_created_at_id" ON "courses" ("created_at", "id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "course_modules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "position" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_course_modules_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_course_modules_course_id" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "UQ_course_modules_course_id_position"
          UNIQUE ("course_id", "position") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "chk_course_modules_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_course_modules_title"
          CHECK (btrim("title") <> '' AND char_length("title") <= 200),
        CONSTRAINT "chk_course_modules_status"
          CHECK ("status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'))
      )
    `);
    // The unique constraint above also serves lookups by (course_id) and (course_id, position).
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "course_modules"`);
    await queryRunner.query(`DROP INDEX "idx_courses_created_at_id"`);
    await queryRunner.query(`DROP TABLE "courses"`);
  }
}
