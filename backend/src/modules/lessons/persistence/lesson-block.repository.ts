import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../database/pg-errors.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { BlockType } from '../domain/blocks/block-types.js';
import type { LessonBlock } from '../domain/models.js';
import { LessonBlockEntity } from './lesson-block.entity.js';

export interface NewLessonBlock {
  lessonId: string;
  type: BlockType;
  sharedContent: Record<string, unknown> | null;
  position: number;
}

/**
 * Returns domain objects, never entities. Position changes of sibling blocks
 * (shift, reorder) are single SQL statements, so the deferrable unique
 * constraint is checked once at the end; callers hold the lesson row lock.
 */
@Injectable()
export class LessonBlockRepository {
  constructor(
    @InjectRepository(LessonBlockEntity)
    private readonly blocks: Repository<LessonBlockEntity>,
  ) {}

  async insert(
    block: NewLessonBlock,
    manager: EntityManager,
  ): Promise<LessonBlock> {
    const repo = manager.getRepository(LessonBlockEntity);
    try {
      const saved = await repo.save(repo.create(block));
      return toBlock(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Another block already has this position');
      }
      throw error;
    }
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<LessonBlock | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    return row ? toBlock(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<LessonBlock | null> {
    const row = await manager
      .getRepository(LessonBlockEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    return row ? toBlock(row) : null;
  }

  /** In lesson order. */
  async listByLesson(
    lessonId: string,
    manager?: EntityManager,
  ): Promise<LessonBlock[]> {
    const rows = await this.repo(manager).find({
      where: { lessonId },
      order: { position: 'ASC' },
    });
    return rows.map(toBlock);
  }

  countByLesson(lessonId: string, manager?: EntityManager): Promise<number> {
    return this.repo(manager).count({ where: { lessonId } });
  }

  /** Replaces the shared content (null clears it); bumps the version and updated_at. */
  async updateContent(
    id: string,
    sharedContent: Record<string, unknown> | null,
    manager: EntityManager,
  ): Promise<LessonBlock> {
    const repo = manager.getRepository(LessonBlockEntity);
    // TypeORM's partial-entity type cannot express a JSON object value; SQL NULL clears the column.
    await repo.update({ id }, { sharedContent: sharedContent as never });
    return toBlock(await repo.findOneOrFail({ where: { id } }));
  }

  /**
   * Counts a change to the block's level rows as a change to the block: version and updated_at move.
   * (Content changes bump them through updateContent.)
   */
  async touch(id: string, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "lesson_blocks" SET "version" = "version" + 1, "updated_at" = now() WHERE "id" = $1`,
      [id],
    );
  }

  async delete(id: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(LessonBlockEntity).delete({ id });
  }

  /** Moves every block of the lesson at or after `fromPosition` by `delta` (+1 opens a gap, -1 closes one). */
  async shiftFrom(
    lessonId: string,
    fromPosition: number,
    delta: 1 | -1,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "lesson_blocks"
         SET "position" = "position" + $3, "updated_at" = now()
       WHERE "lesson_id" = $1 AND "position" >= $2`,
      [lessonId, fromPosition, delta],
    );
  }

  /** Assigns positions in one statement: ids[i] gets positions[i]. Ignores ids of other lessons. */
  async applyPositions(
    lessonId: string,
    ids: readonly string[],
    positions: readonly number[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "lesson_blocks" AS b
          SET "position" = v."position", "updated_at" = now()
         FROM unnest($2::uuid[], $3::int[]) AS v("id", "position")
        WHERE b."id" = v."id" AND b."lesson_id" = $1`,
      [lessonId, ids, positions],
    );
  }

  private repo(manager?: EntityManager): Repository<LessonBlockEntity> {
    return manager ? manager.getRepository(LessonBlockEntity) : this.blocks;
  }
}

function toBlock(row: LessonBlockEntity): LessonBlock {
  return {
    id: row.id,
    lessonId: row.lessonId,
    type: row.type as BlockType,
    position: row.position,
    sharedContent: row.sharedContent,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
