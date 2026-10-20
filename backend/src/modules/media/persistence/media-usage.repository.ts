import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaAssetEntity } from './media-asset.entity.js';

export interface MediaUsage {
  /** Lessons whose DRAFT content (a block or a level variant) points at the asset. */
  draftLessons: number;
  /** Lessons whose currently ACTIVE published snapshot points at the asset. */
  publishedLessons: number;
  /** Courses whose working cover is the asset. */
  draftCourses: number;
  /** Courses whose ACTIVE catalog version publishes the asset as its cover. */
  publishedCourses: number;
}

/** Where a lesson uses the image: a block type, 'COVER' (the lesson's cover) or 'LEVEL_VARIANT' (a per-level variant's content). */
export interface UsedByLesson {
  lessonId: string;
  title: string;
  courseId: string | null;
  courseTitle: string | null;
  moduleId: string | null;
  moduleTitle: string | null;
  uses: string[];
  /** Published usage only: the levels whose ACTIVE snapshot contains the image. */
  levels?: string[];
}

export interface UsedByCourse {
  courseId: string;
  title: string;
}

export interface MediaUsageDetail {
  working: { lessons: UsedByLesson[]; courses: UsedByCourse[] };
  published: { lessons: UsedByLesson[]; courses: UsedByCourse[] };
  /** True for a list that was cut at `limit`: it is NOT the complete list, and the exact counts in `totals` still are. */
  truncated: { workingLessons: boolean; publishedLessons: boolean; workingCourses: boolean; publishedCourses: boolean };
  limit: number;
  /** The authoritative counts (the same ones deletion is decided on). */
  totals: MediaUsage;
}

/**
 * The structured match of a published snapshot's blocks that reference an image, as one jsonpath filter predicate (the single place it is written, so
 * the usage COUNT that guards deletion and the usage LIST agree). It is an exact structural match on ids, never a text search:
 * an IMAGE, INTERACTIVE_IMAGE or MAP block's content.mediaId, a TIMELINE event's mediaId, a HISTORICAL_EVIDENCE, SECTION_INTRO, SYMBOL_STUDY or NARRATIVE_SCENE image's mediaId, and a MEDIA_ANIMATION block's mediaId or posterMediaId.
 */
const PUBLISHED_BLOCK_REFERENCE =
  '((@.type == "IMAGE" || @.type == "INTERACTIVE_IMAGE" || @.type == "MAP") && @.content.mediaId == $id) || (@.type == "TIMELINE" && exists(@.content.events[*] ? (@.mediaId == $id))) || ((@.type == "HISTORICAL_EVIDENCE" || @.type == "SECTION_INTRO" || @.type == "SYMBOL_STUDY" || @.type == "NARRATIVE_SCENE") && @.content.image.mediaId == $id) || (@.type == "MEDIA_ANIMATION" && (@.content.mediaId == $id || @.content.posterMediaId == $id))';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where an asset is referenced from, so deleting it can be refused instead of breaking lessons.
 *
 * Media is the one module that must know whether anything points at its rows, but it must not depend on Lessons or
 * Publishing (they depend on it). References are plain asset ids inside block content (`mediaId`), so this reads the two
 * authoring tables and the immutable snapshot table with read-only queries. It never writes to them.
 */
@Injectable()
export class MediaUsageRepository {
  constructor(
    @InjectRepository(MediaAssetEntity)
    private readonly assets: Repository<MediaAssetEntity>,
  ) {}

