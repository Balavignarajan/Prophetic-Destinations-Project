import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Batch 28.1: a Home Entry is now a TOPIC that holds many courses, instead of a card that opens one course. The link moves from the entry to the course:
 * `courses.home_entry_id` (optional) says which entry a course belongs to. Runs after CreateHomeEntries1791920000000, which stays exactly as it was applied.
 *
 * What changes:
 *  - `courses.home_entry_id uuid NULL`, a foreign key to `home_entries(id)` ON DELETE SET NULL (deleting an entry never deletes a course: its courses just become ordinary
 *    again) and a partial index on the column. Several courses may point at one entry; a course points at no entry or at one.
 *  - `home_entries.course_id` is dropped together with its foreign key and the two indexes built on it (`idx_home_entries_course_id` and the unique
 *    `uq_home_entries_course_title`, which only made sense while an entry opened one course). An entry may now have no courses at all.
 *  - NEW rule instead: entry titles are unique ignoring case and surrounding spaces (`uq_home_entries_title`), because the course forms pick an entry by its title and two
 *    identical names could not be told apart. It is created ONLY if the existing titles are already distinct; if they are not, the index is skipped (nothing is renamed or
 *    deleted for you) and the application enforces the same rule on every create and rename instead.
 *
 * WHAT HAPPENS TO THE EXISTING ASSIGNMENTS (nothing is invented and nothing is discarded):
 *  - Every existing entry linked exactly one course. That course gets `home_entry_id = <that entry>`. A course linked by ONE entry therefore keeps its relationship exactly:
 *    e.g. "Daniel" -> its course, and the disabled "Daniel - <course>" entries -> their own courses. No other course is assigned to anything.
 *  - Only the old design allowed SEVERAL entries to link the SAME course; a course can belong to just one entry now. For such a course the entry kept is chosen
 *    deterministically: an ENABLED entry before a disabled one, then the lower position, then the older entry, then the lower id. The other entries are NOT deleted: they stay as
 *    entries with no courses (still shown in the CMS as "No courses assigned"), and their old link is kept in the recovery table below.
 *  - `home_entry_legacy_links` (entry_id, course_id, applied): one row per entry that existed, with the course it used to open and whether that link was applied to
 *    `courses.home_entry_id` (`applied = true`) or lost the tie-break above (`false`). It has no foreign keys on purpose (it must not block deleting a course or an entry) and is
 *    never read by the application. It is only a record, and what `down()` restores from. It can be dropped once the new structure is accepted.
 *  - Titles, descriptions, images, enabled flags, positions and versions of every entry are untouched. Courses are changed in ONE column only, by a plain UPDATE: their status,
 *    version, content, order, modules, lessons, publications and snapshots are not touched, and learners see no difference (an entry is shown on Home only while one of its
 *    courses is published, which is exactly the course it linked before).
 *
 * ROLLBACK (`down()`): the entry -> one course link comes back from the recovery table (for entries whose course still exists), or else from the first course currently assigned
 * to the entry. An entry that has NO course to restore (created after this migration with no courses, or whose only course was deleted) cannot satisfy the old "an entry must
 * open a course" rule, so those entries are DELETED, and the second, third... courses of an entry that now holds several lose their entry. That is the only data `down()` can lose.
 */
export class MoveHomeEntryLinkToCourses1791930000000 implements MigrationInterface {
  name = 'MoveHomeEntryLinkToCourses1791930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Record the old links BEFORE anything changes (one row per entry; applied is set below).
    await queryRunner.query(`
      CREATE TABLE "home_entry_legacy_links" (
        "entry_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "applied" boolean NOT NULL DEFAULT false,
        "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_home_entry_legacy_links_entry_id" PRIMARY KEY ("entry_id")
      )
    `);
    await queryRunner.query(`INSERT INTO "home_entry_legacy_links" ("entry_id", "course_id") SELECT "id", "course_id" FROM "home_entries"`);

    // 2. The new column (nullable: every course starts with no entry), then the assignments.
    await queryRunner.query(`ALTER TABLE "courses" ADD COLUMN "home_entry_id" uuid`);
    await queryRunner.query(`
      UPDATE "courses" c SET "home_entry_id" = r."entry_id"
        FROM (
          SELECT h."id" AS "entry_id", h."course_id",
                 row_number() OVER (PARTITION BY h."course_id" ORDER BY h."is_enabled" DESC, h."position", h."created_at", h."id") AS "rn"
            FROM "home_entries" h
        ) r
       WHERE r."rn" = 1 AND r."course_id" = c."id"
    `);
    await queryRunner.query(`
      UPDATE "home_entry_legacy_links" l SET "applied" = true
        FROM "courses" c WHERE c."id" = l."course_id" AND c."home_entry_id" = l."entry_id"
    `);

    // 3. The foreign key and index on the new column.
    await queryRunner.query(`
      ALTER TABLE "courses" ADD CONSTRAINT "FK_courses_home_entry_id" FOREIGN KEY ("home_entry_id")
        REFERENCES "home_entries" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "idx_courses_home_entry_id" ON "courses" ("home_entry_id") WHERE "home_entry_id" IS NOT NULL`);

    // 4. An entry no longer links a course: drop the column (and with it its foreign key) and the indexes built on it.
    await queryRunner.query(`DROP INDEX "uq_home_entries_course_title"`);
    await queryRunner.query(`DROP INDEX "idx_home_entries_course_id"`);
    await queryRunner.query(`ALTER TABLE "home_entries" DROP COLUMN "course_id"`);

    // 5. Titles unique ignoring case, but only when that is already true (see the header).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM "home_entries" GROUP BY lower(btrim("title")) HAVING count(*) > 1) THEN
          CREATE UNIQUE INDEX "uq_home_entries_title" ON "home_entries" (lower(btrim("title")));
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. The old "an entry opens one course" column, restored in three steps (nullable until it can be filled).
    await queryRunner.query(`ALTER TABLE "home_entries" ADD COLUMN "course_id" uuid`);
    await queryRunner.query(`
      UPDATE "home_entries" h SET "course_id" = l."course_id"
        FROM "home_entry_legacy_links" l
       WHERE l."entry_id" = h."id" AND EXISTS (SELECT 1 FROM "courses" c WHERE c."id" = l."course_id")
    `);
    await queryRunner.query(`
      UPDATE "home_entries" h SET "course_id" = x."course_id"
        FROM (
          SELECT DISTINCT ON ("home_entry_id") "home_entry_id", "id" AS "course_id"
            FROM "courses" WHERE "home_entry_id" IS NOT NULL
           ORDER BY "home_entry_id", "position", "id"
        ) x
       WHERE x."home_entry_id" = h."id" AND h."course_id" IS NULL
    `);
    // An entry with no course to restore cannot exist under the old rule.
    await queryRunner.query(`DELETE FROM "home_entries" WHERE "course_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "home_entries" ALTER COLUMN "course_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "home_entries" ADD CONSTRAINT "FK_home_entries_course_id" FOREIGN KEY ("course_id")
        REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "idx_home_entries_course_id" ON "home_entries" ("course_id")`);

    // 2. The old uniqueness rule replaces the new one.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_home_entries_title"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_home_entries_course_title" ON "home_entries" ("course_id", lower(btrim("title")))`);

    // 3. The course side goes away, then the record of the old links.
    await queryRunner.query(`DROP INDEX "idx_courses_home_entry_id"`);
    await queryRunner.query(`ALTER TABLE "courses" DROP CONSTRAINT "FK_courses_home_entry_id", DROP COLUMN "home_entry_id"`);
    await queryRunner.query(`DROP TABLE "home_entry_legacy_links"`);
  }
}
