import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Course/module publishing: immutable catalog snapshots and their workflow history.
 *
 *  - `course_publications`: one row per catalog version of a course. At most one is active per course.
 *  - `course_publication_modules`: the modules a version lists, with their published title/description
 *    (so a new version can carry an unchanged module over without ever reading its working copy).
 *  - `course_publication_levels`: one stored snapshot per learning level, with its SHA-256 and size.
 *  - `catalog_workflow_events`: append-only audit trail of course and module transitions.
 *
 * Same guarantees as lesson publications: a publication can only be ended, once, and never reactivated or
 * changed; snapshots and memberships can never be updated, deleted, truncated or added to an ended publication;
 * every foreign key is RESTRICT, so a course or module with catalog history cannot be deleted. Also: a PUBLISHED
 * course has an active catalog publication (checked at commit). Nothing here changes a lesson, a lesson
 * publication or an existing row.
 *
 * Adds one unique key to `course_modules (id, course_id)`, so rows that name a module AND a course must agree.
 *
 * down() removes exactly what up() creates; once real catalog history exists it destroys it, so treat it as
 * forward-only from then on.
 */
export class CreateCatalogPublications1791670000000 implements MigrationInterface {
  name = 'CreateCatalogPublications1791670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course_modules"
        ADD CONSTRAINT "UQ_course_modules_id_course_id" UNIQUE ("id", "course_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "course_publications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_id" uuid NOT NULL,
        "version" integer NOT NULL,
        -- what created this version: the course published, or a module published / unpublished
        "cause" character varying(30) NOT NULL,
        "snapshot_schema_version" integer NOT NULL,
        -- the course as published (what the catalog shows), never read back from the working copy
        "course_title" character varying(200) NOT NULL,
        "course_description" text,
        -- courses.version when the version was created (audit only)
        "source_course_version" integer NOT NULL,
        "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        "published_by" uuid NOT NULL,
        "ended_at" TIMESTAMP WITH TIME ZONE,
        "ended_by" uuid,
        "ended_reason" character varying(20),
        CONSTRAINT "PK_course_publications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_course_publications_course_version" UNIQUE ("course_id", "version"),
        CONSTRAINT "UQ_course_publications_id_course" UNIQUE ("id", "course_id"),
        CONSTRAINT "FK_course_publications_course_id" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_course_publications_published_by" FOREIGN KEY ("published_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_course_publications_ended_by" FOREIGN KEY ("ended_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_course_publications_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_course_publications_cause" CHECK
          ("cause" IN ('COURSE_PUBLISH', 'MODULE_PUBLISH', 'MODULE_UNPUBLISH')),
        CONSTRAINT "chk_course_publications_schema_version" CHECK ("snapshot_schema_version" >= 1),
        CONSTRAINT "chk_course_publications_source_version" CHECK ("source_course_version" >= 1),
        CONSTRAINT "chk_course_publications_ended_reason" CHECK
          ("ended_reason" IS NULL OR "ended_reason" IN ('SUPERSEDED', 'UNPUBLISHED')),
        CONSTRAINT "chk_course_publications_end_fields" CHECK (
          ("ended_at" IS NULL) = ("ended_by" IS NULL)
          AND ("ended_at" IS NULL) = ("ended_reason" IS NULL)
        ),
        CONSTRAINT "chk_course_publications_end_after_start" CHECK
          ("ended_at" IS NULL OR "ended_at" >= "published_at")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_course_publications_active"
        ON "course_publications" ("course_id") WHERE "ended_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "course_publication_modules" (
        "publication_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "module_id" uuid NOT NULL,
        -- ordinal in this version, 1..n (the order learners see)
        "position" integer NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        CONSTRAINT "PK_course_publication_modules" PRIMARY KEY ("publication_id", "module_id"),
        CONSTRAINT "UQ_course_publication_modules_position" UNIQUE ("publication_id", "position"),
        CONSTRAINT "FK_course_publication_modules_publication" FOREIGN KEY ("publication_id", "course_id")
          REFERENCES "course_publications" ("id", "course_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        -- the module really belongs to the course of its publication
        CONSTRAINT "FK_course_publication_modules_module" FOREIGN KEY ("module_id", "course_id")
          REFERENCES "course_modules" ("id", "course_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_course_publication_modules_position" CHECK ("position" >= 1)
      )
    `);
    // availability lookups ask "is this module in an active publication?"
    await queryRunner.query(`
      CREATE INDEX "idx_course_publication_modules_module"
        ON "course_publication_modules" ("module_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "course_publication_levels" (
        "publication_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "level" character varying(20) NOT NULL,
        "content" jsonb NOT NULL,
        "content_hash" character(64) NOT NULL,
        "content_bytes" integer NOT NULL,
        CONSTRAINT "PK_course_publication_levels" PRIMARY KEY ("publication_id", "level"),
        CONSTRAINT "FK_course_publication_levels_publication" FOREIGN KEY ("publication_id", "course_id")
          REFERENCES "course_publications" ("id", "course_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_course_publication_levels_level" CHECK
          ("level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
        CONSTRAINT "chk_course_publication_levels_content" CHECK (jsonb_typeof("content") = 'object'),
        CONSTRAINT "chk_course_publication_levels_hash" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_course_publication_levels_bytes" CHECK
          ("content_bytes" BETWEEN 1 AND 5242880)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "catalog_workflow_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seq" bigint GENERATED ALWAYS AS IDENTITY,
        -- always the course; a module event also names the module
        "course_id" uuid NOT NULL,
        "module_id" uuid,
        "action" character varying(30) NOT NULL,
        "from_status" character varying(20) NOT NULL,
        "to_status" character varying(20) NOT NULL,
        "actor_admin_id" uuid NOT NULL,
        "actor_role" character varying(20) NOT NULL,
        "note" text,
        -- the course's / module's own version at the moment of the transition
        "subject_version" integer NOT NULL,
        -- the catalog version this action created (publish, module actions) or ended (course unpublish)
        "publication_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT "PK_catalog_workflow_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalog_workflow_events_seq" UNIQUE ("seq"),
        CONSTRAINT "FK_catalog_workflow_events_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_catalog_workflow_events_module" FOREIGN KEY ("module_id", "course_id")
          REFERENCES "course_modules" ("id", "course_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_catalog_workflow_events_actor" FOREIGN KEY ("actor_admin_id")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_catalog_workflow_events_publication" FOREIGN KEY ("publication_id", "course_id")
          REFERENCES "course_publications" ("id", "course_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_catalog_workflow_events_action" CHECK ("action" IN
          ('SUBMIT_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'UNPUBLISH')),
        CONSTRAINT "chk_catalog_workflow_events_from_status" CHECK ("from_status" IN
          ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_catalog_workflow_events_to_status" CHECK ("to_status" IN
          ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_catalog_workflow_events_actor_role" CHECK ("actor_role" IN
          ('ADMIN', 'EDITOR', 'REVIEWER')),
        -- Only the approved transitions can ever be recorded (the same shapes as lesson events).
        CONSTRAINT "chk_catalog_workflow_events_transition" CHECK (
          ("action" = 'SUBMIT_FOR_REVIEW' AND "from_status" = 'DRAFT' AND "to_status" = 'READY_FOR_REVIEW')
          OR ("action" = 'REQUEST_CHANGES' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'DRAFT')
          OR ("action" = 'APPROVE' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'APPROVED')
          OR ("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')
          OR ("action" = 'UNPUBLISH' AND (
                ("from_status" = 'PUBLISHED' AND "to_status" = 'APPROVED')
                OR ("from_status" <> 'PUBLISHED' AND "to_status" = "from_status")))
        ),
        CONSTRAINT "chk_catalog_workflow_events_note_required"
          CHECK ("action" <> 'REQUEST_CHANGES' OR "note" IS NOT NULL),
        CONSTRAINT "chk_catalog_workflow_events_note"
          CHECK ("note" IS NULL OR ("note" !~ '^\\s*$' AND char_length("note") <= 2000)),
        CONSTRAINT "chk_catalog_workflow_events_subject_version" CHECK ("subject_version" >= 1),
        -- publish/unpublish always name the catalog version; review actions never do
        CONSTRAINT "chk_catalog_workflow_events_publication" CHECK
          (("publication_id" IS NOT NULL) = ("action" IN ('PUBLISH', 'UNPUBLISH')))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_catalog_workflow_events_course_seq" ON "catalog_workflow_events" ("course_id", "seq")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_catalog_workflow_events_module_seq" ON "catalog_workflow_events" ("module_id", "seq")
        WHERE "module_id" IS NOT NULL
    `);

    // ---- immutability ----------------------------------------------------------------------------------------

    // A catalog publication can only be ended, once; nothing else about it ever changes; it is never deleted.
    await queryRunner.query(`
      CREATE FUNCTION "course_publications_guard"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP <> 'UPDATE' THEN
          RAISE EXCEPTION 'course_publications history cannot be deleted or truncated'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF OLD."ended_at" IS NOT NULL THEN
          RAISE EXCEPTION 'an ended catalog publication is immutable'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF NEW."ended_at" IS NULL THEN
          RAISE EXCEPTION 'a catalog publication can only be ended, never changed otherwise'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF (to_jsonb(NEW) - 'ended_at' - 'ended_by' - 'ended_reason')
           IS DISTINCT FROM (to_jsonb(OLD) - 'ended_at' - 'ended_by' - 'ended_reason') THEN
          RAISE EXCEPTION 'only the end fields of a catalog publication may be set'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_course_publications_guard"
        BEFORE UPDATE OR DELETE ON "course_publications"
        FOR EACH ROW EXECUTE FUNCTION "course_publications_guard"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_course_publications_no_truncate"
        BEFORE TRUNCATE ON "course_publications"
        FOR EACH STATEMENT EXECUTE FUNCTION "course_publications_guard"()
    `);

    // Snapshots and module memberships are immutable and cannot be added to a publication that has ended.
    for (const table of [
      'course_publication_levels',
      'course_publication_modules',
    ]) {
      await queryRunner.query(`
        CREATE FUNCTION "${table}_guard"() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            IF EXISTS (
              SELECT 1 FROM "course_publications"
               WHERE "id" = NEW."publication_id" AND "ended_at" IS NOT NULL
            ) THEN
              RAISE EXCEPTION 'rows cannot be added to an ended catalog publication'
                USING ERRCODE = 'integrity_constraint_violation';
            END IF;
            RETURN NEW;
          END IF;
          RAISE EXCEPTION '${table} rows are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
        END;
        $$ LANGUAGE plpgsql
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_guard"
          BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
          FOR EACH ROW EXECUTE FUNCTION "${table}_guard"()
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_no_truncate"
          BEFORE TRUNCATE ON "${table}"
          FOR EACH STATEMENT EXECUTE FUNCTION "${table}_guard"()
      `);
    }

    await queryRunner.query(`
      CREATE FUNCTION "catalog_workflow_events_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'catalog_workflow_events is append-only'
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_catalog_workflow_events_append_only"
        BEFORE UPDATE OR DELETE ON "catalog_workflow_events"
        FOR EACH ROW EXECUTE FUNCTION "catalog_workflow_events_append_only"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_catalog_workflow_events_no_truncate"
        BEFORE TRUNCATE ON "catalog_workflow_events"
        FOR EACH STATEMENT EXECUTE FUNCTION "catalog_workflow_events_append_only"()
    `);

    // ---- consistency: a PUBLISHED course has an active catalog publication (checked at commit) ----------------
    // Deliberately NOT constrained: any other status with an older catalog version still active (the same valid
    // state as for lessons: an edited working copy goes back to DRAFT while the published version keeps serving),
    // and PUBLISHED modules after their course was unpublished.
    await queryRunner.query(`
      CREATE FUNCTION "course_published_requires_active_publication"() RETURNS trigger AS $$
      DECLARE
        target uuid;
      BEGIN
        IF TG_TABLE_NAME = 'courses' THEN
          target := NEW."id";
        ELSE
          target := NEW."course_id";
        END IF;
        IF EXISTS (SELECT 1 FROM "courses" WHERE "id" = target AND "status" = 'PUBLISHED')
           AND NOT EXISTS (
             SELECT 1 FROM "course_publications" WHERE "course_id" = target AND "ended_at" IS NULL
           ) THEN
          RAISE EXCEPTION 'a PUBLISHED course must have an active catalog publication'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_courses_published_has_publication"
        AFTER INSERT OR UPDATE OF "status" ON "courses"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION "course_published_requires_active_publication"()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_course_publications_keep_published_course"
        AFTER INSERT OR UPDATE ON "course_publications"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION "course_published_requires_active_publication"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "trg_course_publications_keep_published_course" ON "course_publications"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_courses_published_has_publication" ON "courses"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "course_published_requires_active_publication"()`,
    );

    await queryRunner.query(
      `DROP TRIGGER "trg_catalog_workflow_events_no_truncate" ON "catalog_workflow_events"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_catalog_workflow_events_append_only" ON "catalog_workflow_events"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "catalog_workflow_events_append_only"()`,
    );
    await queryRunner.query(`DROP TABLE "catalog_workflow_events"`);

    for (const table of [
      'course_publication_modules',
      'course_publication_levels',
    ]) {
      await queryRunner.query(
        `DROP TRIGGER "trg_${table}_no_truncate" ON "${table}"`,
      );
      await queryRunner.query(
        `DROP TRIGGER "trg_${table}_guard" ON "${table}"`,
      );
      await queryRunner.query(`DROP FUNCTION "${table}_guard"()`);
      await queryRunner.query(`DROP TABLE "${table}"`);
    }

    await queryRunner.query(
      `DROP TRIGGER "trg_course_publications_no_truncate" ON "course_publications"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "trg_course_publications_guard" ON "course_publications"`,
    );
    await queryRunner.query(`DROP FUNCTION "course_publications_guard"()`);
    await queryRunner.query(`DROP INDEX "uq_course_publications_active"`);
    await queryRunner.query(`DROP TABLE "course_publications"`);

    await queryRunner.query(
      `ALTER TABLE "course_modules" DROP CONSTRAINT "UQ_course_modules_id_course_id"`,
    );
  }
}
