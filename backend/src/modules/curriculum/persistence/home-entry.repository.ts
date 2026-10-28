import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { isForeignKeyViolation, isUniqueViolation } from '../../../database/pg-errors.js';
import { BusinessRuleError, ConflictError, type ContentStatus, type LearningLevel } from '../../../shared-kernel/index.js';
import { visibleLevelsFromStored } from '../domain/home-entry-rules.js';
import type { HomeEntry, HomeEntryCourse } from '../domain/models.js';
import { HomeEntryEntity } from './home-entry.entity.js';

export interface NewHomeEntry {
  title: string;
  description: string | null;
  imageMediaId: string | null;
  isEnabled: boolean;
  position: number;
  /** As stored: null = every level (see `visibleLevelsToStored`). */
  visibleLevels: LearningLevel[] | null;
}

export interface HomeEntryChanges {
  title?: string;
  description?: string | null;
  imageMediaId?: string | null;
  isEnabled?: boolean;
  /** As stored: null = every level; undefined = leave alone. */
  visibleLevels?: LearningLevel[] | null;
}

const DUPLICATE_MESSAGE = 'There is already a Home Entry with this title. Choose a different title, or edit the existing entry.';
const MISSING_IMAGE_MESSAGE = 'The selected image no longer exists. Reload the page and choose again.';

/** Returns domain objects, never entities. Pass `manager` to take part in a transaction. */
@Injectable()
export class HomeEntryRepository {
  constructor(
    @InjectRepository(HomeEntryEntity)
    private readonly entries: Repository<HomeEntryEntity>,
  ) {}

  async create(entry: NewHomeEntry, manager: EntityManager): Promise<HomeEntry> {
    const repo = manager.getRepository(HomeEntryEntity);
    try {
      const saved = await repo.save(repo.create(entry));
      return (await this.hydrateOne(saved, manager))!;
    } catch (error) {
      throw translate(error);
    }
  }

