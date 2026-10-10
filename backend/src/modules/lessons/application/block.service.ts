import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  type LearningLevel,
  NotFoundError,
  checkExpectedVersion,
  checkReorder,
  positionsFor,
  resolveInsertPosition,
} from '../../../shared-kernel/index.js';
import type { BlockType } from '../domain/blocks/block-types.js';
import {
  type BlockContent,
  MAX_BLOCKS_PER_LESSON,
  checkBlockContent,
} from '../domain/blocks/block-content.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import { checkLevels } from '../domain/lesson-rules.js';
import type { BlockView, Lesson, LessonBlock } from '../domain/models.js';
import {
  LessonBlockLevelRepository,
  groupByBlock,
} from '../persistence/lesson-block-level.repository.js';
import { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import { LessonRepository } from '../persistence/lesson.repository.js';

export interface CreateBlockInput {
  type: BlockType;
  /** Content shared by every level the block is visible at. Omit for an empty draft block. */
  sharedContent?: BlockContent | null;
  /** 1-based. Omit to append at the end of the lesson. */
  position?: number;
  /**
   * Levels the block is visible at. Omit for none: a new block is hidden everywhere
   * until levels are chosen explicitly. Must be levels the lesson is available at.
   */
  levels?: string[];
}

export interface UpdateBlockInput {
  /** undefined = leave alone, null = clear. */
  sharedContent?: BlockContent | null;
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

/**
 * Every operation that changes a lesson's blocks first locks the lesson row, so
 * concurrent inserts, deletes and reorders on one lesson run one at a time and
 * positions stay 1..n without gaps. Any change also puts the lesson back to DRAFT.
 * Lock order is always Module, Lesson, Block.
 */
@Injectable()
export class BlockService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly blocks: LessonBlockRepository,
    private readonly levels: LessonBlockLevelRepository,
    private readonly registry: BlockTypeRegistry,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(lessonId: string): Promise<BlockView[]> {
    if (!(await this.lessons.findById(lessonId))) throw lessonNotFound();
    const blocks = await this.blocks.listByLesson(lessonId);
    const rows = groupByBlock(await this.levels.listByLesson(lessonId));
    return blocks.map((block) => ({
      ...block,
      levels: rows.get(block.id) ?? [],
    }));
  }

  async get(lessonId: string, blockId: string): Promise<BlockView> {
    const block = await this.blocks.findById(blockId);
    if (!block || block.lessonId !== lessonId) throw blockNotFound();
    return { ...block, levels: await this.levels.listByBlock(blockId) };
  }

  async create(lessonId: string, input: CreateBlockInput): Promise<BlockView> {
    const definition = this.registry.require(input.type);
    const sharedContent = checkBlockContent(definition, input.sharedContent);
    const levels = checkLevels(input.levels ?? []);

    return this.transactions.run(async (manager) => {
      const lesson = await this.lockLesson(lessonId, manager);
      checkWithinLessonLevels(levels, lesson);

      const count = await this.blocks.countByLesson(lessonId, manager);
      checkRoomForAnother(count);
      const position = resolveInsertPosition(input.position, count);
      if (position <= count) {
        await this.blocks.shiftFrom(lessonId, position, 1, manager);
      }

      const block = await this.blocks.insert(
        { lessonId, type: input.type, sharedContent, position },
        manager,
      );
      for (const level of levels) {
        await this.levels.upsert(block.id, lessonId, level, null, manager);
      }
      await this.lessons.markDraft(lessonId, manager);
      return {
        ...block,
        levels: await this.levels.listByBlock(block.id, manager),
      };
    });
  }

  /** Changes the block's shared content. The type can never be changed, and variants are untouched. */
  async update(
    lessonId: string,
    blockId: string,
    input: UpdateBlockInput,
  ): Promise<BlockView> {
    if (input.sharedContent === undefined) {
      throw new BusinessRuleError('Nothing to update');
    }

    return this.transactions.run(async (manager) => {
      await this.lockLesson(lessonId, manager);
      const current = await this.requireBlock(lessonId, blockId, manager);
      checkExpectedVersion(current.version, input.version);

      const definition = this.registry.require(current.type);
      const sharedContent = checkBlockContent(definition, input.sharedContent);

      const updated = await this.blocks.updateContent(
        blockId,
        sharedContent,
        manager,
      );
      await this.lessons.markDraft(lessonId, manager);
      return {
        ...updated,
        levels: await this.levels.listByBlock(blockId, manager),
      };
    });
  }

  /**
   * Copies the block to just after the original: new id, same type, and independent
   * copies of its shared content and of every level setting including variants.
   */
  async duplicate(lessonId: string, blockId: string): Promise<BlockView> {
    return this.transactions.run(async (manager) => {
      await this.lockLesson(lessonId, manager);
      const source = await this.requireBlock(lessonId, blockId, manager);

      const count = await this.blocks.countByLesson(lessonId, manager);
      checkRoomForAnother(count);
      const position = source.position + 1;
      if (position <= count) {
        await this.blocks.shiftFrom(lessonId, position, 1, manager);
      }

      const copy = await this.blocks.insert(
        {
          lessonId,
          type: source.type,
          sharedContent:
            source.sharedContent === null
              ? null
              : structuredClone(source.sharedContent),
          position,
        },
        manager,
      );
      await this.levels.copy(blockId, copy.id, manager);
      await this.lessons.markDraft(lessonId, manager);
      return {
        ...copy,
        levels: await this.levels.listByBlock(copy.id, manager),
      };
    });
  }

  /** Removes the block with its level settings, and closes the gap so positions stay 1..n. */
  async delete(lessonId: string, blockId: string): Promise<void> {
    await this.transactions.run(async (manager) => {
      await this.lockLesson(lessonId, manager);
      const current = await this.requireBlock(lessonId, blockId, manager);

      // Explicit, in one transaction: the foreign keys are RESTRICT, nothing cascades silently.
      await this.levels.deleteAllForBlock(blockId, manager);
      await this.blocks.delete(blockId, manager);
      await this.blocks.shiftFrom(lessonId, current.position + 1, -1, manager);
      await this.lessons.markDraft(lessonId, manager);
    });
  }

  /** Sets the order of all blocks of a lesson. `blockIds` must list each block exactly once. */
  async reorder(
    lessonId: string,
    blockIds: readonly string[],
  ): Promise<BlockView[]> {
    return this.transactions.run(async (manager) => {
      await this.lockLesson(lessonId, manager);

      const current = await this.blocks.listByLesson(lessonId, manager);
      checkReorder(
        current.map((block) => block.id),
        blockIds,
      );

      await this.blocks.applyPositions(
        lessonId,
        blockIds,
        positionsFor(blockIds),
        manager,
      );
      await this.lessons.markDraft(lessonId, manager);

      const blocks = await this.blocks.listByLesson(lessonId, manager);
      const rows = groupByBlock(
        await this.levels.listByLesson(lessonId, manager),
      );
      return blocks.map((block) => ({
        ...block,
        levels: rows.get(block.id) ?? [],
      }));
    });
  }

  private async lockLesson(
    lessonId: string,
    manager: EntityManager,
  ): Promise<Lesson> {
    const lesson = await this.lessons.findByIdForUpdate(lessonId, manager);
    if (!lesson) throw lessonNotFound();
    return lesson;
  }

  /** Locks the block row too (after the lesson, never before) and checks it belongs to the lesson. */
  private async requireBlock(
    lessonId: string,
    blockId: string,
    manager: EntityManager,
  ): Promise<LessonBlock> {
    const block = await this.blocks.findByIdForUpdate(blockId, manager);
    if (!block || block.lessonId !== lessonId) throw blockNotFound();
    return block;
  }
}

function checkWithinLessonLevels(
  levels: readonly LearningLevel[],
  lesson: Lesson,
): void {
  const outside = levels.filter((level) => !lesson.levels.includes(level));
  if (outside.length > 0) {
    throw new BusinessRuleError(
      'A block can only be visible at levels the lesson is available at',
      { notAvailable: outside, lessonLevels: lesson.levels },
    );
  }
}

function checkRoomForAnother(count: number): void {
  if (count >= MAX_BLOCKS_PER_LESSON) {
    throw new BusinessRuleError(
      `A lesson can have at most ${MAX_BLOCKS_PER_LESSON} blocks`,
      { max: MAX_BLOCKS_PER_LESSON },
    );
  }
}

function lessonNotFound() {
  return new NotFoundError('Lesson not found');
}

function blockNotFound() {
  return new NotFoundError('Block not found');
}
