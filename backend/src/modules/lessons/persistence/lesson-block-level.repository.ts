import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { isForeignKeyViolation } from '../../../database/pg-errors.js';
import {
  BusinessRuleError,
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import type { BlockLevelSetting } from '../domain/models.js';
import { LessonBlockLevelEntity } from './lesson-block-level.entity.js';

export interface BlockLevelRow extends BlockLevelSetting {
  blockId: string;
}

/**
 * Visibility and variants of blocks. Returns plain objects, never entities.
 * Callers hold the lesson row lock; the composite foreign keys are the backstop
 * for "a block is only visible at levels its lesson is available at".
 */
@Injectable()
export class LessonBlockLevelRepository {
  constructor(
    @InjectRepository(LessonBlockLevelEntity)
    private readonly rows: Repository<LessonBlockLevelEntity>,
  ) {}

  /** All level rows of all blocks of a lesson, in one query. */
  async listByLesson(
    lessonId: string,
    manager?: EntityManager,
  ): Promise<BlockLevelRow[]> {
    const rows = await this.repo(manager).find({ where: { lessonId } });
    return rows.map(toRow);
  }

  /** The level settings of one block, in canonical level order. */
  async listByBlock(
    blockId: string,
    manager?: EntityManager,
  ): Promise<BlockLevelSetting[]> {
    const rows = await this.repo(manager).find({ where: { blockId } });
    return groupByBlock(rows.map(toRow)).get(blockId) ?? [];
  }

  async find(
    blockId: string,
    level: LearningLevel,
    manager?: EntityManager,
  ): Promise<BlockLevelRow | null> {
    const row = await this.repo(manager).findOne({ where: { blockId, level } });
    return row ? toRow(row) : null;
  }

  /** Makes the block visible at the level with exactly this variant (null = shared content). */
  async upsert(
    blockId: string,
    lessonId: string,
    level: LearningLevel,
    content: Record<string, unknown> | null,
    manager: EntityManager,
  ): Promise<void> {
    try {
      await manager.query(
        `INSERT INTO "lesson_block_levels" ("block_id", "lesson_id", "level", "content")
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT ("block_id", "level")
         DO UPDATE SET "content" = EXCLUDED."content", "updated_at" = now()`,
        [
          blockId,
          lessonId,
          level,
          content === null ? null : JSON.stringify(content),
        ],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BusinessRuleError(
          `The lesson is not available at the ${level} level`,
          { level },
        );
      }
      throw error;
    }
  }

  async delete(
    blockId: string,
    level: LearningLevel,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(LessonBlockLevelEntity)
      .delete({ blockId, level });
  }

  async deleteAllForBlock(
    blockId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.getRepository(LessonBlockLevelEntity).delete({ blockId });
  }

  /** Copies every level row (including variants) of one block to another block of the same lesson. */
  async copy(
    fromBlockId: string,
    toBlockId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "lesson_block_levels" ("block_id", "lesson_id", "level", "content")
       SELECT $2::uuid, "lesson_id", "level", "content"
         FROM "lesson_block_levels" WHERE "block_id" = $1`,
      [fromBlockId, toBlockId],
    );
  }

  /** Which blocks are visible at any of the given levels (used to refuse removing a lesson level). */
  async findVisibleAt(
    lessonId: string,
    levels: readonly LearningLevel[],
    manager: EntityManager,
  ): Promise<{ blockId: string; level: LearningLevel }[]> {
    const rows: { block_id: string; level: LearningLevel }[] =
      await manager.query(
        `SELECT "block_id", "level" FROM "lesson_block_levels"
        WHERE "lesson_id" = $1 AND "level" = ANY($2::varchar[])
        ORDER BY "level", "block_id"`,
        [lessonId, levels],
      );
    return rows.map((row) => ({ blockId: row.block_id, level: row.level }));
  }

  private repo(manager?: EntityManager): Repository<LessonBlockLevelEntity> {
    return manager ? manager.getRepository(LessonBlockLevelEntity) : this.rows;
  }
}

/** Rows grouped per block, each block's rows in canonical level order. */
export function groupByBlock(
  rows: readonly BlockLevelRow[],
): Map<string, BlockLevelSetting[]> {
  const grouped = new Map<string, BlockLevelSetting[]>();
  for (const level of LEARNING_LEVELS) {
    for (const row of rows) {
      if (row.level !== level) continue;
      const list = grouped.get(row.blockId) ?? [];
      list.push({ level: row.level, content: row.content });
      grouped.set(row.blockId, list);
    }
  }
  return grouped;
}

function toRow(row: LessonBlockLevelEntity): BlockLevelRow {
  return {
    blockId: row.blockId,
    level: row.level as LearningLevel,
    content: row.content,
  };
}
