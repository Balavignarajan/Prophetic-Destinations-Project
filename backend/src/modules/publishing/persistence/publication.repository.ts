import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import type {
  ActiveSnapshotInfo,
  LevelSnapshot,
  Publication,
  PublicationEndReason,
  PublicationLevelSummary,
} from '../domain/models.js';

export interface NewPublication {
  lessonId: string;
  version: number;
  moduleId: string;
  sourceContentRevision: number;
  snapshotSchemaVersion: number;
  publishedBy: string;
}

export interface NewLevelSnapshot {
  level: LearningLevel;
  /** The canonical JSON text, stored as jsonb. */
  json: string;
  hash: string;
  bytes: number;
}

interface PublicationRow {
  id: string;
  lesson_id: string;
  version: number;
  module_id: string;
  source_content_revision: number;
  snapshot_schema_version: number;
  published_at: Date;
  published_by: string;
  ended_at: Date | null;
  ended_by: string | null;
  ended_reason: PublicationEndReason | null;
}

interface LevelSummaryRow {
  publication_id: string;
  level: LearningLevel;
  content_hash: string;
  content_bytes: number;
}

const PUBLICATION_COLUMNS = `p."id", p."lesson_id", p."version", p."module_id", p."source_content_revision",
  p."snapshot_schema_version", p."published_at", p."published_by", p."ended_at", p."ended_by", p."ended_reason"`;

/**
 * Publications and their level snapshots. Write methods require the caller's
 * transaction `manager`. There is no update (beyond ending a publication, once) and
 * no delete: history is retained, and the database enforces it as well.
 * Returns domain objects, never entities.
 */