  async usageOf(id: string): Promise<MediaUsage> {
    const [draft]: { n: number }[] = await this.assets.query(
      `SELECT count(DISTINCT lesson_id)::int AS n FROM (
         SELECT "lesson_id" FROM "lesson_blocks"
           WHERE "type" IN ('IMAGE', 'INTERACTIVE_IMAGE', 'MAP') AND "shared_content"->>'mediaId' = $1
         UNION ALL
         SELECT "lesson_id" FROM "lesson_blocks"
           WHERE "type" = 'TIMELINE'
             AND jsonb_path_exists("shared_content", '$.events[*] ? (@.mediaId == $id)', jsonb_build_object('id', $1::text))
         UNION ALL
         SELECT "lesson_id" FROM "lesson_blocks"
           WHERE "type" IN ('HISTORICAL_EVIDENCE', 'SECTION_INTRO', 'SYMBOL_STUDY', 'NARRATIVE_SCENE') AND "shared_content"->'image'->>'mediaId' = $1
         UNION ALL
         SELECT "lesson_id" FROM "lesson_blocks"
           WHERE "type" = 'MEDIA_ANIMATION' AND ("shared_content"->>'mediaId' = $1 OR "shared_content"->>'posterMediaId' = $1)
         UNION ALL
         SELECT "lesson_id" FROM "lesson_block_levels"
           WHERE "content"->>'mediaId' = $1
         UNION ALL
         SELECT "id" FROM "lessons" WHERE "cover_media_id"::text = $1
       ) AS refs`,
      [id],
    );
    // Snapshots are immutable JSON. References are matched structurally and exactly: an IMAGE, INTERACTIVE_IMAGE or MAP block's content.mediaId, a TIMELINE event's mediaId, a HISTORICAL_EVIDENCE, SECTION_INTRO or SYMBOL_STUDY image's mediaId or the
    // snapshot's lesson.coverMediaId (snapshots written before covers existed simply have no such field).
    const [published]: { n: number }[] = await this.assets.query(
      `SELECT count(DISTINCT p."lesson_id")::int AS n
         FROM "lesson_publication_levels" l
         JOIN "lesson_publications" p ON p."id" = l."publication_id"
        WHERE p."ended_at" IS NULL
          AND (l."content" #>> '{lesson,coverMediaId}' = $1
               OR jsonb_path_exists(
                    l."content",
                    ('$.blocks[*] ? (' || $2::text || ')')::jsonpath,
                    jsonb_build_object('id', $1::text)))`,
      [id, PUBLISHED_BLOCK_REFERENCE],
    );
    // Course covers: the working cover, and the cover of the course's ACTIVE catalog version (column and snapshot).
    const [draftCourses]: { n: number }[] = await this.assets.query(
      `SELECT count(*)::int AS n FROM "courses" WHERE "cover_media_id"::text = $1`,
      [id],
    );
    const [publishedCourses]: { n: number }[] = await this.assets.query(
      `SELECT count(DISTINCT p."course_id")::int AS n
         FROM "course_publications" p
        WHERE p."ended_at" IS NULL
          AND (p."course_cover_media_id"::text = $1
               OR EXISTS (SELECT 1 FROM "course_publication_levels" l
                           WHERE l."publication_id" = p."id" AND l."content" #>> '{course,coverMediaId}' = $1))`,
      [id],
    );
    return {
      draftLessons: draft?.n ?? 0,
      publishedLessons: published?.n ?? 0,
      draftCourses: draftCourses?.n ?? 0,
      publishedCourses: publishedCourses?.n ?? 0,
    };
  }

