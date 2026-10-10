import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lesson publications: one row per published version of a lesson, and one immutable,
 * self-contained snapshot row per learning level of that version. History is retained
 * indefinitely, so every foreign key is RESTRICT and a lesson (or an admin) that has
 * publication history can never be deleted.
 *
 * The database itself enforces the lifecycle, not only the application:
 *  - at most one active publication per lesson (partial unique index),
 *  - versions are unique per lesson,
 *  - a publication is ended at most once and never reactivated; nothing else about it changes,
 *  - snapshots (level rows) can be neither updated, deleted, truncated nor added to an ended publication,
 *  - a level row can only belong to a publication of the same lesson (composite foreign key).
 *
 * It also links workflow events to the publication they published or ended. down() removes
 * exactly what up() creates; once real publications exist it destroys their history, so treat
 * it as forward-only from then on.
 */
export class CreateLessonPublications1791641000000 implements MigrationInterface {
  name = 'CreateLessonPublications1791641000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lesson_publications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "lesson_id" uuid NOT NULL,
        "version" integer NOT NULL,
        -- the module the lesson belonged to when published (context only, not a relation)
        "module_id" uuid NOT NULL,
        -- the lesson's content_revision that was published
        "source_content_revision" integer NOT NULL,
        "snapshot_schema_version" integer NOT NULL,
        "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        "published_by" uuid NOT NULL,
        "ended_at" TIMESTAMP WITH TIME ZONE,
        "ended_by" uuid,
        "ended_reason" character varying(20),
        CONSTRAINT "PK_lesson_publications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lesson_publications_lesson_version" UNIQUE ("lesson_id", "version"),
        -- lets child rows prove they belong to the same lesson as their publication
        CONSTRAINT "UQ_lesson_publications_id_lesson" UNIQUE ("id", "lesson_id"),
        CONSTRAINT "FK_lesson_publications_lesson_id" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_lesson_publications_published_by" FOREIGN KEY ("published_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_lesson_publications_ended_by" FOREIGN KEY ("ended_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_publications_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_lesson_publications_source_revision" CHECK ("source_content_revision" >= 1),
        CONSTRAINT "chk_lesson_publications_schema_version" CHECK ("snapshot_schema_version" >= 1),
        CONSTRAINT "chk_lesson_publications_ended_reason" CHECK
          ("ended_reason" IS NULL OR "ended_reason" IN ('SUPERSEDED', 'UNPUBLISHED')),
        -- the three end fields are all set or all null
        CONSTRAINT "chk_lesson_publications_end_fields" CHECK (
          ("ended_at" IS NULL) = ("ended_by" IS NULL)
          AND ("ended_at" IS NULL) = ("ended_reason" IS NULL)
        ),
        CONSTRAINT "chk_lesson_publications_end_after_start" CHECK
          ("ended_at" IS NULL OR "ended_at" >= "published_at")
      )
    `);
    // At most one active publication per lesson, even if application locking were bypassed.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_lesson_publications_active"
        ON "lesson_publications" ("lesson_id") WHERE "ended_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "lesson_publication_levels" (
        "publication_id" uuid NOT NULL,
        "lesson_id" uuid NOT NULL,
        "level" character varying(20) NOT NULL,
        -- the complete resolved lesson at this level (self-contained)
        "content" jsonb NOT NULL,
        -- sha256 (hex) of the canonical, sorted-key serialization of the content
        "content_hash" character(64) NOT NULL,
        -- size of that canonical serialization in UTF-8 bytes (at most 5 MiB)
        "content_bytes" integer NOT NULL,
        CONSTRAINT "PK_lesson_publication_levels" PRIMARY KEY ("publication_id", "level"),
        CONSTRAINT "FK_lesson_publication_levels_publication" FOREIGN KEY ("publication_id", "lesson_id")
          REFERENCES "lesson_publications" ("id", "lesson_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_lesson_publication_levels_level" CHECK
          ("level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
        CONSTRAINT "chk_lesson_publication_levels_content" CHECK (jsonb_typeof("content") = 'object'),
        CONSTRAINT "chk_lesson_publication_levels_hash" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_lesson_publication_levels_bytes" CHECK
          ("content_bytes" BETWEEN 1 AND 5242880)
      )
    `);

    // A publication can only be ended, once; nothing else about it ever changes; it is never deleted.
    await queryRunner.query(`
      CREATE FUNCTION "lesson_publications_guard"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP <> 'UPDATE' THEN
          RAISE EXCEPTION 'lesson_publications history cannot be deleted or truncated'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF OLD."ended_at" IS NOT NULL THEN
          RAISE EXCEPTION 'an ended publication is immutable'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF NEW."ended_at" IS NULL THEN
          RAISE EXCEPTION 'a publication can only be ended, never changed otherwise'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF (to_jsonb(NEW) - 'ended_at' - 'ended_by' - 'ended_reason')
           IS DISTINCT FROM (to_jsonb(OLD) - 'ended_at' - 'ended_by' - 'ended_reason') THEN
          RAISE EXCEPTION 'only the end fields of a publication may be set'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_publications_guard"
        BEFORE UPDATE OR DELETE ON "lesson_publications"
        FOR EACH ROW EXECUTE FUNCTION "lesson_publications_guard"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_publications_no_truncate"
        BEFORE TRUNCATE ON "lesson_publications"
        FOR EACH STATEMENT EXECUTE FUNCTION "lesson_publications_guard"()
    `);

    // Snapshots are immutable, and cannot be added to a publication that has already ended.
    await queryRunner.query(`
      CREATE FUNCTION "lesson_publication_levels_guard"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF EXISTS (
            SELECT 1 FROM "lesson_publications"
             WHERE "id" = NEW."publication_id" AND "ended_at" IS NOT NULL
          ) THEN
            RAISE EXCEPTION 'snapshots cannot be added to an ended publication'
              USING ERRCODE = 'integrity_constraint_violation';
          END IF;
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'lesson_publication_levels snapshots are immutable'
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_publication_levels_guard"
        BEFORE INSERT OR UPDATE OR DELETE ON "lesson_publication_levels"
        FOR EACH ROW EXECUTE FUNCTION "lesson_publication_levels_guard"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_lesson_publication_levels_no_truncate"
        BEFORE TRUNCATE ON "lesson_publication_levels"
        FOR EACH STATEMENT EXECUTE FUNCTION "lesson_publication_levels_guard"()
    `);

    // Workflow events of a publish/unpublish point at the publication they created/ended.
    await queryRunner.query(
      `ALTER TABLE "lesson_workflow_events" ADD COLUMN "publication_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "lesson_workflow_events"
        ADD CONSTRAINT "FK_lesson_workflow_events_publication" FOREIGN KEY ("publication_id", "lesson_id")
          REFERENCES "lesson_publications" ("id", "lesson_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        ADD CONSTRAINT "chk_lesson_workflow_events_publication" CHECK
          (("publication_id" IS NOT NULL) = ("action" IN ('PUBLISH', 'UNPUBLISH')))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lesson_workflow_events"
        DROP CONSTRAINT "chk_lesson_workflow_events_publication",
        DROP CONSTRAINT "FK_lesson_workflow_events_publication"
    `);
    await queryRunner.query(
      `ALTER TABLE "lesson_workflow_events" DROP COLUMN "publication_id"`,
    );

    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_publication_levels_no_truncate" ON "lesson_publication_levels"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_publication_levels_guard" ON "lesson_publication_levels"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "lesson_publication_levels_guard"()`,
    );
    await queryRunner.query(`DROP TABLE "lesson_publication_levels"`);

    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_publications_no_truncate" ON "lesson_publications"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_lesson_publications_guard" ON "lesson_publications"`,
    );
    await queryRunner.query(`DROP FUNCTION "lesson_publications_guard"()`);
    await queryRunner.query(`DROP INDEX "uq_lesson_publications_active"`);
    await queryRunner.query(`DROP TABLE "lesson_publications"`);
  }
}
