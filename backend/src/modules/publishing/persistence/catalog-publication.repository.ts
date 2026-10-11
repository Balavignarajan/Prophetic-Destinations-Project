import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import type {
  CatalogLevelContent,
  PublishedModuleEntry,
  SerializedCatalogLevel,
} from '../domain/catalog-snapshot.js';
import type {
  CatalogCause,
  CatalogLevelSnapshot,
  CatalogPublication,
  PublicationEndReason,
  PublicationLevelSummary,
} from '../domain/models.js';

export interface NewCatalogPublication {
  courseId: string;
  version: number;
  cause: CatalogCause;
  snapshotSchemaVersion: number;
  courseTitle: string;
  courseDescription: string | null;
  sourceCourseVersion: number;
  publishedBy: string;
}

interface PublicationRow {
  id: string;
  course_id: string;
  version: number;
  cause: CatalogCause;
  snapshot_schema_version: number;
  course_title: string;
  course_description: string | null;
  source_course_version: number;
  published_at: Date;
  published_by: string;
  ended_at: Date | null;
  ended_by: string | null;
  ended_reason: PublicationEndReason | null;
}

const COLUMNS = `p."id", p."course_id", p."version", p."cause", p."snapshot_schema_version", p."course_title",
  p."course_description", p."source_course_version", p."published_at", p."published_by", p."ended_at", p."ended_by",
  p."ended_reason"`;

const LEVEL_ORDER: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

/**
 * Catalog publications of courses: their module memberships and per-level snapshots. Write methods
 * require the caller's transaction `manager`. There is no update (beyond ending a publication, once)
 * and no delete: history is retained, and the database enforces it as well.
 * Returns domain objects, never entities.
 */
