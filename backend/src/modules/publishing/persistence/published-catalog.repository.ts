import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import type { CatalogLevelContent } from '../domain/catalog-snapshot.js';

/** The active catalog snapshot of one course at one level. */
export interface ActiveCatalogLevel {
  courseId: string;
  catalogVersion: number;
  content: CatalogLevelContent;
}

/** An active catalog snapshot and the moment its course was first published (the listing order). */
export interface ListedCatalogLevel extends ActiveCatalogLevel {
  firstPublishedAt: Date;
}

/**
 * Read-only queries behind the learner catalog. Everything here selects ACTIVE catalog publications
 * (`ended_at IS NULL`) and nothing else; there is no path to a working copy, an ended version or another level.
 */
@Injectable()
export class PublishedCatalogRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Every course's active catalog snapshot at `level`, in the administrators' manual course order
   * (`courses.position`), then first publication, then course id. Only courses with an ACTIVE publication are
   * selected, so ordering can never bring an unpublished course into the list. */
  async listActive(level: LearningLevel): Promise<ListedCatalogLevel[]> {
    const rows: {
      course_id: string;
      version: number;
      content: CatalogLevelContent;
      first_published_at: Date;
    }[] = await this.dataSource.query(
      `SELECT p."course_id", p."version", l."content",
              (SELECT min(x."published_at") FROM "course_publications" x
                WHERE x."course_id" = p."course_id") AS "first_published_at"
         FROM "course_publications" p
         JOIN "course_publication_levels" l ON l."publication_id" = p."id" AND l."level" = $1
         JOIN "courses" c ON c."id" = p."course_id"
        WHERE p."ended_at" IS NULL
        ORDER BY c."position", "first_published_at", p."course_id"`,
      [level],
    );
    return rows.map((row) => ({
      courseId: row.course_id,
      catalogVersion: row.version,
      content: row.content,
      firstPublishedAt: row.first_published_at,
    }));
  }

  /** The course's active catalog snapshot at `level`, or null. */
  async findActive(
    courseId: string,
    level: LearningLevel,
  ): Promise<ActiveCatalogLevel | null> {
    const rows: { version: number; content: CatalogLevelContent }[] =
      await this.dataSource.query(
        `SELECT p."version", l."content"
           FROM "course_publications" p
           JOIN "course_publication_levels" l ON l."publication_id" = p."id" AND l."level" = $2
          WHERE p."course_id" = $1 AND p."ended_at" IS NULL`,
        [courseId, level],
      );
    return rows[0]
      ? {
          courseId,
          catalogVersion: rows[0].version,
          content: rows[0].content,
        }
      : null;
  }

  /**
   * The active catalog snapshot, at `level`, of the course a deliverable lesson belongs to: the lesson must have
   * an active lesson publication at that level, and its module must be listed in an active catalog
   * publication, and that snapshot must list the lesson itself at `level`. Null otherwise (so a withdrawn module or course, or an unpublished lesson, has none).
   */
  async findForLesson(
    lessonId: string,
    level: LearningLevel,
  ): Promise<ActiveCatalogLevel | null> {
    const rows: {
      course_id: string;
      version: number;
      content: CatalogLevelContent;
    }[] = await this.dataSource.query(
      `SELECT cp."course_id", cp."version", cl."content"
         FROM "lesson_publications" lp
         JOIN "lesson_publication_levels" ll
           ON ll."publication_id" = lp."id" AND ll."level" = $2
         JOIN "course_publications" cp
           ON cp."course_id" = lp."course_id" AND cp."ended_at" IS NULL
         JOIN "course_publication_levels" cl
           ON cl."publication_id" = cp."id" AND cl."level" = $2
        WHERE lp."lesson_id" = $1 AND lp."ended_at" IS NULL
          AND ((lp."module_id" IS NULL AND cl."content" @> jsonb_build_object('directLessons', jsonb_build_array(jsonb_build_object('id', lp."lesson_id"::text))))
            OR (lp."module_id" IS NOT NULL AND EXISTS (SELECT 1 FROM "course_publication_modules" m WHERE m."publication_id" = cp."id" AND m."module_id" = lp."module_id") AND cl."content" @> jsonb_build_object('modules', jsonb_build_array(jsonb_build_object('id', lp."module_id"::text, 'lessons', jsonb_build_array(jsonb_build_object('id', lp."lesson_id"::text)))))))`,
      [lessonId, level],
    );
    return rows[0]
      ? {
          courseId: rows[0].course_id,
          catalogVersion: rows[0].version,
          content: rows[0].content,
        }
      : null;
  }
}
