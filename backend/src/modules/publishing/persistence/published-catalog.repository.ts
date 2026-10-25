import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { type CourseBook, type LearningLevel, isCourseBook } from '../../../shared-kernel/index.js';
import type { CatalogLevelContent } from '../domain/catalog-snapshot.js';

/** The active catalog snapshot of one course at one level. */
export interface ActiveCatalogLevel {
  courseId: string;
  catalogVersion: number;
  content: CatalogLevelContent;
  /** The course's CMS-managed Bible book (live, like the course order), or null. Only ever read for a course that has an active publication. */
  book: CourseBook | null;
}

/** An ENABLED Home Entry as stored (its courses are not looked at here: the catalog service decides which of them are published at the learner's level). */
export interface EnabledHomeEntry {
  id: string;
  title: string;
  description: string | null;
  imageMediaId: string | null;
  position: number;
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
   * selected, so ordering can never bring an unpublished course into the list. The course's `book` (Daniel / Revelation
   * entry) is read from the same live row and is subject to the same rule. */
  async listActive(level: LearningLevel): Promise<ListedCatalogLevel[]> {
    const rows: {
      course_id: string;
      version: number;
      content: CatalogLevelContent;
      first_published_at: Date;
      book: string | null;
    }[] = await this.dataSource.query(
      `SELECT p."course_id", p."version", l."content", c."book",
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
      book: isCourseBook(row.book) ? row.book : null,
      firstPublishedAt: row.first_published_at,
    }));
  }

  /**
   * The enabled Home Entries in the administrators' Home order (`home_entries.position`, then id). Disabled entries are never selected. Like the manual course order
   * and the legacy `book`, this is the live Home setting, not part of a published snapshot; it can never bring an unpublished course into view because the catalog
   * service keeps only the courses that are currently published at the learner's level.
   */
  async listEnabledHomeEntries(): Promise<EnabledHomeEntry[]> {
    const rows: HomeEntryRow[] = await this.dataSource.query(
      `SELECT h."id", h."title", h."description", h."image_media_id", h."position"
         FROM "home_entries" h
        WHERE h."is_enabled" = true
        ORDER BY h."position", h."id"`,
    );
    return rows.map(toEnabledHomeEntry);
  }

  /** One enabled Home Entry, or null if it does not exist or is disabled. */
  async findEnabledHomeEntry(entryId: string): Promise<EnabledHomeEntry | null> {
    const rows: HomeEntryRow[] = await this.dataSource.query(
      `SELECT h."id", h."title", h."description", h."image_media_id", h."position"
         FROM "home_entries" h
        WHERE h."id" = $1 AND h."is_enabled" = true`,
      [entryId],
    );
    return rows[0] ? toEnabledHomeEntry(rows[0]) : null;
  }

  /**
   * Which ENABLED Home Entry each course belongs to (`courses.home_entry_id`), as course id -> entry id. Courses with no entry, and courses whose entry is disabled, are
   * absent. A separate small query on purpose: the main course-list queries above stay exactly as they were, so the public course catalog does not depend on this column.
   * It says nothing about publication: the catalog service intersects it with the courses that are published at the learner's level.
   */
  async listCourseEntryLinks(): Promise<Map<string, string>> {
    const rows: { course_id: string; entry_id: string }[] = await this.dataSource.query(
      `SELECT c."id" AS "course_id", c."home_entry_id" AS "entry_id"
         FROM "courses" c JOIN "home_entries" h ON h."id" = c."home_entry_id"
        WHERE h."is_enabled" = true`,
    );
    return new Map(rows.map((row) => [row.course_id, row.entry_id]));
  }

  /** The course's active catalog snapshot at `level`, or null. */
  async findActive(
    courseId: string,
    level: LearningLevel,
  ): Promise<ActiveCatalogLevel | null> {
    const rows: { version: number; content: CatalogLevelContent; book: string | null }[] =
      await this.dataSource.query(
        `SELECT p."version", l."content", c."book"
           FROM "course_publications" p
           JOIN "course_publication_levels" l ON l."publication_id" = p."id" AND l."level" = $2
           JOIN "courses" c ON c."id" = p."course_id"
          WHERE p."course_id" = $1 AND p."ended_at" IS NULL`,
        [courseId, level],
      );
    return rows[0]
      ? {
          courseId,
          catalogVersion: rows[0].version,
          content: rows[0].content,
          book: isCourseBook(rows[0].book) ? rows[0].book : null,
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
      book: string | null;
    }[] = await this.dataSource.query(
      `SELECT cp."course_id", cp."version", cl."content", co."book"
         FROM "lesson_publications" lp
         JOIN "lesson_publication_levels" ll
           ON ll."publication_id" = lp."id" AND ll."level" = $2
         JOIN "course_publications" cp
           ON cp."course_id" = lp."course_id" AND cp."ended_at" IS NULL
         JOIN "course_publication_levels" cl
           ON cl."publication_id" = cp."id" AND cl."level" = $2
         JOIN "courses" co ON co."id" = cp."course_id"
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
          book: isCourseBook(rows[0].book) ? rows[0].book : null,
        }
      : null;
  }
}

interface HomeEntryRow {
  id: string;
  title: string;
  description: string | null;
  image_media_id: string | null;
  position: number;
}

function toEnabledHomeEntry(row: HomeEntryRow): EnabledHomeEntry {
  return { id: row.id, title: row.title, description: row.description, imageMediaId: row.image_media_id, position: row.position };
}
