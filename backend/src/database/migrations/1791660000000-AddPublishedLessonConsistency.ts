import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Database-level consistency between a lesson's status and its publications.
 *
 * The one rule that always holds: a lesson whose status is PUBLISHED has an active publication.
 * It is checked when the transaction commits (DEFERRABLE INITIALLY DEFERRED constraint triggers), so a
 * publish or unpublish may order its writes freely inside the transaction, and it is checked from both
 * sides: when a lesson becomes PUBLISHED, and when a publication is inserted or ended.
 *
 * Deliberately NOT constrained, because these are valid lifecycle states: any status with an older
 * publication still active. After an authoring edit the working copy returns to DRAFT (and may then be
 * READY_FOR_REVIEW or APPROVED again) while the previously published version keeps serving, until it is
 * replaced or unpublished. Likewise the other direction needs no rule: nothing requires an APPROVED lesson to be unpublished.
 *
 * Adds no table or column and touches no row. Lessons already PUBLISHED without an active publication
 * (none can exist, no code path creates them) would only be caught on their next status or publication write.
 */
export class AddPublishedLessonConsistency1791660000000 implements MigrationInterface {
  name = 'AddPublishedLessonConsistency1791660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION "lesson_published_requires_active_publication"() RETURNS trigger AS $$
      DECLARE
        target uuid;
      BEGIN
        IF TG_TABLE_NAME = 'lessons' THEN
          target := NEW."id";
        ELSE
          target := NEW."lesson_id";
        END IF;
        IF EXISTS (SELECT 1 FROM "lessons" WHERE "id" = target AND "status" = 'PUBLISHED')
           AND NOT EXISTS (
             SELECT 1 FROM "lesson_publications" WHERE "lesson_id" = target AND "ended_at" IS NULL
           ) THEN
          RAISE EXCEPTION 'a PUBLISHED lesson must have an active publication'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_lessons_published_has_publication"
        AFTER INSERT OR UPDATE OF "status" ON "lessons"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION "lesson_published_requires_active_publication"()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_lesson_publications_keep_published_lesson"
        AFTER INSERT OR UPDATE ON "lesson_publications"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION "lesson_published_requires_active_publication"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_publications_keep_published_lesson" ON "lesson_publications"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_lessons_published_has_publication" ON "lessons"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "lesson_published_requires_active_publication"()`,
    );
  }
}
