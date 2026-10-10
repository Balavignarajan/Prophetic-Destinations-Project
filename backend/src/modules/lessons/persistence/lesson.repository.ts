import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, Repository } from 'typeorm';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../database/pg-errors.js';
import {
  ConflictError,
  type ContentStatus,
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import type { Lesson } from '../domain/models.js';
import { LessonLevelEntity } from './lesson-level.entity.js';
import { LessonEntity } from './lesson.entity.js';

export interface NewLesson {
  moduleId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  estimatedMinutes: number | null;
  position: number;
}

export interface LessonChanges {
  title?: string;
  shortTitle?: string | null;
  subtitle?: string | null;
  introduction?: string | null;
  estimatedMinutes?: number | null;
  status?: ContentStatus;
}

/**
 * The lesson aggregate as stored: the lesson row plus its level availability.
 * Returns domain objects, never entities. Pass `manager` to take part in a transaction.
 * Position changes of sibling lessons (shift, reorder) are single SQL statements,
 * so the deferrable unique constraint is checked once at the end; callers hold the
 * module row lock (CurriculumFacade.lockModule).
 */
@Injectable()
export class LessonRepository {
  constructor(
    @InjectRepository(LessonEntity)
    private readonly lessons: Repository<LessonEntity>,
  ) {}

  async insert(lesson: NewLesson, manager: EntityManager): Promise<Lesson> {
    const repo = manager.getRepository(LessonEntity);
    try {
      const saved = await repo.save(
        repo.create({ ...lesson, status: 'DRAFT' }),
      );
      return toLesson(saved, []);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Another lesson already has this position');
      }
      throw error;
    }
  }

  async findById(id: string, manager?: EntityManager): Promise<Lesson | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    if (!row) return null;
    const levels = await this.levelsOf([row.id], manager);
    return toLesson(row, levels.get(row.id) ?? []);
  }

  /** Locks the lesson row until the transaction ends. Serializes changes to one lesson. */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Lesson | null> {
    const row = await manager
      .getRepository(LessonEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!row) return null;
    const levels = await this.levelsOf([row.id], manager);
    return toLesson(row, levels.get(row.id) ?? []);
  }

  /** In module order. */
  async listByModule(
    moduleId: string,
    manager?: EntityManager,
  ): Promise<Lesson[]> {
    const rows = await this.repo(manager).find({
      where: { moduleId },
      order: { position: 'ASC' },
    });
    const levels = await this.levelsOf(
      rows.map((row) => row.id),
      manager,
    );
    return rows.map((row) => toLesson(row, levels.get(row.id) ?? []));
  }

  countByModule(moduleId: string, manager?: EntityManager): Promise<number> {
    return this.repo(manager).count({ where: { moduleId } });
  }

  /** Updates lesson fields (bumping the version and updated_at) and returns the fresh lesson. */
  async update(
    id: string,
    changes: LessonChanges,
    manager: EntityManager,
  ): Promise<Lesson> {
    await manager.getRepository(LessonEntity).update({ id }, changes);
    return this.reload(id, manager);
  }

  /** Makes the lesson's level rows exactly `levels`. Does not touch the lesson row itself. */
  async replaceLevels(
    id: string,
    levels: readonly LearningLevel[],
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(LessonLevelEntity);
    const current = (await repo.find({ where: { lessonId: id } })).map(
      (row) => row.level,
    );

    const toRemove = current.filter(
      (level) => !levels.includes(level as LearningLevel),
    );
    const toAdd = levels.filter((level) => !current.includes(level));

    if (toRemove.length > 0) {
      try {
        await repo.delete({ lessonId: id, level: In(toRemove) });
      } catch (error) {
        // Backstop: blocks that are visible at a level keep the lesson available at it (ON DELETE RESTRICT).
        if (isForeignKeyViolation(error)) {
          throw new ConflictError(
            'Some blocks are still visible at a level you are removing',
          );
        }
        throw error;
      }
    }
    if (toAdd.length > 0) {
      await repo.insert(toAdd.map((level) => ({ lessonId: id, level })));
    }
  }

  /** Re-reads a lesson inside a transaction (after it was changed). */
  async reload(id: string, manager: EntityManager): Promise<Lesson> {
    const row = await manager
      .getRepository(LessonEntity)
      .findOneOrFail({ where: { id } });
    const levels = await this.levelsOf([id], manager);
    return toLesson(row, levels.get(id) ?? []);
  }

  /**
   * Removes the lesson and its level rows. Callers have already checked that it has no blocks;
   * the foreign key (ON DELETE RESTRICT) is the backstop if one appeared concurrently.
   */
  async delete(id: string, manager: EntityManager): Promise<void> {
    try {
      await manager.getRepository(LessonLevelEntity).delete({ lessonId: id });
      await manager.getRepository(LessonEntity).delete({ id });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictError(
          'This lesson still has blocks. Remove its blocks before deleting it.',
        );
      }
      throw error;
    }
  }

  /**
   * Counts a change to the lesson's blocks as a lesson edit: back to DRAFT, updated_at refreshed.
   * The lesson's own version is not bumped: it guards the lesson fields, and each block has its own version.
   */
  async markDraft(id: string, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "lessons" SET "status" = 'DRAFT', "updated_at" = now() WHERE "id" = $1`,
      [id],
    );
  }

  /** Moves every lesson of the module at or after `fromPosition` by `delta` (+1 opens a gap, -1 closes one). */
  async shiftFrom(
    moduleId: string,
    fromPosition: number,
    delta: 1 | -1,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "lessons"
         SET "position" = "position" + $3, "updated_at" = now()
       WHERE "module_id" = $1 AND "position" >= $2`,
      [moduleId, fromPosition, delta],
    );
  }

  /** Assigns positions in one statement: ids[i] gets positions[i]. Ignores ids of other modules. */
  async applyPositions(
    moduleId: string,
    ids: readonly string[],
    positions: readonly number[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "lessons" AS l
          SET "position" = v."position", "updated_at" = now()
         FROM unnest($2::uuid[], $3::int[]) AS v("id", "position")
        WHERE l."id" = v."id" AND l."module_id" = $1`,
      [moduleId, ids, positions],
    );
  }

  private async levelsOf(
    lessonIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (lessonIds.length === 0) return result;
    const repo = manager
      ? manager.getRepository(LessonLevelEntity)
      : this.lessons.manager.getRepository(LessonLevelEntity);
    for (const row of await repo.find({ where: { lessonId: In(lessonIds) } })) {
      result.set(row.lessonId, [
        ...(result.get(row.lessonId) ?? []),
        row.level,
      ]);
    }
    return result;
  }

  private repo(manager?: EntityManager): Repository<LessonEntity> {
    return manager ? manager.getRepository(LessonEntity) : this.lessons;
  }
}

function toLesson(row: LessonEntity, levels: string[]): Lesson {
  return {
    id: row.id,
    moduleId: row.moduleId,
    title: row.title,
    shortTitle: row.shortTitle,
    subtitle: row.subtitle,
    introduction: row.introduction,
    coverMediaId: row.coverMediaId,
    estimatedMinutes: row.estimatedMinutes,
    // Always in canonical order, regardless of how the rows came back.
    levels: LEARNING_LEVELS.filter((level) => levels.includes(level)),
    position: row.position,
    status: row.status as ContentStatus,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
