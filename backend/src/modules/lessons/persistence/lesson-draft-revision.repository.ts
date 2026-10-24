import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { LEARNING_LEVELS, type LearningLevel } from '../../../shared-kernel/index.js';
import { DRAFT_SNAPSHOT_SCHEMA, type DraftRevisionSummary, type DraftSnapshot } from '../domain/lesson-revisions.js';
import { LessonDraftRevisionEntity } from './lesson-draft-revision.entity.js';

export interface NewDraftRevision {
  lessonId: string;
  contentRevision: number;
  savedAt: Date;
  snapshot: DraftSnapshot;
  restoredFromRevision?: number | null;
  restoredBy?: string | null;
}

export interface StoredDraftRevision {
  id: string;
  lessonId: string;
  contentRevision: number;
  restoredFromRevision: number | null;
  /** The stored value, unread: `readSnapshot` decides whether it can be used. */
  snapshot: unknown;
}

interface SummaryRow {
  id: string;
  content_revision: number;
  saved_at: Date;
  captured_at: Date;
  restored_from_revision: number | null;
  restored_by_email: string | null;
  schema: unknown;
  title: unknown;
  block_count: number | null;
  levels: unknown;
  tags: unknown;
}

/**
 * Stores and reads draft revisions. Plain SQL; rows are only inserted, never updated. The list reads a few fields out of each snapshot in SQL, so showing the history
 * never loads the content of the blocks.
 */
@Injectable()
export class LessonDraftRevisionRepository {
  constructor(
    @InjectRepository(LessonDraftRevisionEntity)
    private readonly rows: Repository<LessonDraftRevisionEntity>,
  ) {}

  async exists(lessonId: string, contentRevision: number, manager: EntityManager): Promise<boolean> {
    const found: unknown[] = await manager.query(`SELECT 1 FROM "lesson_draft_revisions" WHERE "lesson_id" = $1 AND "content_revision" = $2`, [lessonId, contentRevision]);
    return found.length > 0;
  }

  /** Stores the revision unless that revision number already has one (then nothing changes: a stored revision is never replaced). */
  async insert(input: NewDraftRevision, manager: EntityManager): Promise<void> {
    await manager.query(
      `INSERT INTO "lesson_draft_revisions" ("lesson_id", "content_revision", "saved_at", "restored_from_revision", "restored_by", "snapshot")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT ("lesson_id", "content_revision") DO NOTHING`,
      [input.lessonId, input.contentRevision, input.savedAt, input.restoredFromRevision ?? null, input.restoredBy ?? null, JSON.stringify(input.snapshot)],
    );
  }

  async find(id: string, manager?: EntityManager): Promise<StoredDraftRevision | null> {
    const [row]: { id: string; lesson_id: string; content_revision: number; restored_from_revision: number | null; snapshot: unknown }[] = await (manager ?? this.rows.manager).query(
      `SELECT "id", "lesson_id", "content_revision", "restored_from_revision", "snapshot" FROM "lesson_draft_revisions" WHERE "id" = $1`,
      [id],
    );
    return row
      ? { id: row.id, lessonId: row.lesson_id, contentRevision: row.content_revision, restoredFromRevision: row.restored_from_revision, snapshot: row.snapshot }
      : null;
  }

  /** Newest first. `total` counts every stored revision of the lesson. */
  async list(lessonId: string, limit: number): Promise<{ items: DraftRevisionSummary[]; total: number }> {
    const db = this.rows.manager;
    const [{ total }]: { total: number }[] = await db.query(`SELECT count(*)::int AS "total" FROM "lesson_draft_revisions" WHERE "lesson_id" = $1`, [lessonId]);
    const found: SummaryRow[] = await db.query(
      `SELECT r."id", r."content_revision", r."saved_at", r."captured_at", r."restored_from_revision", a."email" AS "restored_by_email",
              r."snapshot"->'schema' AS "schema", r."snapshot"->'lesson'->'title' AS "title",
              CASE WHEN jsonb_typeof(r."snapshot"->'blocks') = 'array' THEN jsonb_array_length(r."snapshot"->'blocks') END AS "block_count",
              r."snapshot"->'levels' AS "levels", r."snapshot"->'lesson'->'tags' AS "tags"
         FROM "lesson_draft_revisions" r
    LEFT JOIN "admins" a ON a."id" = r."restored_by"
        WHERE r."lesson_id" = $1
        ORDER BY r."content_revision" DESC
        LIMIT $2`,
      [lessonId, limit],
    );
    return {
      total,
      items: found.map((row) => ({
        id: row.id,
        contentRevision: row.content_revision,
        savedAt: row.saved_at,
        capturedAt: row.captured_at,
        title: typeof row.title === 'string' ? row.title : '',
        blockCount: row.block_count ?? 0,
        levels: Array.isArray(row.levels) ? LEARNING_LEVELS.filter((level): level is LearningLevel => (row.levels as unknown[]).includes(level)) : [],
        tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        restoredFromRevision: row.restored_from_revision,
        restoredBy: row.restored_by_email,
        restorable: row.schema === DRAFT_SNAPSHOT_SCHEMA,
      })),
    };
  }
}
