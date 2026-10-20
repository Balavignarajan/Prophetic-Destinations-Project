import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

/** A lesson as the related-lessons picker shows it: enough course/module context to tell similar titles apart. */
export interface LessonLookupRow {
  id: string;
  title: string;
  status: string;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
}

/** A related link as authored: the target (with context) plus the link's own optional label and level visibility. */
export interface RelatedLinkRow extends LessonLookupRow {
  /** Custom text for the link, or null = use the target's published title. */
  label: string | null;
  /** Levels the LINK is shown at, or null = every level. */
  levels: string[] | null;
}

/** The link metadata alone (what is stored and frozen), keyed by target. */
export interface RelatedLinkInput {
  lessonId: string;
  label: string | null;
  levels: string[] | null;
}

interface Row {
  id: string;
  title: string;
  status: string;
  course_id: string;
  course_title: string;
  module_id: string | null;
  module_title: string | null;
}

const SELECT = `SELECT l."id", l."title", l."status", l."course_id", c."title" AS "course_title", l."module_id", m."title" AS "module_title"
                  FROM "lessons" l
                  JOIN "courses" c ON c."id" = l."course_id"
             LEFT JOIN "course_modules" m ON m."id" = l."module_id"`;

const toRow = (row: Row): LessonLookupRow => ({
  id: row.id,
  title: row.title,
  status: row.status,
  courseId: row.course_id,
  courseTitle: row.course_title,
  moduleId: row.module_id,
  moduleTitle: row.module_title,
});

/**
 * The manually chosen related lessons of a lesson (workbook RelatedLesson): lesson metadata, in the author's order. Raw SQL, like the other
 * cross-table reads of this module. Callers hold the source lesson's row lock when they write.
 */
