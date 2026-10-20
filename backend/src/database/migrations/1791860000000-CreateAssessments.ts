import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The learner placement assessment (optional; recommends BEGINNER, INTERMEDIATE or ADVANCED). A dedicated schema, not lesson quizzes.
 *
 *  - assessments / assessment_questions / assessment_options: the WORKING copy staff edit. Ids are stable (an edit keeps them), positions are unique per
 *    parent (DEFERRABLE INITIALLY IMMEDIATE, so a reorder in one statement is checked at its end), and each option carries its points per level in `scores`.
 *  - assessment_publications: IMMUTABLE published versions. `snapshot` holds everything needed to render and score that version; submissions are validated
 *    against it, never against the working copy. Only the one-time "ended" columns can change (a trigger refuses everything else, and deletes). At most ONE
 *    publication is active across the whole table (partial unique index): publishing another assessment supersedes the active one.
 *  - assessment_workflow_events: the append-only audit trail (the same shapes as the other workflow events, EXCEPT that PUBLISH is allowed only from APPROVED:
 *    the direct ADMIN publishing of lessons, modules and courses is not extended to assessments).
 *  - Invariant, checked at commit by deferred triggers: an assessment whose status is PUBLISHED has an active publication (publishing, replacing and unpublishing
 *    change the status and the publication in one transaction, so this only ever fails on a bug or a write outside the application).
 *
 * Nothing is stored about learners: no accounts, answers or results. Adds tables only; no existing table or row is touched.
 * ROLLBACK: down() drops the four tables and everything authored in them. Export them first if that matters.
 */
export class CreateAssessments1791860000000 implements MigrationInterface {
  name = 'CreateAssessments1791860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(200) NOT NULL,
        "description" text,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "version" integer NOT NULL DEFAULT 1,
        "scoring_config" jsonb,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assessments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_assessments_created_by" FOREIGN KEY ("created_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_assessments_status" CHECK ("status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_assessments_title" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
        CONSTRAINT "chk_assessments_description" CHECK ("description" IS NULL OR char_length("description") <= 2000),
        CONSTRAINT "chk_assessments_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_assessments_scoring_config" CHECK ("scoring_config" IS NULL OR jsonb_typeof("scoring_config") = 'object')
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_assessments_status_updated" ON "assessments" ("status", "updated_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "assessment_questions" (
        "id" uuid NOT NULL,
        "assessment_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "type" character varying(20) NOT NULL DEFAULT 'SINGLE_CHOICE',
        "prompt" text NOT NULL,
        CONSTRAINT "PK_assessment_questions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_assessment_questions_position" UNIQUE ("assessment_id", "position") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "FK_assessment_questions_assessment" FOREIGN KEY ("assessment_id")
          REFERENCES "assessments" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "chk_assessment_questions_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_assessment_questions_type" CHECK ("type" IN ('SINGLE_CHOICE')),
        CONSTRAINT "chk_assessment_questions_prompt" CHECK (char_length(btrim("prompt")) BETWEEN 1 AND 1000)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "assessment_options" (
        "id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "text" text NOT NULL,
        -- points this answer gives to each level, e.g. {"BEGINNER":0,"INTERMEDIATE":2,"ADVANCED":1}; never sent to learners
        "scores" jsonb NOT NULL DEFAULT '{"BEGINNER":0,"INTERMEDIATE":0,"ADVANCED":0}',
        CONSTRAINT "PK_assessment_options_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_assessment_options_position" UNIQUE ("question_id", "position") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "FK_assessment_options_question" FOREIGN KEY ("question_id")
          REFERENCES "assessment_questions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "chk_assessment_options_position" CHECK ("position" >= 1),
        CONSTRAINT "chk_assessment_options_text" CHECK (char_length(btrim("text")) BETWEEN 1 AND 300),
        CONSTRAINT "chk_assessment_options_scores" CHECK (jsonb_typeof("scores") = 'object')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "assessment_publications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "assessment_id" uuid NOT NULL,
        -- 1, 2, ... per assessment: the version clients receive and send back
        "version" integer NOT NULL,
        "snapshot" jsonb NOT NULL,
        "content_hash" character(64) NOT NULL,
        "published_by" uuid NOT NULL,
        "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ended_at" TIMESTAMP WITH TIME ZONE,
        "ended_reason" character varying(20),
        "ended_by" uuid,
        CONSTRAINT "PK_assessment_publications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_assessment_publications_version" UNIQUE ("assessment_id", "version"),
        CONSTRAINT "UQ_assessment_publications_id_assessment" UNIQUE ("id", "assessment_id"),
        CONSTRAINT "FK_assessment_publications_assessment" FOREIGN KEY ("assessment_id")
          REFERENCES "assessments" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_assessment_publications_published_by" FOREIGN KEY ("published_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_assessment_publications_ended_by" FOREIGN KEY ("ended_by")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_assessment_publications_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_assessment_publications_ended_reason" CHECK ("ended_reason" IS NULL OR "ended_reason" IN ('SUPERSEDED', 'UNPUBLISHED')),
        CONSTRAINT "chk_assessment_publications_ended" CHECK (
          ("ended_at" IS NULL) = ("ended_reason" IS NULL) AND ("ended_at" IS NULL) = ("ended_by" IS NULL))
      )
    `);
    // At most one active publication in the whole table: the one learners get.
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_assessment_publications_single_active" ON "assessment_publications" ((true)) WHERE "ended_at" IS NULL`);
    await queryRunner.query(`CREATE INDEX "idx_assessment_publications_assessment" ON "assessment_publications" ("assessment_id", "version" DESC)`);

