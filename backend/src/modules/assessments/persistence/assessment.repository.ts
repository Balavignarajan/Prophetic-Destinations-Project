import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { ContentStatus } from '../../../shared-kernel/index.js';
import type { Role } from '../../identity/index.js';
import {
  type Assessment,
  type AssessmentWithQuestions,
  type LevelPoints,
  type PublishedSnapshot,
  type QuestionInput,
  type ScoringConfig,
  type StoredQuestion,
  zeroPoints,
} from '../domain/assessment-rules.js';
import type { AssessmentAction } from '../domain/assessment-workflow.js';

interface AssessmentRow {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  version: number;
  scoring_config: ScoringConfig | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface AssessmentSummary extends Assessment {
  questionCount: number;
  /** The publication learners get now, if this assessment has one. */
  activeVersion: number | null;
  /** The highest publication number ever made (null = never published). */
  latestVersion: number | null;
}

export interface Publication {
  id: string;
  assessmentId: string;
  version: number;
  contentHash: string;
  publishedBy: string;
  publishedAt: Date;
  endedAt: Date | null;
  endedReason: 'SUPERSEDED' | 'UNPUBLISHED' | null;
  endedBy: string | null;
}

export interface StoredPublication extends Publication {
  snapshot: PublishedSnapshot;
}

export interface WorkflowEvent {
  id: string;
  seq: number;
  assessmentId: string;
  action: AssessmentAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  actorRole: Role;
  note: string | null;
  assessmentVersion: number;
  publicationId: string | null;
  createdAt: Date;
}

export interface NewEvent {
  assessmentId: string;
  action: AssessmentAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  actorRole: Role;
  note: string | null;
  assessmentVersion: number;
  publicationId: string | null;
}

const toAssessment = (row: AssessmentRow): Assessment => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: row.status,
  version: row.version,
  scoringConfig: row.scoring_config,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPublication = (row: Record<string, unknown>): Publication => ({
  id: row.id as string,
  assessmentId: row.assessment_id as string,
  version: row.version as number,
  contentHash: (row.content_hash as string).trim(),
  publishedBy: row.published_by as string,
  publishedAt: row.published_at as Date,
  endedAt: (row.ended_at as Date | null) ?? null,
  endedReason: (row.ended_reason as Publication['endedReason']) ?? null,
  endedBy: (row.ended_by as string | null) ?? null,
});

const PUBLICATION_COLUMNS = `"id", "assessment_id", "version", "content_hash", "published_by", "published_at", "ended_at", "ended_reason", "ended_by"`;

/** Fills in missing levels with 0 so every stored option has all three. */
export function fullPoints(scores: Partial<Record<keyof LevelPoints, number>> | null | undefined): LevelPoints {
  return { ...zeroPoints(), ...(scores ?? {}) };
}

/**
 * Raw-SQL persistence of assessments (like quizzes and publications: the document is read and written as a whole). Pass `manager` to take part in a
 * transaction. The working copy is mutable; publications are immutable (the database refuses changes other than ending one).
 */
@Injectable()
export class AssessmentRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private db(manager?: EntityManager): Pick<EntityManager, 'query'> {
    return manager ?? this.dataSource;
  }

  // ------------------------------------------------------------------------------------------------------------------------- working copy

  async insertAssessment(input: { title: string; description: string | null; scoringConfig: ScoringConfig | null; createdBy: string }, manager: EntityManager): Promise<string> {
    const [row]: { id: string }[] = await manager.query(
      `INSERT INTO "assessments" ("title", "description", "scoring_config", "created_by") VALUES ($1, $2, $3::jsonb, $4) RETURNING "id"`,
      [input.title, input.description, input.scoringConfig ? JSON.stringify(input.scoringConfig) : null, input.createdBy],
    );
    return row.id;
  }

  /** Locks the assessment row until the transaction ends: every edit and every workflow transition takes this first. */
  async lock(id: string, manager: EntityManager): Promise<Assessment | null> {
    const rows: AssessmentRow[] = await manager.query(`SELECT * FROM "assessments" WHERE "id" = $1 FOR UPDATE`, [id]);
    return rows[0] ? toAssessment(rows[0]) : null;
  }

  async findById(id: string, manager?: EntityManager): Promise<Assessment | null> {
    const rows: AssessmentRow[] = await this.db(manager).query(`SELECT * FROM "assessments" WHERE "id" = $1`, [id]);
    return rows[0] ? toAssessment(rows[0]) : null;
  }