@Injectable()
export class LessonRelatedRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private db(manager?: EntityManager): Pick<EntityManager, 'query'> {
    return manager ?? this.dataSource;
  }

  /** The ids of the lesson's related lessons, in order. */
  async listIds(lessonId: string, manager?: EntityManager): Promise<string[]> {
    const rows: { related_lesson_id: string }[] = await this.db(manager).query(
      `SELECT "related_lesson_id" FROM "lesson_related" WHERE "lesson_id" = $1 ORDER BY "position"`,
      [lessonId],
    );
    return rows.map((row) => row.related_lesson_id);
  }

  /** The links in order with their label and level visibility (no target context). */
  async listLinks(lessonId: string, manager?: EntityManager): Promise<RelatedLinkInput[]> {
    const rows: { related_lesson_id: string; label: string | null; levels: string[] | null }[] = await this.db(manager).query(
      `SELECT "related_lesson_id", "label", "levels" FROM "lesson_related" WHERE "lesson_id" = $1 ORDER BY "position"`,
      [lessonId],
    );
    return rows.map((row) => ({ lessonId: row.related_lesson_id, label: row.label, levels: row.levels }));
  }

  /** The related lessons with their course/module context and the link's label and levels, in order. */
  async listDetailed(lessonId: string, manager?: EntityManager): Promise<RelatedLinkRow[]> {
    const rows: (Row & { label: string | null; levels: string[] | null })[] = await this.db(manager).query(
      `SELECT l."id", l."title", l."status", l."course_id", c."title" AS "course_title", l."module_id", m."title" AS "module_title", r."label", r."levels"
         FROM "lesson_related" r
         JOIN "lessons" l ON l."id" = r."related_lesson_id"
         JOIN "courses" c ON c."id" = l."course_id"
    LEFT JOIN "course_modules" m ON m."id" = l."module_id"
        WHERE r."lesson_id" = $1 ORDER BY r."position"`,
      [lessonId],
    );
    return rows.map((row) => ({ ...toRow(row), label: row.label, levels: row.levels }));
  }

  /**
   * Which of these ids are existing lessons, holding a SHARE lock on each until the transaction ends (rows in ascending id order). Deleting a lesson
   * takes FOR UPDATE on it (LessonRepository.lockMany), which conflicts with this lock, so a target cannot be deleted between the check and the write of
   * a reference to it. NOWAIT: this transaction never WAITS for a target (the caller already holds its own lesson lock), so it can never be the waiting
   * half of a lock cycle; if the target is being deleted or changed right now, PostgreSQL answers 55P03, which TransactionRunner turns into a retryable 409.
   */
  async existingLocked(ids: readonly string[], manager: EntityManager): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows: { id: string }[] = await manager.query(
      `SELECT "id" FROM "lessons" WHERE "id" = ANY($1::uuid[]) ORDER BY "id" FOR SHARE NOWAIT`,
      [ids],
    );
    return new Set(rows.map((row) => row.id));
  }

  /** Which of these ids are existing lessons. */
  async existing(ids: readonly string[], manager?: EntityManager): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows: { id: string }[] = await this.db(manager).query(`SELECT "id" FROM "lessons" WHERE "id" = ANY($1::uuid[])`, [ids]);
    return new Set(rows.map((row) => row.id));
  }

  /**
   * The lessons that currently link TO this lesson (its sources), in id order: through their lesson-metadata related links AND through a
   * Continue Exploring block of theirs. The two kinds of link stay separate data; this only answers "who points here?".
   */
  async sourcesOf(targetId: string, manager?: EntityManager): Promise<string[]> {
    const rows: { lesson_id: string }[] = await this.db(manager).query(
      `SELECT "lesson_id" FROM (
         SELECT "lesson_id" FROM "lesson_related" WHERE "related_lesson_id" = $1
         UNION
         SELECT "lesson_id" FROM "lesson_blocks"
          WHERE "type" = 'CONTINUE_EXPLORING'
            AND jsonb_path_exists("shared_content", '$.links[*] ? (@.lessonId == $id)', jsonb_build_object('id', lower($1::text)))
       ) s ORDER BY "lesson_id"`,
      [targetId],
    );
    return rows.map((row) => row.lesson_id);
  }

  /**
   * Removes one target from the Continue Exploring blocks of a source (the caller holds the source lock and applies the lesson's edit rules). Each
   * changed block's version and updated_at move. Published snapshots are never touched.
   */
  async removeBlockLinks(sourceId: string, targetId: string, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "lesson_blocks"
          SET "shared_content" = jsonb_set(
                "shared_content", '{links}',
                COALESCE((SELECT jsonb_agg(l) FROM jsonb_array_elements("shared_content"->'links') AS l WHERE lower(l->>'lessonId') <> lower($2::text)), '[]'::jsonb)),
              "version" = "version" + 1, "updated_at" = now()
        WHERE "lesson_id" = $1 AND "type" = 'CONTINUE_EXPLORING'
          AND jsonb_path_exists("shared_content", '$.links[*] ? (@.lessonId == $id)', jsonb_build_object('id', lower($2::text)))`,
      [sourceId, targetId],
    );
  }

  /** Context of specific lessons (for showing the targets already chosen in a block), in the order asked. Missing ids are simply absent. */
  async lookup(ids: readonly string[]): Promise<LessonLookupRow[]> {
    if (ids.length === 0) return [];
    const rows: Row[] = await this.dataSource.query(`${SELECT} WHERE l."id" = ANY($1::uuid[])`, [ids]);
    const byId = new Map(rows.map((row) => [row.id, toRow(row)]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** Removes the single link from one source to one target. */
  async removeLink(sourceId: string, targetId: string, manager: EntityManager): Promise<void> {
    await manager.query(`DELETE FROM "lesson_related" WHERE "lesson_id" = $1 AND "related_lesson_id" = $2`, [sourceId, targetId]);
  }

  /** Removes every link that points at this lesson (the caller has locked and versioned each source, see LessonService.delete). */
  async removeTarget(targetId: string, manager: EntityManager): Promise<void> {
    await manager.query(`DELETE FROM "lesson_related" WHERE "related_lesson_id" = $1`, [targetId]);
  }

  /** Makes the lesson's related links exactly `links`, in that order, with their labels and level visibility. */
  async replace(lessonId: string, links: readonly RelatedLinkInput[], manager: EntityManager): Promise<void> {
    await manager.query(`DELETE FROM "lesson_related" WHERE "lesson_id" = $1`, [lessonId]);
    if (links.length === 0) return;
    // levels travel as one text per link ('' = all levels, otherwise comma-separated) because Postgres cannot unnest a jagged array.
    await manager.query(
      `INSERT INTO "lesson_related" ("lesson_id", "related_lesson_id", "position", "label", "levels")
       SELECT $1::uuid, v."id", v."position", v."label",
              CASE WHEN v."levels" = '' THEN NULL ELSE string_to_array(v."levels", ',') END
         FROM unnest($2::uuid[], $3::int[], $4::text[], $5::text[]) AS v("id", "position", "label", "levels")`,
      [lessonId, links.map((l) => l.lessonId), links.map((_, index) => index + 1), links.map((l) => l.label), links.map((l) => (l.levels ? l.levels.join(',') : ''))],
    );
  }

  /** Copies the links the source lesson owns to another lesson (a duplicate). Links that point AT the source are not copied. */
  async copyOwned(fromLessonId: string, toLessonId: string, manager: EntityManager): Promise<void> {
    await manager.query(
      `INSERT INTO "lesson_related" ("lesson_id", "related_lesson_id", "position", "label", "levels")
       SELECT $2::uuid, "related_lesson_id", "position", "label", "levels" FROM "lesson_related"
        WHERE "lesson_id" = $1 AND "related_lesson_id" <> $2::uuid`,
      [fromLessonId, toLessonId],
    );
  }

  /** Lessons whose title contains the text (case-insensitive), for the picker; `excludeId` is left out. */
  async search(text: string, excludeId: string | null, limit: number): Promise<LessonLookupRow[]> {
    const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows: Row[] = await this.dataSource.query(
      `${SELECT} WHERE l."title" ILIKE $1 AND ($2::uuid IS NULL OR l."id" <> $2::uuid) ORDER BY c."title", l."title" LIMIT $3`,
      [pattern, excludeId, limit],
    );
    return rows.map(toRow);
  }
}
