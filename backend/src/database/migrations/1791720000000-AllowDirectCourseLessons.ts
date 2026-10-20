import { MigrationInterface, QueryRunner } from 'typeorm';

/** Makes course ownership explicit while retaining every existing module lesson and publication unchanged. */
export class AllowDirectCourseLessons1791720000000 implements MigrationInterface {
  name = 'AllowDirectCourseLessons1791720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lessons" ADD COLUMN "course_id" uuid`);
    await queryRunner.query(`
      UPDATE "lessons" l SET "course_id" = m."course_id"
        FROM "course_modules" m WHERE m."id" = l."module_id"
    `);
    const [{ missing }]: { missing: number }[] = await queryRunner.query(
      `SELECT count(*)::int AS "missing" FROM "lessons" WHERE "course_id" IS NULL`,
    );
    if (missing > 0) throw new Error(`Cannot backfill course ownership for ${missing} lesson(s)`);
    await queryRunner.query(`ALTER TABLE "lessons" ALTER COLUMN "course_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "lessons" ADD CONSTRAINT "FK_lessons_course_id"
        FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`ALTER TABLE "lessons" ALTER COLUMN "module_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "lessons" DROP CONSTRAINT "UQ_lessons_module_id_position"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_lessons_module_position" ON "lessons" ("module_id", "position")
        WHERE "module_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_lessons_course_direct_position" ON "lessons" ("course_id", "position")
        WHERE "module_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "lessons_module_belongs_to_course"() RETURNS trigger AS $$
      BEGIN
        IF NEW."module_id" IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM "course_modules" m WHERE m."id" = NEW."module_id" AND m."course_id" = NEW."course_id"
        ) THEN RAISE EXCEPTION 'lesson module must belong to its course' USING ERRCODE = 'foreign_key_violation'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`CREATE TRIGGER "trg_lessons_module_belongs_to_course" BEFORE INSERT OR UPDATE OF "course_id", "module_id" ON "lessons" FOR EACH ROW EXECUTE FUNCTION "lessons_module_belongs_to_course"()`);

    await queryRunner.query(`ALTER TABLE "lesson_publications" ADD COLUMN "course_id" uuid`);
    // The publication history is append-only: trg_lesson_publications_guard refuses any UPDATE that is not the single end-of-life update, which would also
    // refuse this one-off backfill of the NEW column on a database that already holds publications. The guard is switched off for this one statement only,
    // inside this migration's transaction (so it is back on, or the whole migration is rolled back, before anything else can run), and the backfill copies
    // the owning course of each publication's lesson: no existing column of any publication changes.
    await queryRunner.query(`ALTER TABLE "lesson_publications" DISABLE TRIGGER "trg_lesson_publications_guard"`);
    await queryRunner.query(`UPDATE "lesson_publications" p SET "course_id" = l."course_id" FROM "lessons" l WHERE l."id" = p."lesson_id"`);
    // Deferred constraint checks queued by the UPDATE must run before the trigger can be altered again (PostgreSQL refuses ALTER TABLE with pending trigger events).
    await queryRunner.query(`SET CONSTRAINTS ALL IMMEDIATE`);
    await queryRunner.query(`ALTER TABLE "lesson_publications" ENABLE TRIGGER "trg_lesson_publications_guard"`);
    await queryRunner.query(`ALTER TABLE "lesson_publications" ALTER COLUMN "course_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "lesson_publications" ADD CONSTRAINT "FK_lesson_publications_course_id" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "lesson_publications" ALTER COLUMN "module_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lesson_publications" ALTER COLUMN "module_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "lesson_publications" DROP CONSTRAINT "FK_lesson_publications_course_id", DROP COLUMN "course_id"`);
    await queryRunner.query(`DROP TRIGGER "trg_lessons_module_belongs_to_course" ON "lessons"`);
    await queryRunner.query(`DROP FUNCTION "lessons_module_belongs_to_course"()`);
    await queryRunner.query(`DROP INDEX "UQ_lessons_course_direct_position", "UQ_lessons_module_position"`);
    await queryRunner.query(`ALTER TABLE "lessons" ADD CONSTRAINT "UQ_lessons_module_id_position" UNIQUE ("module_id", "position") DEFERRABLE INITIALLY IMMEDIATE`);
    await queryRunner.query(`ALTER TABLE "lessons" ALTER COLUMN "module_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "lessons" DROP CONSTRAINT "FK_lessons_course_id", DROP COLUMN "course_id"`);
  }
}
