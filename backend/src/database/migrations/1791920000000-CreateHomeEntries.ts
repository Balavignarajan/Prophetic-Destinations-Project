import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dynamic Home Entries (Batch 28): the cards on the learner Home screen are now managed in the Admin CMS instead of being the two fixed Daniel and Revelation buttons.
 * Runs after CreateLessonDraftRevisions1791910000000. MUST BE APPLIED before the updated backend serves Home Entries or deletes a course (the admin Home Entries screen and
 * GET /home-entries answer with an error until then; every other route keeps working, and a course delete treats a missing table as "no entries").
 *
 * One new table; nothing existing is changed or dropped:
 *  - `home_entries`: one learner Home card. `title` is what the card says, `description` an optional line under it, `course_id` the course it opens, `image_media_id` an optional
 *    picture that replaces the course cover on the card, `position` the 1-based place on Home (gap-free after every reorder, like courses.position), `is_enabled` hides a card
 *    without deleting it. `version` is optimistic concurrency, like courses.
 *  - No limit on the number of entries. Several entries may open the same course (with different titles); the same course with the same title (ignoring case and surrounding
 *    spaces) is refused by a unique index, so an exact duplicate card cannot be created by accident.
 *  - `course_id` and `image_media_id` are foreign keys with ON DELETE RESTRICT: a course or a media file that a Home Entry uses cannot be deleted from under it (the application
 *    checks first and gives a readable message; this is the backstop).
 *
 * LEGACY DATA (courses."book" = 'DANIEL' | 'REVELATION', the old fixed Home entries). The column is NOT dropped, changed or read-modified: it stays as a frozen record, no screen or
 * endpoint can edit it any more, and the public catalog keeps serving it unchanged so mobile builds that were released before this batch still show their Daniel and Revelation
 * buttons (those builds are the only readers left). The assignments are copied into Home Entries, never moved:
 *  - The old rule showed, for each book, the FIRST course carrying it in the published course order at the learner's level. So for each book the entry that is copied ENABLED
 *    links the course that rule would pick first: a course with an active catalog publication before one without, then courses.position, then the date the course was first
 *    published, then the id (the same order the learner catalog lists courses in). Titles are "Daniel" and "Revelation"; Daniel is placed before Revelation.
 *  - Every OTHER course that carried the same book is kept as an extra entry titled "<Book> - <course title>", DISABLED, placed after the enabled ones. It changes nothing on
 *    the learner Home (the old app never showed it either), and an administrator can enable or delete it. So no assignment is silently lost.
 *  - A course that is not published yet still gets its entry: the card appears by itself once the course is published (the public list only returns entries whose course is
 *    published and has lessons at the learner's level).
 *  - Nothing is inserted when no course carries a book (a fresh database gets an empty table). ON CONFLICT DO NOTHING makes the copy safe to repeat.
 *
 * No course, lesson, publication, snapshot, level, progress or media row is touched.
 *
 * ROLLBACK: down() drops the table and every entry in it, including entries made in the CMS. Because courses."book" was never changed, the old behaviour is fully restored
 * (as it was at the time of this migration; assignments edited in the CMS afterwards are not written back to the legacy column).
 */
export class CreateHomeEntries1791920000000 implements MigrationInterface {
  name = 'CreateHomeEntries1791920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "home_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(120) NOT NULL,
        "description" character varying(500),
        "course_id" uuid NOT NULL,
        "image_media_id" uuid,
        "position" integer NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_home_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_home_entries_course_id" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_home_entries_image_media_id" FOREIGN KEY ("image_media_id")
          REFERENCES "media_assets" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_home_entries_title" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
        CONSTRAINT "chk_home_entries_description" CHECK ("description" IS NULL OR char_length(btrim("description")) BETWEEN 1 AND 500),
        CONSTRAINT "chk_home_entries_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_home_entries_version" CHECK ("version" >= 1)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_home_entries_position_id" ON "home_entries" ("position", "id")`);
    await queryRunner.query(`CREATE INDEX "idx_home_entries_course_id" ON "home_entries" ("course_id")`);
    await queryRunner.query(`CREATE INDEX "idx_home_entries_image_media_id" ON "home_entries" ("image_media_id") WHERE "image_media_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_home_entries_course_title" ON "home_entries" ("course_id", lower(btrim("title")))`);

    // Copy the legacy Daniel / Revelation assignments (see the header). "published" = the course has an active catalog publication, which is what the learner catalog lists.
    await queryRunner.query(`
      INSERT INTO "home_entries" ("title", "course_id", "position", "is_enabled")
      SELECT x."title", x."course_id",
             row_number() OVER (ORDER BY x."group_order", x."book_order", x."rn", x."course_id")::int,
             x."is_enabled"
        FROM (
          SELECT l."course_id", l."rn",
                 CASE WHEN l."rn" = 1 THEN 0 ELSE 1 END AS "group_order",
                 CASE l."book" WHEN 'DANIEL' THEN 1 ELSE 2 END AS "book_order",
                 (l."rn" = 1) AS "is_enabled",
                 CASE WHEN l."rn" = 1
                      THEN CASE l."book" WHEN 'DANIEL' THEN 'Daniel' ELSE 'Revelation' END
                      ELSE btrim(left((CASE l."book" WHEN 'DANIEL' THEN 'Daniel' ELSE 'Revelation' END) || ' - ' || l."course_title", 120))
                 END AS "title"
            FROM (
              SELECT b."course_id", b."book", b."course_title",
                     row_number() OVER (
                       PARTITION BY b."book"
                       ORDER BY b."not_published", b."position", b."first_published_at" NULLS LAST, b."course_id"
                     ) AS "rn"
                FROM (
                  SELECT c."id" AS "course_id", c."book", c."title" AS "course_title", c."position",
                         NOT EXISTS (SELECT 1 FROM "course_publications" p WHERE p."course_id" = c."id" AND p."ended_at" IS NULL) AS "not_published",
                         (SELECT min(f."published_at") FROM "course_publications" f WHERE f."course_id" = c."id") AS "first_published_at"
                    FROM "courses" c
                   WHERE c."book" IN ('DANIEL', 'REVELATION')
                ) b
            ) l
        ) x
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "home_entries"`);
  }
}