  async findById(id: string, manager?: EntityManager): Promise<HomeEntry | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    return row ? this.hydrateOne(row, manager) : null;
  }

  /** Whether the entry exists (a course is being assigned to it): one cheap query, no course lists. */
  async exists(id: string, manager?: EntityManager): Promise<boolean> {
    return (await this.repo(manager).count({ where: { id } })) > 0;
  }

  /** Locks the entry row until the transaction ends, so two edits of one entry never interleave. */
  async findByIdForUpdate(id: string, manager: EntityManager): Promise<HomeEntry | null> {
    const row = await manager.getRepository(HomeEntryEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    return row ? this.hydrateOne(row, manager) : null;
  }

  /** Every entry in the Home order (position, then id as the tie-breaker, so the order is always deterministic), enabled or not, with its assigned courses. */
  async listAll(manager?: EntityManager): Promise<HomeEntry[]> {
    const rows = await this.repo(manager).find({ order: { position: 'ASC', id: 'ASC' } });
    return this.hydrate(rows, manager);
  }

  /** Just the ids in the Home order (what an ordering change needs). */
  async listIds(manager?: EntityManager): Promise<string[]> {
    const rows = await this.repo(manager).find({ select: { id: true }, order: { position: 'ASC', id: 'ASC' } });
    return rows.map((row) => row.id);
  }

  /** Whether another entry already has this title (ignoring case and surrounding spaces). `exceptId` is the entry being renamed. */
  async titleTaken(title: string, exceptId: string | null, manager: EntityManager): Promise<boolean> {
    const rows: { id: string }[] = await manager.query(
      `SELECT "id" FROM "home_entries" WHERE lower(btrim("title")) = lower(btrim($1)) AND ($2::uuid IS NULL OR "id" <> $2::uuid) LIMIT 1`,
      [title, exceptId],
    );
    return rows.length > 0;
  }

  /** Serializes everything that creates, renames, deletes or reorders Home Entries until the transaction ends. */
  async lockOrdering(manager: EntityManager): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('home_entries_ordering'))`);
  }

  /** The position for an entry appended at the end. Call it after `lockOrdering`. */
  async nextPosition(manager: EntityManager): Promise<number> {
    const [row]: { next: number }[] = await manager.query(`SELECT COALESCE(max("position"), 0) + 1 AS "next" FROM "home_entries"`);
    return Number(row.next);
  }

  /**
   * Assigns positions in one statement: ids[i] gets positions[i]. Raw SQL on purpose: a reorder is not a content edit, so `version` and `updated_at` stay as they are
   * (the same rule as the course order).
   */
  async applyPositions(ids: readonly string[], positions: readonly number[], manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "home_entries" AS h SET "position" = v."position"
         FROM unnest($1::uuid[], $2::int[]) AS v("id", "position")
        WHERE h."id" = v."id" AND h."position" <> v."position"`,
      [ids, positions],
    );
  }

  async update(id: string, changes: HomeEntryChanges, manager: EntityManager): Promise<HomeEntry> {
    const repo = manager.getRepository(HomeEntryEntity);
    try {
      await repo.update({ id }, changes);
    } catch (error) {
      throw translate(error);
    }
    return (await this.hydrateOne(await repo.findOneOrFail({ where: { id } }), manager))!;
  }

  /**
   * Takes every course out of the entry (their Home Entry becomes none) and returns how many there were. Raw SQL on purpose: assigning a course to a Home Entry is a
   * classification, not a content edit, so the courses' status, version and publication are not touched. The database foreign key does the same on its own if an entry is ever
   * deleted another way; doing it here, in the same transaction as the delete, makes the number known and the step explicit.
   */
  async unassignCourses(entryId: string, manager: EntityManager): Promise<number> {
    const rows: { id: string }[] = await manager.query(`UPDATE "courses" SET "home_entry_id" = NULL WHERE "home_entry_id" = $1 RETURNING "id"`, [entryId]);
    // TypeORM answers a data-changing statement with [rows, count]; a plain array of rows is handled too.
    const list = Array.isArray(rows[0]) ? (rows[0] as unknown as { id: string }[]) : rows;
    return list.length;
  }

  async delete(id: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(HomeEntryEntity).delete({ id });
  }

  private repo(manager?: EntityManager): Repository<HomeEntryEntity> {
    return manager ? manager.getRepository(HomeEntryEntity) : this.entries;
  }

  private async hydrateOne(row: HomeEntryEntity, manager?: EntityManager): Promise<HomeEntry | null> {
    return (await this.hydrate([row], manager))[0] ?? null;
  }

  /** Adds each entry's assigned courses (any status, in the course order), in one extra query. */
  private async hydrate(rows: HomeEntryEntity[], manager?: EntityManager): Promise<HomeEntry[]> {
    if (rows.length === 0) return [];
    const found: { id: string; title: string; status: string; home_entry_id: string }[] = await (manager ?? this.entries.manager).query(
      `SELECT "id", "title", "status", "home_entry_id" FROM "courses" WHERE "home_entry_id" = ANY($1::uuid[]) ORDER BY "position", "id"`,
      [rows.map((row) => row.id)],
    );
    const byEntry = new Map<string, HomeEntryCourse[]>();
    for (const course of found) {
      const list = byEntry.get(course.home_entry_id) ?? [];
      list.push({ id: course.id, title: course.title, status: course.status as ContentStatus });
      byEntry.set(course.home_entry_id, list);
    }
    return rows.map((row) => toHomeEntry(row, byEntry.get(row.id) ?? []));
  }
}

function toHomeEntry(row: HomeEntryEntity, courses: HomeEntryCourse[]): HomeEntry {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageMediaId: row.imageMediaId,
    position: row.position,
    isEnabled: row.isEnabled,
    visibleLevels: visibleLevelsFromStored(row.visibleLevels),
    version: row.version,
    courseCount: courses.length,
    courses,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** A duplicate title and an image that disappeared meanwhile become readable refusals. Anything else is left as it is. */
function translate(error: unknown): unknown {
  if (isUniqueViolation(error)) return new ConflictError(DUPLICATE_MESSAGE, { code: 'HOME_ENTRY_DUPLICATE' });
  if (isForeignKeyViolation(error)) return new BusinessRuleError(MISSING_IMAGE_MESSAGE, { code: 'HOME_ENTRY_REFERENCE_MISSING' });
  return error;
}