  async questionsOf(assessmentId: string, manager?: EntityManager): Promise<StoredQuestion[]> {
    const questions: { id: string; position: number; type: StoredQuestion['type']; prompt: string }[] = await this.db(manager).query(
      `SELECT "id", "position", "type", "prompt" FROM "assessment_questions" WHERE "assessment_id" = $1 ORDER BY "position"`,
      [assessmentId],
    );
    if (questions.length === 0) return [];
    const options: { id: string; question_id: string; position: number; text: string; scores: Partial<LevelPoints> }[] = await this.db(manager).query(
      `SELECT "id", "question_id", "position", "text", "scores" FROM "assessment_options" WHERE "question_id" = ANY($1::uuid[]) ORDER BY "question_id", "position"`,
      [questions.map((q) => q.id)],
    );
    return questions.map((q) => ({
      ...q,
      options: options.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, position: o.position, text: o.text, scores: fullPoints(o.scores) })),
    }));
  }

  async findWithQuestions(id: string, manager?: EntityManager): Promise<AssessmentWithQuestions | null> {
    const assessment = await this.findById(id, manager);
    if (!assessment) return null;
    return { ...assessment, questions: await this.questionsOf(id, manager) };
  }

  async list(limit: number, offset: number, status: ContentStatus | undefined): Promise<{ items: AssessmentSummary[]; total: number }> {
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS "total" FROM "assessments" WHERE ($1::text IS NULL OR "status" = $1)`,
      [status ?? null],
    );
    const rows: (AssessmentRow & { question_count: number; active_version: number | null; latest_version: number | null })[] = await this.dataSource.query(
      `SELECT a.*,
              (SELECT count(*)::int FROM "assessment_questions" q WHERE q."assessment_id" = a."id") AS "question_count",
              (SELECT p."version" FROM "assessment_publications" p WHERE p."assessment_id" = a."id" AND p."ended_at" IS NULL) AS "active_version",
              (SELECT max(p."version") FROM "assessment_publications" p WHERE p."assessment_id" = a."id") AS "latest_version"
         FROM "assessments" a
        WHERE ($1::text IS NULL OR a."status" = $1)
        ORDER BY a."updated_at" DESC, a."id"
        LIMIT $2 OFFSET $3`,
      [status ?? null, limit, offset],
    );
    return {
      total,
      items: rows.map((row) => ({ ...toAssessment(row), questionCount: row.question_count, activeVersion: row.active_version, latestVersion: row.latest_version })),
    };
  }

  /**
   * Makes the questions and options exactly `questions`, keeping the ids that are given (and valid) and generating ids for new ones. The caller holds the
   * assessment lock and has checked that every given id belongs to this assessment (and every option id to its own question).
   */
  async syncQuestions(assessmentId: string, questions: readonly QuestionInput[], manager: EntityManager): Promise<void> {
    const existing = await this.questionsOf(assessmentId, manager);
    const keptQuestionIds = new Set(questions.flatMap((q) => (q.id ? [q.id] : [])));
    const removedQuestions = existing.filter((q) => !keptQuestionIds.has(q.id)).map((q) => q.id);
    if (removedQuestions.length > 0) await manager.query(`DELETE FROM "assessment_questions" WHERE "id" = ANY($1::uuid[])`, [removedQuestions]);

    const existingQuestionIds = new Set(existing.map((q) => q.id));
    const planned = questions.map((q, index) => ({ id: q.id && existingQuestionIds.has(q.id) ? q.id : (q.id ?? randomUUID()), position: index + 1, input: q }));

    // Existing questions: one statement sets all their final positions (the position constraint is checked at its end).
    const kept = planned.filter((p) => existingQuestionIds.has(p.id));
    if (kept.length > 0) {
      await manager.query(
        `UPDATE "assessment_questions" AS q SET "position" = v."position", "prompt" = v."prompt"
           FROM unnest($1::uuid[], $2::int[], $3::text[]) AS v("id", "position", "prompt")
          WHERE q."id" = v."id" AND q."assessment_id" = $4`,
        [kept.map((p) => p.id), kept.map((p) => p.position), kept.map((p) => p.input.prompt), assessmentId],
      );
    }
    const created = planned.filter((p) => !existingQuestionIds.has(p.id));
    if (created.length > 0) {
      await manager.query(
        `INSERT INTO "assessment_questions" ("id", "assessment_id", "position", "type", "prompt")
         SELECT v."id", $4, v."position", 'SINGLE_CHOICE', v."prompt" FROM unnest($1::uuid[], $2::int[], $3::text[]) AS v("id", "position", "prompt")`,
        [created.map((p) => p.id), created.map((p) => p.position), created.map((p) => p.input.prompt), assessmentId],
      );
    }

    // Options, per question, the same way.
    for (const p of planned) {
      const existingOptions = new Map((existing.find((q) => q.id === p.id)?.options ?? []).map((o) => [o.id, o]));
      const keptOptionIds = new Set(p.input.options.flatMap((o) => (o.id ? [o.id] : [])));
      const removed = [...existingOptions.keys()].filter((id) => !keptOptionIds.has(id));
      if (removed.length > 0) await manager.query(`DELETE FROM "assessment_options" WHERE "id" = ANY($1::uuid[])`, [removed]);

      const options = p.input.options.map((o, index) => ({ id: o.id && existingOptions.has(o.id) ? o.id : (o.id ?? randomUUID()), position: index + 1, text: o.text, scores: JSON.stringify(fullPoints(o.scores)) }));
      const keptOptions = options.filter((o) => existingOptions.has(o.id));
      if (keptOptions.length > 0) {
        await manager.query(
          `UPDATE "assessment_options" AS o SET "position" = v."position", "text" = v."text", "scores" = v."scores"::jsonb
             FROM unnest($1::uuid[], $2::int[], $3::text[], $4::text[]) AS v("id", "position", "text", "scores")
            WHERE o."id" = v."id" AND o."question_id" = $5`,
          [keptOptions.map((o) => o.id), keptOptions.map((o) => o.position), keptOptions.map((o) => o.text), keptOptions.map((o) => o.scores), p.id],
        );
      }
      const newOptions = options.filter((o) => !existingOptions.has(o.id));
      if (newOptions.length > 0) {
        await manager.query(
          `INSERT INTO "assessment_options" ("id", "question_id", "position", "text", "scores")
           SELECT v."id", $5, v."position", v."text", v."scores"::jsonb FROM unnest($1::uuid[], $2::int[], $3::text[], $4::text[]) AS v("id", "position", "text", "scores")`,
          [newOptions.map((o) => o.id), newOptions.map((o) => o.position), newOptions.map((o) => o.text), newOptions.map((o) => o.scores), p.id],
        );
      }
    }
  }

  /** Reorders existing questions (all of them) in one statement. */
  async applyQuestionPositions(assessmentId: string, ids: readonly string[], manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "assessment_questions" AS q SET "position" = v."position"
         FROM unnest($2::uuid[], $3::int[]) AS v("id", "position")
        WHERE q."id" = v."id" AND q."assessment_id" = $1`,
      [assessmentId, ids, ids.map((_, i) => i + 1)],
    );
  }

  async applyOptionPositions(questionId: string, ids: readonly string[], manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "assessment_options" AS o SET "position" = v."position"
         FROM unnest($2::uuid[], $3::int[]) AS v("id", "position")
        WHERE o."id" = v."id" AND o."question_id" = $1`,
      [questionId, ids, ids.map((_, i) => i + 1)],
    );
  }

  /** An effective edit of the working copy: new content fields, back to DRAFT, `version` + 1. */
  async markEdited(id: string, changes: { title?: string; description?: string | null; scoringConfig?: ScoringConfig | null }, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "assessments"
          SET "title" = COALESCE($2, "title"),
              "description" = CASE WHEN $3::boolean THEN $4 ELSE "description" END,
              "scoring_config" = CASE WHEN $5::boolean THEN $6::jsonb ELSE "scoring_config" END,
              "status" = 'DRAFT', "version" = "version" + 1, "updated_at" = now()
        WHERE "id" = $1`,
      [
        id,
        changes.title ?? null,
        changes.description !== undefined,
        changes.description ?? null,
        changes.scoringConfig !== undefined,
        changes.scoringConfig ? JSON.stringify(changes.scoringConfig) : null,
      ],
    );
  }

  /** Workflow status change: not an edit, so `version` does not move. */
  async setStatus(id: string, status: ContentStatus, manager: EntityManager): Promise<void> {
    await manager.query(`UPDATE "assessments" SET "status" = $2, "updated_at" = now() WHERE "id" = $1`, [id, status]);
  }

  // ------------------------------------------------------------------------------------------------------------------------- publications

  /** Serializes publish/unpublish across ALL assessments (there is one active publication in total). Held until the transaction ends. */
  async lockPublishing(manager: EntityManager): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('assessment_active_publication'))`);
  }

  async nextVersion(assessmentId: string, manager: EntityManager): Promise<number> {
    const [row]: { next: number }[] = await manager.query(`SELECT COALESCE(max("version"), 0)::int + 1 AS "next" FROM "assessment_publications" WHERE "assessment_id" = $1`, [assessmentId]);
    return row.next;
  }

  async insertPublication(input: { assessmentId: string; version: number; snapshot: PublishedSnapshot; hash: string; publishedBy: string }, manager: EntityManager): Promise<Publication> {
    const [row]: Record<string, unknown>[] = await manager.query(
      `INSERT INTO "assessment_publications" ("assessment_id", "version", "snapshot", "content_hash", "published_by")
       VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING ${PUBLICATION_COLUMNS}`,
      [input.assessmentId, input.version, JSON.stringify(input.snapshot), input.hash, input.publishedBy],
    );
    return toPublication(row);
  }

  /** Ends the active publication (of any assessment), once. Returns what was ended. */
  async endActive(reason: 'SUPERSEDED' | 'UNPUBLISHED', actorId: string, manager: EntityManager, onlyAssessmentId?: string): Promise<Publication[]> {
    const rows: Record<string, unknown>[] = await manager.query(
      `UPDATE "assessment_publications" SET "ended_at" = now(), "ended_reason" = $1, "ended_by" = $2
        WHERE "ended_at" IS NULL AND ($3::uuid IS NULL OR "assessment_id" = $3::uuid)
        RETURNING ${PUBLICATION_COLUMNS}`,
      [reason, actorId, onlyAssessmentId ?? null],
    );
    return rows.map(toPublication);
  }

  async findActive(manager?: EntityManager): Promise<StoredPublication | null> {
    const rows: Record<string, unknown>[] = await this.db(manager).query(`SELECT ${PUBLICATION_COLUMNS}, "snapshot" FROM "assessment_publications" WHERE "ended_at" IS NULL`);
    return rows[0] ? { ...toPublication(rows[0]), snapshot: rows[0].snapshot as PublishedSnapshot } : null;
  }

  async findActiveOf(assessmentId: string, manager?: EntityManager): Promise<Publication | null> {
    const rows: Record<string, unknown>[] = await this.db(manager).query(`SELECT ${PUBLICATION_COLUMNS} FROM "assessment_publications" WHERE "assessment_id" = $1 AND "ended_at" IS NULL`, [assessmentId]);
    return rows[0] ? toPublication(rows[0]) : null;
  }

  /** A specific published version of an assessment, active or since ended (submissions made against an older version are still scored against it). */
  async findPublication(assessmentId: string, version: number): Promise<StoredPublication | null> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${PUBLICATION_COLUMNS}, "snapshot" FROM "assessment_publications" WHERE "assessment_id" = $1 AND "version" = $2`,
      [assessmentId, version],
    );
    return rows[0] ? { ...toPublication(rows[0]), snapshot: rows[0].snapshot as PublishedSnapshot } : null;
  }

  async listPublications(assessmentId: string): Promise<Publication[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(`SELECT ${PUBLICATION_COLUMNS} FROM "assessment_publications" WHERE "assessment_id" = $1 ORDER BY "version" DESC`, [assessmentId]);
    return rows.map(toPublication);
  }

  // ------------------------------------------------------------------------------------------------------------------------- audit trail

  async appendEvent(event: NewEvent, manager: EntityManager): Promise<WorkflowEvent> {
    const [row]: Record<string, unknown>[] = await manager.query(
      `INSERT INTO "assessment_workflow_events" ("assessment_id", "action", "from_status", "to_status", "actor_admin_id", "actor_role", "note", "assessment_version", "publication_id")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [event.assessmentId, event.action, event.fromStatus, event.toStatus, event.actorAdminId, event.actorRole, event.note, event.assessmentVersion, event.publicationId],
    );
    return toEvent(row);
  }

  async listEvents(assessmentId: string, limit: number, offset: number): Promise<{ items: WorkflowEvent[]; total: number }> {
    const [{ total }]: { total: number }[] = await this.dataSource.query(`SELECT count(*)::int AS "total" FROM "assessment_workflow_events" WHERE "assessment_id" = $1`, [assessmentId]);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT * FROM "assessment_workflow_events" WHERE "assessment_id" = $1 ORDER BY "seq" DESC LIMIT $2 OFFSET $3`,
      [assessmentId, limit, offset],
    );
    return { total, items: rows.map(toEvent) };
  }
}

function toEvent(row: Record<string, unknown>): WorkflowEvent {
  return {
    id: row.id as string,
    seq: Number(row.seq),
    assessmentId: row.assessment_id as string,
    action: row.action as AssessmentAction,
    fromStatus: row.from_status as ContentStatus,
    toStatus: row.to_status as ContentStatus,
    actorAdminId: row.actor_admin_id as string,
    actorRole: row.actor_role as Role,
    note: (row.note as string | null) ?? null,
    assessmentVersion: row.assessment_version as number,
    publicationId: (row.publication_id as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}
