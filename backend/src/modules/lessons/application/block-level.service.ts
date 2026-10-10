import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  ConflictError,
  type LearningLevel,
  NotFoundError,
  checkExpectedVersion,
} from '../../../shared-kernel/index.js';
import {
  type BlockContent,
  checkBlockContent,
} from '../domain/blocks/block-content.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import {
  checkLessonHasLevel,
  checkVariantAllowed,
} from '../domain/block-levels.js';
import { jsonContentEquals } from '../domain/json-equality.js';
import type { BlockView, Lesson, LessonBlock } from '../domain/models.js';
import { LessonBlockLevelRepository } from '../persistence/lesson-block-level.repository.js';
import { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import { LessonRepository } from '../persistence/lesson.repository.js';

export interface SetBlockLevelInput {
  /** null = visible, using the block's shared content. An object = the full-replacement variant for this level. */
  content: BlockContent | null;
  /** The block version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

export interface RemoveBlockLevelInput {
  /** Hiding a block that has a variant for this level throws the variant away; that must be explicit. */
  discardVariant?: boolean;
  version?: number;
}

/**
 * Visibility and variants of one block. Same locking as the other block
 * operations (lesson row, then block row). An *effective* change bumps the
 * block's version and puts the lesson back to DRAFT (without touching the
 * lesson's own version); writing what is already stored changes nothing.
 */
@Injectable()
export class BlockLevelService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly blocks: LessonBlockRepository,
    private readonly levels: LessonBlockLevelRepository,
    private readonly registry: BlockTypeRegistry,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Makes the block visible at the level, with a variant or with its shared content. */
  async setLevel(
    lessonId: string,
    blockId: string,
    level: LearningLevel,
    input: SetBlockLevelInput,
  ): Promise<BlockView> {
    return this.transactions.run(async (manager) => {
      const lesson = await this.lockLesson(lessonId, manager);
      const block = await this.requireBlock(lessonId, blockId, manager);
      checkExpectedVersion(block.version, input.version);

      checkLessonHasLevel(lesson.levels, level);
      const definition = this.registry.require(block.type);
      let content: BlockContent | null = null;
      if (input.content !== null) {
        checkVariantAllowed(definition);
        content = checkBlockContent(definition, input.content);
      }

      const existing = await this.levels.find(blockId, level, manager);
      if (existing && jsonContentEquals(existing.content, content)) {
        return this.view(block, manager); // already exactly this: nothing changes
      }

      await this.levels.upsert(blockId, lessonId, level, content, manager);
      return this.changed(lessonId, block, manager);
    });
  }

  /** Hides the block at the level. Refused while a variant exists unless discarding it is explicit. */
  async removeLevel(
    lessonId: string,
    blockId: string,
    level: LearningLevel,
    input: RemoveBlockLevelInput,
  ): Promise<BlockView> {
    return this.transactions.run(async (manager) => {
      await this.lockLesson(lessonId, manager);
      const block = await this.requireBlock(lessonId, blockId, manager);
      checkExpectedVersion(block.version, input.version);

      const existing = await this.levels.find(blockId, level, manager);
      if (!existing) return this.view(block, manager); // already hidden

      if (existing.content !== null && !input.discardVariant) {
        throw new ConflictError(
          `The block has a ${level} variant. Hiding it at this level would discard the variant; send discardVariant=true to confirm.`,
          { level, hasVariant: true },
        );
      }

      await this.levels.delete(blockId, level, manager);
      return this.changed(lessonId, block, manager);
    });
  }

  private async changed(
    lessonId: string,
    block: LessonBlock,
    manager: EntityManager,
  ): Promise<BlockView> {
    await this.blocks.touch(block.id, manager);
    await this.lessons.markDraft(lessonId, manager);
    const fresh = await this.blocks.findById(block.id, manager);
    return this.view(fresh!, manager);
  }

  private async view(
    block: LessonBlock,
    manager: EntityManager,
  ): Promise<BlockView> {
    return {
      ...block,
      levels: await this.levels.listByBlock(block.id, manager),
    };
  }

  private async lockLesson(
    lessonId: string,
    manager: EntityManager,
  ): Promise<Lesson> {
    const lesson = await this.lessons.findByIdForUpdate(lessonId, manager);
    if (!lesson) throw new NotFoundError('Lesson not found');
    return lesson;
  }

  private async requireBlock(
    lessonId: string,
    blockId: string,
    manager: EntityManager,
  ): Promise<LessonBlock> {
    const block = await this.blocks.findByIdForUpdate(blockId, manager);
    if (!block || block.lessonId !== lessonId)
      throw new NotFoundError('Block not found');
    return block;
  }
}
