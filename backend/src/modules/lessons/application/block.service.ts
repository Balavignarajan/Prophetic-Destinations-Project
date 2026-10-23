import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  BusinessRuleError,
  ConflictError,
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
import {
  BlockTypeRegistry,
  type BlockTypeDefinition,
} from '../domain/blocks/registry.js';
import { MediaFacade } from '../../media/index.js';
import { QuizzesFacade } from '../../quizzes/index.js';
import { quizIdOf } from '../domain/blocks/quiz.js';
import { passageReferenceOf, sameReference } from '../domain/blocks/scripture-passage.js';
import { ScriptureFacade } from '../../scripture/index.js';
import { ScriptureEmbedService } from './scripture-embed.service.js';
import { LessonRelatedRepository } from '../persistence/lesson-related.repository.js';
import { jsonContentEquals } from '../domain/json-equality.js';
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
    private readonly media: MediaFacade,
    private readonly quizzes: QuizzesFacade,
    private readonly scripture: ScriptureFacade,
    private readonly scriptureRefs: ScriptureEmbedService,
    private readonly relatedLinks: LessonRelatedRepository,
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
    let sharedContent = await this.checkReferences(definition, checkBlockContent(definition, input.sharedContent));
    sharedContent = await this.verifyScripture(definition, sharedContent, null);
    sharedContent = await this.scriptureRefs.stampNested(definition.type, sharedContent, null);
    const levels = checkLevels(input.levels ?? []);

    return this.transactions.run(async (manager) => {
      const lesson = await this.lockLesson(lessonId, manager);
      checkWithinLessonLevels(levels, lesson);
      sharedContent = await this.lockQuizReference(definition, sharedContent, manager);
      sharedContent = await this.checkExploringLinks(definition.type, lessonId, sharedContent, null, manager);

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
      let sharedContent = await this.checkReferences(definition, checkBlockContent(definition, input.sharedContent));
      sharedContent = await this.lockQuizReference(definition, sharedContent, manager);
      sharedContent = await this.checkExploringLinks(definition.type, lessonId, sharedContent, current.sharedContent, manager);
      sharedContent = await this.verifyScripture(definition, sharedContent, current.sharedContent);
      // References attached to timeline events / hotspots: unchanged ones keep their stamp, new or refreshed ones are verified and stamped.
      sharedContent = await this.scriptureRefs.stampNested(definition.type, sharedContent, current.sharedContent);

      // Identical content: nothing changes, so nothing is written (no block version bump, no status reset).
      if (jsonContentEquals(current.sharedContent, sharedContent)) {
        return {
          ...current,
          levels: await this.levels.listByBlock(blockId, manager),
        };
      }

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
  /**
   * Sets the order of ALL blocks of the lesson. `previousBlockIds` must be the order the editor last saw. With the lesson row locked, it is compared with the
   * persisted order BEFORE anything is written: any difference (a reorder, an added or a deleted block by someone else) is a 409 and nothing changes, so two
   * editors who both start from the same list cannot silently overwrite each other even though the set of ids is unchanged. A matching request is then
   * validated as a complete list (no duplicates, no unknown ids) as before; an unchanged order is a no-op; a real change puts the lesson back to Draft.
   */
  async reorder(
    lessonId: string,
    blockIds: readonly string[],
    previousBlockIds: readonly string[],
  ): Promise<BlockView[]> {
    return this.transactions.run(async (manager) => {
      await this.lockLesson(lessonId, manager);

      const current = await this.blocks.listByLesson(lessonId, manager);
      if (current.length !== previousBlockIds.length || current.some((block, index) => block.id !== previousBlockIds[index])) {
        throw new ConflictError('The block order was changed by someone else. Reload the lesson and try again.');
      }
      checkReorder(
        current.map((block) => block.id),
        blockIds,
      );

      // Same order as now: nothing changes, so nothing is written.
      const unchanged = current.every(
        (block, index) => block.id === blockIds[index],
      );
      if (!unchanged) {
        await this.blocks.applyPositions(
          lessonId,
          blockIds,
          positionsFor(blockIds),
          manager,
        );
        await this.lessons.markDraft(lessonId, manager);
      }

      const blocks = unchanged
        ? current
        : await this.blocks.listByLesson(lessonId, manager);
      const rows = groupByBlock(
        await this.levels.listByLesson(lessonId, manager),
      );
      return blocks.map((block) => ({
        ...block,
        levels: rows.get(block.id) ?? [],
      }));
    });
  }

  /**
   * For a Scripture passage block: checks the chosen reference against the installed Scripture data and records which data set (id and
   * version) confirmed it. The client never supplies that stamp, and no Bible text is ever stored in the block. A block without a
   * reference stays a valid draft. If no data set is installed, a NEW or CHANGED reference is refused (it could not be verified), but an
   * unchanged reference is kept exactly as saved, so editing the commentary never clears or replaces a passage.
   */
  /**
   * Continue Exploring: a lesson cannot link to itself, and a target is linked once. A link NEW in this save must point at an existing lesson, and the
   * target is share-locked (NOWAIT) until this transaction ends, so a concurrent deletion of it either finished first (this save is refused) or must wait
   * for this save and then finds the new reference and asks to be retried (LessonService.lockWithSources); no new dangling reference can be written.
   * A link already stored in the block (`current`) is never re-checked and never removed by an unrelated save: if its target has meanwhile been deleted
   * it stays visible to the author (editor, working preview and the readiness report flag it) until the author removes it. Lock order: this lesson (already
   * locked by the caller) first, then the new targets in ascending id order without waiting.
   */
  private async checkExploringLinks(
    type: string,
    lessonId: string,
    content: BlockContent | null,
    current: BlockContent | null,
    manager: EntityManager,
  ): Promise<BlockContent | null> {
    if (type !== 'CONTINUE_EXPLORING' || content === null || !Array.isArray(content.links)) return content;
    const links = (content.links as unknown[]).map((link) =>
      typeof link === 'object' && link !== null && typeof (link as { lessonId?: unknown }).lessonId === 'string'
        ? { ...(link as Record<string, unknown>), lessonId: ((link as { lessonId: string }).lessonId).toLowerCase() }
        : link,
    );
    const ids = links.flatMap((link) => (typeof link === 'object' && link !== null ? [(link as { lessonId: string }).lessonId] : []));
    if (ids.includes(lessonId.toLowerCase())) throw new BusinessRuleError('A lesson cannot link to itself', { code: 'SELF_RELATED' });
    if (new Set(ids).size !== ids.length) throw new BusinessRuleError('A lesson can be linked only once in this block', { code: 'DUPLICATE_RELATED' });
    const stored = new Set(
      (Array.isArray(current?.links) ? (current!.links as unknown[]) : []).flatMap((link) =>
        typeof link === 'object' && link !== null && typeof (link as { lessonId?: unknown }).lessonId === 'string' ? [((link as { lessonId: string }).lessonId).toLowerCase()] : [],
      ),
    );
    const fresh = ids.filter((id) => !stored.has(id));
    const found = await this.relatedLinks.existingLocked([...fresh].sort(), manager);
    const missing = fresh.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BusinessRuleError('One of the chosen lessons no longer exists. Reload the list and choose again.', { code: 'RELATED_NOT_FOUND', missing });
    }
    return { ...content, links };
  }

  private async verifyScripture(definition: BlockTypeDefinition, content: BlockContent | null, current: BlockContent | null): Promise<BlockContent | null> {
    if (definition.type !== 'SCRIPTURE_PASSAGE' || content === null) return content;
    const reference = passageReferenceOf(content);
    const commentary = typeof content.commentary === 'string' && content.commentary.trim() ? { commentary: content.commentary.trim() } : {};
    if (!reference) return { ...commentary };
    const result = await this.scripture.verify(reference);
    if (result.verified) {
      return { reference, ...commentary, dataset: { id: result.source.id, version: result.source.version, fingerprint: result.source.fingerprint } };
    }
    if (result.reason === 'DATA_UNAVAILABLE') {
      if (sameReference(passageReferenceOf(current), reference)) {
        const stamp = (current as { dataset?: unknown } | null)?.dataset;
        return { reference, ...commentary, ...(stamp ? { dataset: stamp } : {}) };
      }
      throw new BusinessRuleError('Scripture passages cannot be chosen yet: the Scripture text is not installed on the server, so the passage cannot be verified.', {
        code: 'SCRIPTURE_DATA_UNAVAILABLE',
      });
    }
    throw new BusinessRuleError(result.message, { code: result.reason });
  }

  /**
   * For a quiz block, inside the lesson transaction: share-locks the quiz row and stamps its version. While the lock is held the quiz
   * cannot be edited, published or deleted, so a block can never be saved pointing at a quiz that a concurrent delete is removing
   * (the delete then sees this reference), and the stamped version is the one that exists.
   */
  private async lockQuizReference(definition: BlockTypeDefinition, content: BlockContent | null, manager: EntityManager): Promise<BlockContent | null> {
    const quizId = definition.type === 'QUIZ' ? quizIdOf(content) : null;
    if (!quizId) return content;
    const version = await this.quizzes.lockForReference(quizId, manager);
    if (version === null) {
      throw new BusinessRuleError('The selected quiz no longer exists. Choose another quiz.', { code: 'QUIZ_NOT_FOUND', quizId });
    }
    return { quizId, quizVersion: version };
  }

  /**
   * Every media asset and quiz the content points at must exist (a deleted or made-up id is refused with a clear reason).
   * A quiz block is stored with the quiz's CURRENT version, which is what publication later compares against.
   */
  private async checkReferences(
    definition: BlockTypeDefinition,
    content: BlockContent | null,
  ): Promise<BlockContent | null> {
    if (content === null) return content;
    let result: BlockContent = content;
    for (const reference of definition.extractReferences(content)) {
      if (reference.kind === 'QUIZ') {
        const quiz = await this.quizzes.findForLesson(reference.targetId);
        if (!quiz) {
          throw new BusinessRuleError('The selected quiz no longer exists. Choose another quiz.', {
            code: 'QUIZ_NOT_FOUND',
            quizId: reference.targetId,
          });
        }
        result = { quizId: quizIdOf(content) as string, quizVersion: quiz.version };
        continue;
      }
      if (reference.kind !== 'MEDIA') continue;
      const asset = await this.media.find(reference.targetId);
      if (!asset) {
        throw new BusinessRuleError(
          'The selected image no longer exists. Choose another image.',
          { code: 'MEDIA_NOT_FOUND', mediaId: reference.targetId },
        );
      }
      if (reference.mediaKind === 'video' || reference.mediaKind === 'lottie') {
        // The stored type was detected from the file's own bytes at upload, so this cannot be passed off by naming a file differently.
        const wanted = reference.mediaKind === 'video' ? 'video/mp4' : 'application/json';
        if (asset.contentType !== wanted) {
          throw new BusinessRuleError(
            reference.mediaKind === 'video' ? 'The selected file is not an MP4 video. Choose an MP4 video from the Media Library.' : 'The selected file is not a Lottie animation. Choose a Lottie JSON file from the Media Library.',
            { code: reference.mediaKind === 'video' ? 'MEDIA_NOT_A_VIDEO' : 'MEDIA_NOT_LOTTIE', mediaId: reference.targetId },
          );
        }
        continue;
      }
      if (!asset.contentType.startsWith('image/')) {
        throw new BusinessRuleError('The selected file is not an image', {
          code: 'MEDIA_NOT_AN_IMAGE',
          mediaId: reference.targetId,
        });
      }
      if (reference.animated) await this.media.requireAnimatedWebp(reference.targetId);
    }
    return result;
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
