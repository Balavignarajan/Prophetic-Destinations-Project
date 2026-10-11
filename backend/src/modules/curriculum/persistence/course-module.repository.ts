import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../database/pg-errors.js';
import {
  ConflictError,
  type ContentStatus,
} from '../../../shared-kernel/index.js';
import type { CourseModule } from '../domain/models.js';
import { CourseModuleEntity } from './course-module.entity.js';

export interface NewCourseModule {
  courseId: string;
  title: string;
  description: string | null;
  position: number;
}

export interface CourseModuleChanges {
  title?: string;
  description?: string | null;
  status?: ContentStatus;
}

/**
 * Position changes of the other modules in a course (shift, reorder) are single
 * SQL statements, so the deferrable unique constraint is checked once at the end.
 * Callers hold the course row lock (CourseRepository.findByIdForUpdate).
 */
@Injectable()
export class CourseModuleRepository {
  constructor(
    @InjectRepository(CourseModuleEntity)
    private readonly modules: Repository<CourseModuleEntity>,
  ) {}

  async insert(
    module: NewCourseModule,
    manager: EntityManager,
  ): Promise<CourseModule> {
    const repo = manager.getRepository(CourseModuleEntity);
    try {
      const saved = await repo.save(
        repo.create({ ...module, status: 'DRAFT' }),
      );
      return toModule(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Another module already has this position');
      }
      throw error;
    }
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<CourseModule | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    return row ? toModule(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CourseModule | null> {
    const row = await manager
      .getRepository(CourseModuleEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    return row ? toModule(row) : null;
  }

  /** In course order. */
  async listByCourse(
    courseId: string,
    manager?: EntityManager,
  ): Promise<CourseModule[]> {
    const rows = await this.repo(manager).find({
      where: { courseId },
      order: { position: 'ASC' },
    });
    return rows.map(toModule);
  }

  countByCourse(courseId: string, manager?: EntityManager): Promise<number> {
    return this.repo(manager).count({ where: { courseId } });
  }

  async update(
    id: string,
    changes: CourseModuleChanges,
    manager: EntityManager,
  ): Promise<CourseModule> {
    const repo = manager.getRepository(CourseModuleEntity);
    await repo.update({ id }, changes);
    return toModule(await repo.findOneOrFail({ where: { id } }));
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
         UPDATE "course_modules" SET "status" = $3, "updated_at" = now()
          WHERE "id" = $1 AND "status" = $2
          RETURNING "id"
       )
       SELECT count(*)::int AS "applied" FROM updated`,
      [id, from, to],
    );
    return result.applied > 0;
  }

  /** Refused while anything (lessons) still references the module: the foreign keys are ON DELETE RESTRICT. */
  async delete(id: string, manager: EntityManager): Promise<void> {
    try {
      await manager.getRepository(CourseModuleEntity).delete({ id });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictError(
          'This module cannot be deleted: it still has lessons, or it has workflow or publication history.',
        );
      }
      throw error;
    }
  }

  /** Moves every module at or after `fromPosition` by `delta` (+1 to open a gap, -1 to close one). */
  async shiftFrom(
    courseId: string,
    fromPosition: number,
    delta: 1 | -1,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "course_modules"
         SET "position" = "position" + $3, "updated_at" = now()
       WHERE "course_id" = $1 AND "position" >= $2`,
      [courseId, fromPosition, delta],
    );
  }

  /** Assigns positions to the given ids in one statement: ids[i] gets positions[i]. */
  async applyPositions(
    courseId: string,
    ids: readonly string[],
    positions: readonly number[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "course_modules" AS m
          SET "position" = v."position", "updated_at" = now()
         FROM unnest($2::uuid[], $3::int[]) AS v("id", "position")
        WHERE m."id" = v."id" AND m."course_id" = $1`,
      [courseId, ids, positions],
    );
  }

  private repo(manager?: EntityManager): Repository<CourseModuleEntity> {
    return manager ? manager.getRepository(CourseModuleEntity) : this.modules;
  }
}

function toModule(row: CourseModuleEntity): CourseModule {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    description: row.description,
    status: row.status as ContentStatus,
    position: row.position,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