@Injectable()
export class CatalogPublicationRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The course's active catalog publication (at most one exists), or null. */
  async findActive(
    courseId: string,
    manager?: EntityManager,
  ): Promise<CatalogPublication | null> {
    const rows: PublicationRow[] = await this.db(manager).query(
      `SELECT ${COLUMNS} FROM "course_publications" p
        WHERE p."course_id" = $1 AND p."ended_at" IS NULL`,
      [courseId],
    );
    return rows[0] ? (await this.hydrate(rows, manager))[0] : null;
  }

  /** The most recent catalog version of the course, ended or not (null if it was never published). */
  async findLatest(
    courseId: string,
    manager?: EntityManager,
  ): Promise<CatalogPublication | null> {
    const rows: PublicationRow[] = await this.db(manager).query(
      `SELECT ${COLUMNS} FROM "course_publications" p
        WHERE p."course_id" = $1 ORDER BY p."version" DESC LIMIT 1`,
      [courseId],
    );
    return rows[0] ? (await this.hydrate(rows, manager))[0] : null;
  }

  async findByVersion(
    courseId: string,
    version: number,
    manager?: EntityManager,
  ): Promise<CatalogPublication | null> {
    const rows: PublicationRow[] = await this.db(manager).query(
      `SELECT ${COLUMNS} FROM "course_publications" p
        WHERE p."course_id" = $1 AND p."version" = $2`,
      [courseId, version],
    );
    return rows[0] ? (await this.hydrate(rows, manager))[0] : null;
  }

  /** Newest version first. */
  async list(
    courseId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: CatalogPublication[]; total: number }> {
    const rows: PublicationRow[] = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM "course_publications" p
        WHERE p."course_id" = $1 ORDER BY p."version" DESC LIMIT $2 OFFSET $3`,
      [courseId, limit, offset],
    );
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS "total" FROM "course_publications" WHERE "course_id" = $1`,
      [courseId],
    );
    return { items: await this.hydrate(rows), total };
  }

  /** The stored content of every level of one catalog version (the base a new version keeps its order from). */
  async findLevelContents(
    publicationId: string,
    manager?: EntityManager,
  ): Promise<Map<LearningLevel, CatalogLevelContent>> {
    const rows: { level: LearningLevel; content: CatalogLevelContent }[] =
      await this.db(manager).query(
        `SELECT "level", "content" FROM "course_publication_levels" WHERE "publication_id" = $1`,
        [publicationId],
      );
    return new Map(rows.map((row) => [row.level, row.content]));
  }

  async findLevelSnapshot(
    courseId: string,
    version: number,
    level: LearningLevel,
  ): Promise<CatalogLevelSnapshot | null> {
    const rows: {
      publication_id: string;
      course_id: string;
      version: number;
      level: LearningLevel;
      content: CatalogLevelContent;
      content_hash: string;
      content_bytes: number;
    }[] = await this.dataSource.query(
      `SELECT l."publication_id", l."course_id", p."version", l."level", l."content",
              l."content_hash", l."content_bytes"
         FROM "course_publication_levels" l
         JOIN "course_publications" p ON p."id" = l."publication_id"
        WHERE p."course_id" = $1 AND p."version" = $2 AND l."level" = $3`,
      [courseId, version, level],
    );
    const row = rows[0];
    return row
      ? {
          publicationId: row.publication_id,
          courseId: row.course_id,
          version: row.version,
          level: row.level,
          content: row.content,
          contentHash: row.content_hash.trim(),
          contentBytes: row.content_bytes,
        }
      : null;
  }

  /**
   * The next version number: the highest ever used plus one. Only safe while the caller holds the course
   * row lock (it serializes everything that creates versions); UNIQUE (course_id, version) is the backstop.
   */
  async nextVersion(courseId: string, manager: EntityManager): Promise<number> {
    const [{ next }]: { next: number }[] = await manager.query(
      `SELECT COALESCE(MAX("version"), 0) + 1 AS "next" FROM "course_publications" WHERE "course_id" = $1`,
      [courseId],
    );
    return next;
  }

  /**
   * Ends the course's active catalog publication, if any, and returns it. `ended_at IS NULL` (and a
   * database trigger) mean a publication is ended only once and never reactivated.
   */
  async endActive(
    courseId: string,
    reason: PublicationEndReason,
    endedBy: string,
    manager: EntityManager,
  ): Promise<CatalogPublication | null> {
    const result: PublicationRow[][] = await manager.query(
      `UPDATE "course_publications" AS p
          SET "ended_at" = clock_timestamp(), "ended_by" = $2, "ended_reason" = $3
        WHERE p."course_id" = $1 AND p."ended_at" IS NULL
        RETURNING ${COLUMNS}`,
      [courseId, endedBy, reason],
    );
    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING.
    const rows = result[0];
    return rows?.[0] ? (await this.hydrate(rows, manager))[0] : null;
  }

  async insert(
    publication: NewCatalogPublication,
    manager: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO "course_publications"
         ("id", "course_id", "version", "cause", "snapshot_schema_version", "course_title",
          "course_description", "source_course_version", "published_by")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        publication.courseId,
        publication.version,
        publication.cause,
        publication.snapshotSchemaVersion,
        publication.courseTitle,
        publication.courseDescription,
        publication.sourceCourseVersion,
        publication.publishedBy,
      ],
    );
    return id;
  }

  async insertModules(
    publicationId: string,
    courseId: string,
    modules: readonly PublishedModuleEntry[],
    manager: EntityManager,
  ): Promise<void> {
    for (const module of modules) {
      await manager.query(
        `INSERT INTO "course_publication_modules"
           ("publication_id", "course_id", "module_id", "position", "title", "description")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          publicationId,
          courseId,
          module.moduleId,
          module.position,
          module.title,
          module.description,
        ],
      );
    }
  }

  async insertLevels(
    publicationId: string,
    courseId: string,
    levels: readonly SerializedCatalogLevel[],
    manager: EntityManager,
  ): Promise<void> {
    for (const level of levels) {
      await manager.query(
        `INSERT INTO "course_publication_levels"
           ("publication_id", "course_id", "level", "content", "content_hash", "content_bytes")
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          publicationId,
          courseId,
          level.level,
          level.json,
          level.hash,
          level.bytes,
        ],
      );
    }
  }

  /** Re-reads a version inside the writer's transaction. */
  async get(id: string, manager: EntityManager): Promise<CatalogPublication> {
    const rows: PublicationRow[] = await manager.query(
      `SELECT ${COLUMNS} FROM "course_publications" p WHERE p."id" = $1`,
      [id],
    );
    return (await this.hydrate(rows, manager))[0];
  }

  private async hydrate(
    rows: PublicationRow[],
    manager?: EntityManager,
  ): Promise<CatalogPublication[]> {
    if (rows.length === 0) return [];
    const db = this.db(manager);
    const ids = rows.map((row) => row.id);
    const modules: {
      publication_id: string;
      module_id: string;
      position: number;
      title: string;
      description: string | null;
    }[] = await db.query(
      `SELECT "publication_id", "module_id", "position", "title", "description"
         FROM "course_publication_modules" WHERE "publication_id" = ANY($1::uuid[])
        ORDER BY "position"`,
      [ids],
    );
    const levels: {
      publication_id: string;
      level: LearningLevel;
      content_hash: string;
      content_bytes: number;
    }[] = await db.query(
      `SELECT "publication_id", "level", "content_hash", "content_bytes"
         FROM "course_publication_levels" WHERE "publication_id" = ANY($1::uuid[])`,
      [ids],
    );
    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      version: row.version,
      cause: row.cause,
      snapshotSchemaVersion: row.snapshot_schema_version,
      courseTitle: row.course_title,
      courseDescription: row.course_description,
      sourceCourseVersion: row.source_course_version,
      publishedAt: row.published_at,
      publishedBy: row.published_by,
      endedAt: row.ended_at,
      endedBy: row.ended_by,
      endedReason: row.ended_reason,
      modules: modules
        .filter((module) => module.publication_id === row.id)
        .map((module) => ({
          moduleId: module.module_id,
          position: module.position,
          title: module.title,
          description: module.description,
        })),
      levels: levels
        .filter((level) => level.publication_id === row.id)
        .sort(
          (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
        )
        .map((level): PublicationLevelSummary => ({
          level: level.level,
          contentHash: level.content_hash.trim(),
          contentBytes: level.content_bytes,
        })),
    }));
  }

  private db(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }
}
