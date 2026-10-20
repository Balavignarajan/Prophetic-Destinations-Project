import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Library lessons: a lesson with no course (and therefore no module) is a standalone authoring source that is copied into a course or module
 * to be published. This only relaxes `lessons.course_id` to nullable and adds rules around it; it adds no table or column and changes no row,
 * so every existing lesson, position and published snapshot stays exactly as it is.
 *
 *  - chk_lessons_library_has_no_module: a lesson without a course cannot name a module.
 *  - The position unique indexes already ignore these rows (UQ_lessons_course_direct_position is on (course_id, position), where NULL course ids
 *    never collide; UQ_lessons_module_position needs a module).
 *  - lesson_publications.course_id stays NOT NULL, so a library lesson cannot have a publication; the trigger below makes the reason explicit.
 *  - IX_lessons_library_updated serves the library list (newest change first).
 *
 * down() puts NOT NULL back and fails (changing nothing) if any library lesson exists: they are never deleted to make a rollback succeed.
 */
export class AddLibraryLessons1791850000000 implements MigrationInterface {
  name = 'AddLibraryLessons1791850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lessons" ALTER COLUMN "course_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD CONSTRAINT "chk_lessons_library_has_no_module" CHECK ("course_id" IS NOT NULL OR "module_id" IS NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_lessons_library_updated" ON "lessons" ("updated_at" DESC) WHERE "course_id" IS NULL`,
    );
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "lesson_publications_require_placed_lesson"() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "lessons" l WHERE l."id" = NEW."lesson_id" AND l."course_id" IS NULL) THEN
          RAISE EXCEPTION 'a library lesson cannot be published; copy it into a course or module first'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `CREATE TRIGGER "trg_lesson_publications_require_placed_lesson" BEFORE INSERT ON "lesson_publications" FOR EACH ROW EXECUTE FUNCTION "lesson_publications_require_placed_lesson"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "trg_lesson_publications_require_placed_lesson" ON "lesson_publications"`);
    await queryRunner.query(`DROP FUNCTION "lesson_publications_require_placed_lesson"()`);
    await queryRunner.query(`DROP INDEX "IX_lessons_library_updated"`);
    await queryRunner.query(`ALTER TABLE "lessons" DROP CONSTRAINT "chk_lessons_library_has_no_module"`);
    await queryRunner.query(`ALTER TABLE "lessons" ALTER COLUMN "course_id" SET NOT NULL`);
  }
}
