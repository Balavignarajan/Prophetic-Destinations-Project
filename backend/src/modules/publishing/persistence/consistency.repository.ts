import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** A publication that breaks an integrity rule. */
export interface PublicationFinding {
  lessonId: string;
  publicationId: string | null;
}

export interface StoredSnapshot {
  publicationId: string;
  lessonId: string;
  level: string;
  content: unknown;
  contentHash: string;
  contentBytes: number;
}

/**
 * Read-only queries that look for publication integrity problems across the publishing
 * tables. Everything here only reads; none of it can change history.
 */
@Injectable()
export class ConsistencyRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Lessons with more than one active publication (the unique index makes this impossible). */
  multipleActive(limit: number): Promise<PublicationFinding[]> {
    return this.find(
      `SELECT "lesson_id", NULL::uuid AS "publication_id" FROM "lesson_publications"
        WHERE "ended_at" IS NULL GROUP BY "lesson_id" HAVING count(*) > 1 LIMIT $1`,
      [limit],
    );
  }

  /** Publications without the PUBLISH event that created them. */
  withoutPublishEvent(limit: number): Promise<PublicationFinding[]> {
    return this.find(
      `SELECT p."lesson_id", p."id" AS "publication_id" FROM "lesson_publications" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "lesson_workflow_events" e
           WHERE e."publication_id" = p."id" AND e."action" = 'PUBLISH')
        ORDER BY p."published_at" LIMIT $1`,
      [limit],
    );
  }

  /** PUBLISH events whose recorded content revision differs from the publication's source revision. */
  publishRevisionMismatch(limit: number): Promise<PublicationFinding[]> {
    return this.find(
      `SELECT p."lesson_id", p."id" AS "publication_id" FROM "lesson_publications" p
         JOIN "lesson_workflow_events" e ON e."publication_id" = p."id" AND e."action" = 'PUBLISH'
        WHERE e."content_revision" <> p."source_content_revision"
        ORDER BY p."published_at" LIMIT $1`,
      [limit],
    );
  }

  /** Publications ended as UNPUBLISHED without the UNPUBLISH event that ended them. */
  unpublishedWithoutEvent(limit: number): Promise<PublicationFinding[]> {
    return this.find(
      `SELECT p."lesson_id", p."id" AS "publication_id" FROM "lesson_publications" p
        WHERE p."ended_reason" = 'UNPUBLISHED' AND NOT EXISTS (
          SELECT 1 FROM "lesson_workflow_events" e
           WHERE e."publication_id" = p."id" AND e."action" = 'UNPUBLISH')
        ORDER BY p."published_at" LIMIT $1`,
      [limit],
    );
  }

  /** Publications ended as SUPERSEDED with no later publication (and its PUBLISH event) that replaced them. */
  supersededWithoutSuccessor(limit: number): Promise<PublicationFinding[]> {
    return this.find(
      `SELECT p."lesson_id", p."id" AS "publication_id" FROM "lesson_publications" p
        WHERE p."ended_reason" = 'SUPERSEDED' AND NOT EXISTS (
          SELECT 1 FROM "lesson_publications" next
            JOIN "lesson_workflow_events" e ON e."publication_id" = next."id" AND e."action" = 'PUBLISH'
           WHERE next."lesson_id" = p."lesson_id" AND next."version" > p."version")
        ORDER BY p."published_at" LIMIT $1`,
      [limit],
    );
  }

  /** Publications that have no snapshot at all. */
  withoutLevels(limit: number): Promise<PublicationFinding[]> {
    return this.find(
      `SELECT p."lesson_id", p."id" AS "publication_id" FROM "lesson_publications" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "lesson_publication_levels" l WHERE l."publication_id" = p."id")
        ORDER BY p."published_at" LIMIT $1`,
      [limit],
    );
  }

  /** Of the given lessons, the ids that have an active publication. */
  async lessonsWithActivePublication(
    lessonIds: readonly string[],
  ): Promise<Set<string>> {
    if (lessonIds.length === 0) return new Set();
    const rows: { lesson_id: string }[] = await this.dataSource.query(
      `SELECT DISTINCT "lesson_id" FROM "lesson_publications"
        WHERE "ended_at" IS NULL AND "lesson_id" = ANY($1::uuid[])`,
      [lessonIds],
    );
    return new Set(rows.map((row) => row.lesson_id));
  }

  /** Stored snapshots in a stable order, after the given key (keyset paging for hash verification). */
  async snapshotsAfter(
    after: { publicationId: string; level: string } | null,
    limit: number,
  ): Promise<StoredSnapshot[]> {
    const rows: {
      publication_id: string;
      lesson_id: string;
      level: string;
      content: unknown;
      content_hash: string;
      content_bytes: number;
    }[] = await this.dataSource.query(
      `SELECT "publication_id", "lesson_id", "level", "content", "content_hash", "content_bytes"
         FROM "lesson_publication_levels"
        WHERE $1::uuid IS NULL OR ("publication_id", "level") > ($1::uuid, $2::text)
        ORDER BY "publication_id", "level" LIMIT $3`,
      [after?.publicationId ?? null, after?.level ?? null, limit],
    );
    return rows.map((row) => ({
      publicationId: row.publication_id,
      lessonId: row.lesson_id,
      level: row.level,
      content: row.content,
      contentHash: row.content_hash.trim(),
      contentBytes: row.content_bytes,
    }));
  }

  private async find(
    sql: string,
    params: unknown[],
  ): Promise<PublicationFinding[]> {
    const rows: { lesson_id: string; publication_id: string | null }[] =
      await this.dataSource.query(sql, params);
    return rows.map((row) => ({
      lessonId: row.lesson_id,
      publicationId: row.publication_id,
    }));
  }
}