  /**
   * The places the image is used, for the admin "Where this image is used" view: working usage (draft content and working covers) and
   * published usage (ACTIVE lesson snapshots and ACTIVE catalog covers) kept apart. The same predicates as `usageOf`. Each list is cut at
   * `limit` and says so (`truncated`); the exact counts are always returned in `totals`. Read-only.
   */
  async detailOf(id: string, limit: number): Promise<MediaUsageDetail> {
    const cap = limit + 1;
    const workingRows: LessonRow[] = await this.assets.query(
      `WITH refs AS (
         SELECT "lesson_id", "type" AS use FROM "lesson_blocks"
           WHERE "type" IN ('IMAGE', 'INTERACTIVE_IMAGE', 'MAP') AND "shared_content"->>'mediaId' = $1
         UNION ALL
         SELECT "lesson_id", "type" FROM "lesson_blocks"
           WHERE "type" = 'TIMELINE'
             AND jsonb_path_exists("shared_content", '$.events[*] ? (@.mediaId == $id)', jsonb_build_object('id', $1::text))
         UNION ALL
         SELECT "lesson_id", "type" FROM "lesson_blocks"
           WHERE "type" IN ('HISTORICAL_EVIDENCE', 'SECTION_INTRO', 'SYMBOL_STUDY', 'NARRATIVE_SCENE') AND "shared_content"->'image'->>'mediaId' = $1
         UNION ALL
         SELECT "lesson_id", "type" FROM "lesson_blocks"
           WHERE "type" = 'MEDIA_ANIMATION' AND ("shared_content"->>'mediaId' = $1 OR "shared_content"->>'posterMediaId' = $1)
         UNION ALL
         SELECT "lesson_id", 'LEVEL_VARIANT' FROM "lesson_block_levels" WHERE "content"->>'mediaId' = $1
         UNION ALL
         SELECT "id", 'COVER' FROM "lessons" WHERE "cover_media_id"::text = $1
       )
       SELECT l."id" AS lesson_id, l."title", l."course_id", c."title" AS course_title, l."module_id", m."title" AS module_title,
              array_agg(DISTINCT r.use ORDER BY r.use) AS uses
         FROM refs r
         JOIN "lessons" l ON l."id" = r."lesson_id"
         JOIN "courses" c ON c."id" = l."course_id"
    LEFT JOIN "course_modules" m ON m."id" = l."module_id"
        GROUP BY l."id", c."title", m."title"
        ORDER BY c."title", l."title", l."id"
        LIMIT $2`,
      [id, cap],
    );
    const workingCourses: { id: string; title: string }[] = await this.assets.query(
      `SELECT "id", "title" FROM "courses" WHERE "cover_media_id"::text = $1 ORDER BY "title", "id" LIMIT $2`,
      [id, cap],
    );
    // Published: one row per lesson, with the levels whose active snapshot has the image and the block types that reference it.
    const publishedRows: { lesson_id: string; title: string | null; course_id: string | null; levels: string[]; cover: boolean; types: unknown }[] = await this.assets.query(
      `WITH hit AS (
         SELECT p."lesson_id", l."level",
                l."content" #>> '{lesson,title}' AS title,
                l."content" #>> '{lesson,courseId}' AS course_id,
                (l."content" #>> '{lesson,coverMediaId}' = $1) AS cover,
                jsonb_path_query_array(l."content", ('$.blocks[*] ? (' || $3::text || ') .type')::jsonpath, jsonb_build_object('id', $1::text)) AS types
           FROM "lesson_publication_levels" l
           JOIN "lesson_publications" p ON p."id" = l."publication_id"
          WHERE p."ended_at" IS NULL
            AND (l."content" #>> '{lesson,coverMediaId}' = $1
                 OR jsonb_path_exists(l."content", ('$.blocks[*] ? (' || $3::text || ')')::jsonpath, jsonb_build_object('id', $1::text)))
       )
       SELECT h."lesson_id", max(h.title) AS title, max(h.course_id) AS course_id, array_agg(h."level" ORDER BY h."level") AS levels,
              bool_or(h.cover) AS cover, jsonb_agg(h.types) AS types
         FROM hit h GROUP BY h."lesson_id" ORDER BY max(h.title), h."lesson_id" LIMIT $2`,
      [id, cap, PUBLISHED_BLOCK_REFERENCE],
    );
    const publishedCourses: { course_id: string; title: string | null }[] = await this.assets.query(
      `SELECT p."course_id", (SELECT c."title" FROM "courses" c WHERE c."id" = p."course_id") AS title
         FROM "course_publications" p
        WHERE p."ended_at" IS NULL
          AND (p."course_cover_media_id"::text = $1
               OR EXISTS (SELECT 1 FROM "course_publication_levels" l
                           WHERE l."publication_id" = p."id" AND l."content" #>> '{course,coverMediaId}' = $1))
        ORDER BY 2, 1 LIMIT $2`,
      [id, cap],
    );

    // Course titles for the published lessons come from the course ids their snapshots name (only well-formed ids are looked up).
    const courseIds = [...new Set(publishedRows.map((r) => r.course_id).filter((v): v is string => typeof v === 'string' && UUID.test(v)))];
    const courseTitles = new Map<string, string>();
    if (courseIds.length > 0) {
      const rows: { id: string; title: string }[] = await this.assets.query(`SELECT "id", "title" FROM "courses" WHERE "id" = ANY($1::uuid[])`, [courseIds]);
      for (const row of rows) courseTitles.set(row.id, row.title);
    }

    const cut = <T>(rows: T[]) => ({ rows: rows.slice(0, limit), truncated: rows.length > limit });
    const wl = cut(workingRows);
    const pl = cut(publishedRows);
    const wc = cut(workingCourses);
    const pc = cut(publishedCourses);
    return {
      working: {
        lessons: wl.rows.map((r) => ({ lessonId: r.lesson_id, title: r.title, courseId: r.course_id, courseTitle: r.course_title, moduleId: r.module_id, moduleTitle: r.module_title, uses: r.uses })),
        courses: wc.rows.map((r) => ({ courseId: r.id, title: r.title })),
      },
      published: {
        lessons: pl.rows.map((r) => {
          const types = Array.isArray(r.types) ? (r.types as unknown[]).flat().filter((v): v is string => typeof v === 'string') : [];
          return {
            lessonId: r.lesson_id,
            title: r.title ?? '(untitled)',
            courseId: r.course_id && UUID.test(r.course_id) ? r.course_id : null,
            courseTitle: r.course_id ? (courseTitles.get(r.course_id) ?? null) : null,
            moduleId: null,
            moduleTitle: null,
            uses: [...new Set([...(r.cover ? ['COVER'] : []), ...types])].sort(),
            levels: r.levels,
          };
        }),
        courses: pc.rows.map((r) => ({ courseId: r.course_id, title: r.title ?? '(untitled course)' })),
      },
      truncated: { workingLessons: wl.truncated, publishedLessons: pl.truncated, workingCourses: wc.truncated, publishedCourses: pc.truncated },
      limit,
      totals: await this.usageOf(id),
    };
  }
}

interface LessonRow {
  lesson_id: string;
  title: string;
  course_id: string | null;
  course_title: string | null;
  module_id: string | null;
  module_title: string | null;
  uses: string[];
}
