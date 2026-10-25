import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { isForeignKeyViolation } from '../../../database/pg-errors.js';
import {
  ConflictError,
  type ContentStatus,
} from '../../../shared-kernel/index.js';
import type { Course } from '../domain/models.js';
import { CourseEntity } from './course.entity.js';

export interface NewCourse {
  title: string;
  description: string | null;
  coverMediaId?: string | null;
  homeEntryId?: string | null;
  position: number;
}

export interface CourseChanges {
  title?: string;
  description?: string | null;
  coverMediaId?: string | null;
  homeEntryId?: string | null;
  status?: ContentStatus;
}

/** Returns domain objects, never entities. Pass `manager` to take part in a transaction. */
@Injectable()
export class CourseRepository {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
  ) {}

  async create(course: NewCourse, manager?: EntityManager): Promise<Course> {
    const repo = this.repo(manager);
    const saved = await repo.save(repo.create({ ...course, status: 'DRAFT' }));
    return toCourse(saved);
  }

  async findById(id: string, manager?: EntityManager): Promise<Course | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    return row ? toCourse(row) : null;
  }

  /** Locks the course row until the transaction ends. Serializes changes to a course and its modules. */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Course | null> {
    const row = await manager
      .getRepository(CourseEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    return row ? toCourse(row) : null;
  }

  /** In the manual course order, with id as the tie-breaker, so the order is always deterministic. */
  async list(
    limit: number,
    offset: number,
    manager?: EntityManager,
  ): Promise<{ items: Course[]; total: number }> {
    const [rows, total] = await this.repo(manager).findAndCount({
      order: { position: 'ASC', id: 'ASC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(toCourse), total };
  }

  /** Every course in the manual order. */
  async listAll(manager?: EntityManager): Promise<Course[]> {
    const rows = await this.repo(manager).find({
      order: { position: 'ASC', id: 'ASC' },
    });
    return rows.map(toCourse);
  }

  /** Serializes everything that creates, deletes or reorders courses until the transaction ends. */
  async lockOrdering(manager: EntityManager): Promise<void> {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext('courses_ordering'))`,
    );
  }

  /** The position for a course appended at the end. Call it after `lockOrdering`. */
  async nextPosition(manager: EntityManager): Promise<number> {
    const [row]: { next: number }[] = await manager.query(
      `SELECT COALESCE(max("position"), 0) + 1 AS "next" FROM "courses"`,
    );
    return Number(row.next);
  }

  /**
   * Assigns positions in one statement: ids[i] gets positions[i]. Raw SQL on purpose: a reorder is not a content
   * edit, so `version`, `status` and `updated_at` stay as they are.
   */
  async applyPositions(
    ids: readonly string[],
    positions: readonly number[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "courses" AS c SET "position" = v."position"
         FROM unnest($1::uuid[], $2::int[]) AS v("id", "position")
        WHERE c."id" = v."id" AND c."position" <> v."position"`,
      [ids, positions],
    );
  }

  async update(
    id: string,
    changes: CourseChanges,
    manager: EntityManager,
  ): Promise<Course> {
    const repo = manager.getRepository(CourseEntity);
    await repo.update({ id }, changes);
    return toCourse(await repo.findOneOrFail({ where: { id } }));
  }

  /**
   * Sets (or, with null, clears) the course's Home Entry. Raw SQL on purpose: where a course appears on Home is a classification, not a content edit, so `version`, `status` and
   * `updated_at` stay as they are (the same rule as the course order).
   */
  async setHomeEntry(id: string, homeEntryId: string | null, manager: EntityManager): Promise<void> {
    await manager.query(`UPDATE "courses" SET "home_entry_id" = $2 WHERE "id" = $1`, [id, homeEntryId]);
  }

  /**
   * Moves the status from `from` to `to` only if it is still `from`; returns whether it did. A workflow
   * transition is not an edit: `version` is untouched (this is raw SQL, so the version column does not move).
   */
  async compareAndSetStatus(
    id: string,
    from: ContentStatus,
    to: ContentStatus,
    manager: EntityManager,
  ): Promise<boolean> {
    // A CTE wrapped in a SELECT, because TypeORM returns a different shape ([rows, count]) for a bare UPDATE.
    const [result]: { applied: number }[] = await manager.query(
      `WITH updated AS (
         UPDATE "courses" SET "status" = $3, "updated_at" = now()
          WHERE "id" = $1 AND "status" = $2
          RETURNING "id"
       )
       SELECT count(*)::int AS "applied" FROM updated`,
      [id, from, to],
    );
    return result.applied > 0;
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    try {
      await this.repo(manager).delete({ id });
    } catch (error) {
      // Backstop for the foreign key (ON DELETE RESTRICT) if modules appeared concurrently.
      if (isForeignKeyViolation(error)) {
        throw new ConflictError(
          'This course cannot be deleted: it still has modules, or it has workflow or publication history.',
        );
      }
      throw error;
    }
  }

  private repo(manager?: EntityManager): Repository<CourseEntity> {
    return manager ? manager.getRepository(CourseEntity) : this.courses;
  }
}

function toCourse(row: CourseEntity): Course {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as ContentStatus,
    coverMediaId: row.coverMediaId,
    homeEntryId: row.homeEntryId ?? null,
    position: row.position,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