    await queryRunner.query(`
      CREATE FUNCTION "assessment_publications_guard"() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'assessment publications are never deleted' USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF OLD."ended_at" IS NOT NULL
           OR NEW."id" <> OLD."id" OR NEW."assessment_id" <> OLD."assessment_id" OR NEW."version" <> OLD."version"
           OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."content_hash" <> OLD."content_hash"
           OR NEW."published_by" <> OLD."published_by" OR NEW."published_at" <> OLD."published_at" THEN
          RAISE EXCEPTION 'an assessment publication can only be ended, never changed otherwise' USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_assessment_publications_guard" BEFORE UPDATE OR DELETE ON "assessment_publications"
        FOR EACH ROW EXECUTE FUNCTION "assessment_publications_guard"()
    `);

    await queryRunner.query(`
      CREATE TABLE "assessment_workflow_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seq" bigint GENERATED ALWAYS AS IDENTITY,
        "assessment_id" uuid NOT NULL,
        "action" character varying(30) NOT NULL,
        "from_status" character varying(20) NOT NULL,
        "to_status" character varying(20) NOT NULL,
        "actor_admin_id" uuid NOT NULL,
        "actor_role" character varying(20) NOT NULL,
        "note" text,
        -- the assessment's edit version at the moment of the transition (the content that was reviewed or published)
        "assessment_version" integer NOT NULL,
        "publication_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT "PK_assessment_workflow_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_assessment_workflow_events_seq" UNIQUE ("seq"),
        CONSTRAINT "FK_assessment_workflow_events_assessment" FOREIGN KEY ("assessment_id")
          REFERENCES "assessments" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_assessment_workflow_events_actor" FOREIGN KEY ("actor_admin_id")
          REFERENCES "admins" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        -- the publication named by an event must belong to the event's own assessment
        CONSTRAINT "FK_assessment_workflow_events_publication" FOREIGN KEY ("publication_id", "assessment_id")
          REFERENCES "assessment_publications" ("id", "assessment_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "chk_assessment_workflow_events_action" CHECK ("action" IN ('SUBMIT_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'UNPUBLISH')),
        CONSTRAINT "chk_assessment_workflow_events_from_status" CHECK ("from_status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_assessment_workflow_events_to_status" CHECK ("to_status" IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED')),
        CONSTRAINT "chk_assessment_workflow_events_actor_role" CHECK ("actor_role" IN ('ADMIN', 'EDITOR', 'REVIEWER')),
        CONSTRAINT "chk_assessment_workflow_events_transition" CHECK (
          ("action" = 'SUBMIT_FOR_REVIEW' AND "from_status" = 'DRAFT' AND "to_status" = 'READY_FOR_REVIEW')
          OR ("action" = 'REQUEST_CHANGES' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'DRAFT')
          OR ("action" = 'APPROVE' AND "from_status" = 'READY_FOR_REVIEW' AND "to_status" = 'APPROVED')
          OR ("action" = 'PUBLISH' AND "from_status" = 'APPROVED' AND "to_status" = 'PUBLISHED')
          OR ("action" = 'UNPUBLISH' AND (
                ("from_status" = 'PUBLISHED' AND "to_status" = 'APPROVED')
                OR ("from_status" <> 'PUBLISHED' AND "to_status" = "from_status")))
        ),
        CONSTRAINT "chk_assessment_workflow_events_note_required" CHECK ("action" <> 'REQUEST_CHANGES' OR "note" IS NOT NULL),
        CONSTRAINT "chk_assessment_workflow_events_note" CHECK ("note" IS NULL OR ("note" !~ '^\\s*$' AND char_length("note") <= 2000)),
        CONSTRAINT "chk_assessment_workflow_events_version" CHECK ("assessment_version" >= 1),
        CONSTRAINT "chk_assessment_workflow_events_publication" CHECK (("publication_id" IS NOT NULL) = ("action" IN ('PUBLISH', 'UNPUBLISH')))
      )
    `);
    await queryRunner.query(`
      CREATE FUNCTION "assessments_published_has_active_publication"() RETURNS trigger AS $$
      DECLARE target uuid;
      BEGIN
        IF TG_TABLE_NAME = 'assessments' THEN target := NEW."id"; ELSE target := NEW."assessment_id"; END IF;
        IF EXISTS (SELECT 1 FROM "assessments" WHERE "id" = target AND "status" = 'PUBLISHED')
           AND NOT EXISTS (SELECT 1 FROM "assessment_publications" WHERE "assessment_id" = target AND "ended_at" IS NULL) THEN
          RAISE EXCEPTION 'a PUBLISHED assessment must have an active publication' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_assessments_published_has_active" AFTER INSERT OR UPDATE OF "status" ON "assessments"
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "assessments_published_has_active_publication"()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER "trg_assessment_publications_published_has_active" AFTER INSERT OR UPDATE ON "assessment_publications"
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "assessments_published_has_active_publication"()
    `);
    await queryRunner.query(`CREATE INDEX "idx_assessment_workflow_events_assessment_seq" ON "assessment_workflow_events" ("assessment_id", "seq")`);
    await queryRunner.query(`
      CREATE FUNCTION "assessment_workflow_events_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'assessment_workflow_events is append-only' USING ERRCODE = 'integrity_constraint_violation';
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_assessment_workflow_events_append_only" BEFORE UPDATE OR DELETE ON "assessment_workflow_events"
        FOR EACH ROW EXECUTE FUNCTION "assessment_workflow_events_append_only"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_assessment_workflow_events_no_truncate" BEFORE TRUNCATE ON "assessment_workflow_events"
        FOR EACH STATEMENT EXECUTE FUNCTION "assessment_workflow_events_append_only"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "trg_assessment_publications_published_has_active" ON "assessment_publications"`);
    await queryRunner.query(`DROP TRIGGER "trg_assessments_published_has_active" ON "assessments"`);
    await queryRunner.query(`DROP FUNCTION "assessments_published_has_active_publication"()`);
    await queryRunner.query(`DROP TRIGGER "trg_assessment_workflow_events_no_truncate" ON "assessment_workflow_events"`);
    await queryRunner.query(`DROP TRIGGER "trg_assessment_workflow_events_append_only" ON "assessment_workflow_events"`);
    await queryRunner.query(`DROP FUNCTION "assessment_workflow_events_append_only"()`);
    await queryRunner.query(`DROP TABLE "assessment_workflow_events"`);
    await queryRunner.query(`DROP TRIGGER "trg_assessment_publications_guard" ON "assessment_publications"`);
    await queryRunner.query(`DROP FUNCTION "assessment_publications_guard"()`);
    await queryRunner.query(`DROP TABLE "assessment_publications"`);
    await queryRunner.query(`DROP TABLE "assessment_options"`);
    await queryRunner.query(`DROP TABLE "assessment_questions"`);
    await queryRunner.query(`DROP TABLE "assessments"`);
  }
}
