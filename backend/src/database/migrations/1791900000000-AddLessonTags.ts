import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lesson tags (CMS-021): `lessons.tags`, a list of short labels used to organise lessons in the admin. Runs after CreateReusableBlocks1791890000000. MUST BE APPLIED before
 * the backend is used again: the lesson entity now reads this column, so every lesson query fails until it exists.
 *
 * One column on one table, nothing else touched:
 *  - `text[] NOT NULL DEFAULT '{}'`: every existing lesson gets an empty list (no tag is created or assigned for anyone), so no existing row changes meaning.
 *  - The number of tags is bounded by a CHECK (at most 10). Each tag's length, blank/duplicate (case-insensitive) rules and spelling are checked by the application on every
 *    write (PostgreSQL cannot express them in a CHECK on array elements); the stored text keeps the author's own capitalisation.
 *  - Tags are admin organisation only: they are not part of any published snapshot and no learner API reads them.
 *
 * ROLLBACK: down() drops the column and the tags in it. Nothing else is affected.
 */
export class AddLessonTags1791900000000 implements MigrationInterface {
  name = 'AddLessonTags1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lessons" ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "lessons" ADD CONSTRAINT "chk_lessons_tags" CHECK (cardinality("tags") <= 10)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lessons" DROP CONSTRAINT "chk_lessons_tags"`);
    await queryRunner.query(`ALTER TABLE "lessons" DROP COLUMN "tags"`);
  }
}