@Injectable()
export class PublicationRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The lesson's active publication (at most one exists), or null. */
  async findActive(
    lessonId: string,
    manager?: EntityManager,
  ): Promise<Publication | null> {
    const rows: PublicationRow[] = await this.db(manager).query(
      `SELECT ${PUBLICATION_COLUMNS} FROM "lesson_publications" p
        WHERE p."lesson_id" = $1 AND p."ended_at" IS NULL`,
      [lessonId],
    );
    return rows[0] ? this.withLevels(rows, manager).then((p) => p[0]) : null;
  }

  async findByVersion(
    lessonId: string,
    version: number,
    manager?: EntityManager,
  ): Promise<Publication | null> {
    const rows: PublicationRow[] = await this.db(manager).query(
      `SELECT ${PUBLICATION_COLUMNS} FROM "lesson_publications" p
        WHERE p."lesson_id" = $1 AND p."version" = $2`,
      [lessonId, version],
    );
    return rows[0] ? this.withLevels(rows, manager).then((p) => p[0]) : null;
  }

  /** Newest version first. */
  async list(
    lessonId: string,
    limit: number,
    offset: number,
    manager?: EntityManager,
  ): Promise<{ items: Publication[]; total: number }> {
    const db = this.db(manager);
    const rows: PublicationRow[] = await db.query(
      `SELECT ${PUBLICATION_COLUMNS} FROM "lesson_publications" p
        WHERE p."lesson_id" = $1
        ORDER BY p."version" DESC LIMIT $2 OFFSET $3`,
      [lessonId, limit, offset],
    );
    const [{ total }]: { total: number }[] = await db.query(
      `SELECT count(*)::int AS "total" FROM "lesson_publications" WHERE "lesson_id" = $1`,
      [lessonId],
    );
    return { items: await this.withLevels(rows, manager), total };
  }

  async findLevelSnapshot(
    lessonId: string,
    version: number,
    level: LearningLevel,
    manager?: EntityManager,
  ): Promise<LevelSnapshot | null> {
    const rows: {
      publication_id: string;
      lesson_id: string;
      version: number;
      level: LearningLevel;
      content: Record<string, unknown>;
      content_hash: string;
      content_bytes: number;
    }[] = await this.db(manager).query(
      `SELECT l."publication_id", l."lesson_id", p."version", l."level", l."content",
              l."content_hash", l."content_bytes"
         FROM "lesson_publication_levels" l
         JOIN "lesson_publications" p ON p."id" = l."publication_id"
        WHERE p."lesson_id" = $1 AND p."version" = $2 AND l."level" = $3`,
      [lessonId, version, level],
    );
    const row = rows[0];
    return row
      ? {
          publicationId: row.publication_id,
          lessonId: row.lesson_id,
          version: row.version,
          level: row.level,
          content: row.content,
          contentHash: row.content_hash.trim(),
          contentBytes: row.content_bytes,
        }
      : null;
  }

  /**
   * The snapshot a learner gets now for one level of one lesson: the lesson's ACTIVE publication
   * (`ended_at IS NULL`) and that level's row within it, in a single statement, so it is one
   * consistent committed view. Null when the lesson has no active publication or that publication
   * has no snapshot for the level: there is no fallback to another level or an older version.
   * Reads the two publication tables only; the authoring tables are never consulted.
   */
  async findActiveSnapshotInfo(
    lessonId: string,
    level: LearningLevel,
  ): Promise<ActiveSnapshotInfo | null> {
    const rows: {
      publication_id: string;
      lesson_id: string;
      version: number;
      level: LearningLevel;
      content_hash: string;
    }[] = await this.dataSource.query(
      `SELECT p."id" AS "publication_id", p."lesson_id", p."version", l."level", l."content_hash"
         FROM "lesson_publications" p
         JOIN "lesson_publication_levels" l ON l."publication_id" = p."id"
        WHERE p."lesson_id" = $1 AND p."ended_at" IS NULL AND l."level" = $2`,
      [lessonId, level],
    );
    const row = rows[0];
    return row
      ? {
          lessonId: row.lesson_id,
          level: row.level,
          publicationId: row.publication_id,
          publicationVersion: row.version,
          contentHash: row.content_hash.trim(),
        }
      : null;
  }

  /**
   * The stored snapshot content of one level of a publication, but only while that publication is
   * still active: once it has been ended (unpublished or replaced) this returns null. The content is
   * exactly what was stored; it is never rebuilt or transformed.
   */
  async findActiveSnapshotContent(
    publicationId: string,
    level: LearningLevel,
  ): Promise<Record<string, unknown> | null> {
    const rows: { content: Record<string, unknown> }[] =
      await this.dataSource.query(
        `SELECT l."content"
           FROM "lesson_publication_levels" l
           JOIN "lesson_publications" p ON p."id" = l."publication_id"
          WHERE l."publication_id" = $1 AND l."level" = $2 AND p."ended_at" IS NULL`,
        [publicationId, level],
      );
    return rows[0]?.content ?? null;
  }

  /**
   * The next version number for the lesson: the highest ever used plus one. Only safe
   * while the caller holds the lesson row lock (it serializes publishers); the unique
   * (lesson_id, version) constraint is the backstop.
   */
  async nextVersion(lessonId: string, manager: EntityManager): Promise<number> {
    const [{ next }]: { next: number }[] = await manager.query(
      `SELECT COALESCE(MAX("version"), 0) + 1 AS "next" FROM "lesson_publications" WHERE "lesson_id" = $1`,
      [lessonId],
    );
    return next;
  }

  /**
   * Ends the lesson's active publication, if there is one, and returns it. The
   * `ended_at IS NULL` condition (and a database trigger) mean a publication can be
   * ended only once and is never reactivated.
   */
  async endActive(
    lessonId: string,
    reason: PublicationEndReason,
    endedBy: string,
    manager: EntityManager,
  ): Promise<Publication | null> {
    const result: PublicationRow[][] = await manager.query(
      `UPDATE "lesson_publications" AS p
          SET "ended_at" = clock_timestamp(), "ended_by" = $2, "ended_reason" = $3
        WHERE p."lesson_id" = $1 AND p."ended_at" IS NULL
        RETURNING ${PUBLICATION_COLUMNS}`,
      [lessonId, endedBy, reason],
    );
    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING.
    const rows = result[0];
    return rows?.[0] ? (await this.withLevels(rows, manager))[0] : null;
  }

  /** Inserts a new, active publication (levels are added with `insertLevels`). */
  async insert(
    publication: NewPublication,
    manager: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO "lesson_publications"
         ("id", "lesson_id", "version", "module_id", "source_content_revision",
          "snapshot_schema_version", "published_by")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        publication.lessonId,
        publication.version,
        publication.moduleId,
        publication.sourceContentRevision,
        publication.snapshotSchemaVersion,
        publication.publishedBy,
      ],
    );
    return id;
  }

  async insertLevels(
    publicationId: string,
    lessonId: string,
    levels: readonly NewLevelSnapshot[],
    manager: EntityManager,
  ): Promise<void> {
    for (const level of levels) {
      await manager.query(
        `INSERT INTO "lesson_publication_levels"
           ("publication_id", "lesson_id", "level", "content", "content_hash", "content_bytes")
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          publicationId,
          lessonId,
          level.level,
          level.json,
          level.hash,
          level.bytes,
        ],
      );
    }
  }

  /** Re-reads a publication inside the writer's transaction. */
  async get(id: string, manager: EntityManager): Promise<Publication> {
    const rows: PublicationRow[] = await manager.query(
      `SELECT ${PUBLICATION_COLUMNS} FROM "lesson_publications" p WHERE p."id" = $1`,
      [id],
    );
    return (await this.withLevels(rows, manager))[0];
  }

  private async withLevels(
    rows: PublicationRow[],
    manager?: EntityManager,
  ): Promise<Publication[]> {
    if (rows.length === 0) return [];
    const levels: LevelSummaryRow[] = await this.db(manager).query(
      `SELECT "publication_id", "level", "content_hash", "content_bytes"
         FROM "lesson_publication_levels"
        WHERE "publication_id" = ANY($1::uuid[])`,
      [rows.map((row) => row.id)],
    );
    return rows.map((row) => toPublication(row, levels));
  }

  private db(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }
}

const LEVEL_ORDER: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

function toPublication(
  row: PublicationRow,
  levels: LevelSummaryRow[],
): Publication {
  const summaries: PublicationLevelSummary[] = levels
    .filter((level) => level.publication_id === row.id)
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level))
    .map((level) => ({
      level: level.level,
      contentHash: level.content_hash.trim(),
      contentBytes: level.content_bytes,
    }));
  return {
    id: row.id,
    lessonId: row.lesson_id,
    version: row.version,
    moduleId: row.module_id,
    sourceContentRevision: row.source_content_revision,
    snapshotSchemaVersion: row.snapshot_schema_version,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    endedAt: row.ended_at,
    endedBy: row.ended_by,
    endedReason: row.ended_reason,
    levels: summaries,
  };
}
