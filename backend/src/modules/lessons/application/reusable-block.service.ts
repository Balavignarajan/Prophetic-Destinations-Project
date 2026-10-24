import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { BusinessRuleError, type LearningLevel, NotFoundError, checkExpectedVersion } from '../../../shared-kernel/index.js';
import { checkVariantAllowed } from '../domain/block-levels.js';
import { type BlockContent, checkBlockContent } from '../domain/blocks/block-content.js';
import { type BlockTypeDefinition, BlockTypeRegistry } from '../domain/blocks/registry.js';
import { jsonContentEquals } from '../domain/json-equality.js';
import type { BlockView } from '../domain/models.js';
import {
  type LeftOutLevel,
  type ReusableBlock,
  type TemplateLevel,
  checkReusableType,
  checkTemplateDescription,
  checkTemplateName,
  planInsertion,
} from '../domain/reusable-blocks.js';
import { LessonRepository } from '../persistence/lesson.repository.js';
import { type ReusableBlockFilters, ReusableBlockRepository, type ReusableBlockSummary } from '../persistence/reusable-block.repository.js';
import { BlockService } from './block.service.js';

export interface CreateFromBlockInput {
  lessonId: string;
  blockId: string;
  name: string;
  description?: string | null;
}

export interface UpdateReusableBlockInput {
  name?: string;
  description?: string | null;
  /** Replaces the shared content (it is checked like any block's content). The level versions are not changed here. */
  sharedContent?: BlockContent | null;
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

export interface InsertReusableBlockInput {
  lessonId: string;
  /** 1-based place in the lesson. Omit to append at the end. */
  position?: number;
  /**
   * The author has seen what would NOT be carried over (see `LeftOutLevel`) and agrees. Without it, an insertion that would leave anything out is refused
   * (422 TEMPLATE_LEVELS_NOT_CARRIED_OVER, listing exactly what), so an author-written version is never dropped silently.
   */
  acknowledgeLeftOut?: boolean;
}

export interface InsertedReusableBlock {
  block: BlockView;
  /** What was not carried over (only ever non-empty when the author agreed to it). */
  leftOut: LeftOutLevel[];
}

/**
 * Reusable blocks (CMS-014), copy-based. A template is saved FROM a lesson block (the stored block, never unsaved editor text) and inserted INTO a lesson as a new
 * block through the ordinary block creation path (`BlockService.create`), so every rule of a block applies to the copy: media must exist, Scripture is verified and
 * stamped, the lesson is locked, the block goes to the requested place, only levels the lesson is available at are used, the lesson returns to Draft, and nothing is
 * published. The template and the inserted block are independent from then on.
 *
 * What a template is never: part of a lesson, a snapshot, a public API response or learner progress. Publishing does not read this table at all, so editing or
 * deleting a template cannot change a published lesson.
 */
@Injectable()
export class ReusableBlockService {
  constructor(
    private readonly templates: ReusableBlockRepository,
    private readonly blocks: BlockService,
    private readonly lessons: LessonRepository,
    private readonly registry: BlockTypeRegistry,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Saves the stored block (its shared content and each level's setting, including own versions) as a new template. The lesson block is only read: it is not changed,
   * not locked and not marked as edited. The content gets the checks it gets when it is saved in a lesson (shape, media, Scripture), so a template can never hold
   * what a block could not.
   */
  async createFromBlock(actorId: string, input: CreateFromBlockInput): Promise<ReusableBlock> {
    const name = checkTemplateName(input.name);
    const description = checkTemplateDescription(input.description);
    const block = await this.blocks.get(input.lessonId, input.blockId);
    checkReusableType(block.type);
    const definition = this.registry.require(block.type);
    if (block.sharedContent === null) {
      throw new BusinessRuleError('This block has no content yet. Add its content and save it before saving it as a reusable block.', { code: 'TEMPLATE_BLOCK_EMPTY' });
    }
    const shared = block.sharedContent;

    return this.transactions.run(async (manager) => {
      const sharedContent = await this.prepare(definition, shared, shared, manager);
      const levels: TemplateLevel[] = [];
      for (const row of block.levels) {
        if (row.content === null) {
          levels.push({ level: row.level, content: null });
          continue;
        }
        checkVariantAllowed(definition);
        levels.push({ level: row.level, content: await this.prepare(definition, row.content, row.content, manager) });
      }
      return this.templates.insert({ name, description, type: block.type, sharedContent, levels, createdBy: actorId }, manager);
    });
  }

  list(filters: ReusableBlockFilters, limit: number, offset: number): Promise<{ items: ReusableBlockSummary[]; total: number }> {
    return this.templates.list(filters, limit, offset);
  }

  async get(id: string): Promise<ReusableBlock> {
    return this.require(id);
  }

  /**
   * Renames, re-describes and/or replaces the shared content. Only the template changes: lessons that already hold a copy keep theirs. Identical values change
   * nothing (no new version). The level versions are fixed when the template is saved; change them by saving the block again.
   */
  async update(id: string, input: UpdateReusableBlockInput): Promise<ReusableBlock> {
    if (input.name === undefined && input.description === undefined && input.sharedContent === undefined) {
      throw new BusinessRuleError('Nothing to update');
    }
    return this.transactions.run(async (manager) => {
      const current = await this.templates.findByIdForUpdate(id, manager);
      if (!current) throw templateNotFound();
      checkExpectedVersion(current.version, input.version);

      const changes: { name?: string; description?: string | null; sharedContent?: BlockContent } = {};
      if (input.name !== undefined) {
        const name = checkTemplateName(input.name);
        if (name !== current.name) changes.name = name;
      }
      if (input.description !== undefined) {
        const description = checkTemplateDescription(input.description);
        if (description !== current.description) changes.description = description;
      }
      if (input.sharedContent !== undefined) {
        if (input.sharedContent === null) {
          throw new BusinessRuleError('A reusable block must keep its content. Delete it instead if it is no longer needed.', { code: 'TEMPLATE_BLOCK_EMPTY' });
        }
        const definition = this.registry.require(current.type);
        const prepared = await this.prepare(definition, input.sharedContent, current.sharedContent, manager);
        if (!jsonContentEquals(current.sharedContent, prepared)) changes.sharedContent = prepared;
      }
      if (Object.keys(changes).length === 0) return current;
      return this.templates.update(id, changes, manager);
    });
  }

  /** Deletes the template and nothing else: lesson blocks inserted from it, lessons, published snapshots and media are untouched. */
  async delete(id: string): Promise<void> {
    await this.require(id);
    await this.templates.delete(id);
  }

  /**
   * Inserts an independent copy into a lesson. The template is read, checked against the CURRENT block registry, and handed to the ordinary block creation, which
   * validates it again, locks the lesson, shifts the blocks after the chosen place and puts the lesson back to Draft. Levels: the copy is visible at the template's
   * levels that the lesson is available at, with the template's own version for each (where the type still supports versions). A level the lesson is not available
   * at is never added to the lesson and never silently dropped: the insertion is refused, with the list, until the author agrees (`acknowledgeLeftOut`).
   */
  async insert(templateId: string, input: InsertReusableBlockInput): Promise<InsertedReusableBlock> {
    const template = await this.require(templateId);
    checkReusableType(template.type);
    const definition = this.registry.require(template.type);
    if (template.sharedContent === null) {
      throw new BusinessRuleError('This reusable block has no content, so it cannot be inserted.', { code: 'TEMPLATE_BLOCK_EMPTY' });
    }
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson) throw new NotFoundError('Lesson not found');

    const plan = planInsertion(template.levels, lesson.levels, definition.variants === 'SUPPORTED');
    if (template.levels.length > 0 && plan.kept.length === 0) {
      throw new BusinessRuleError('This reusable block is not visible at any level that this lesson is available at, so it would be hidden from every learner. Insert it into a lesson that offers one of its levels.', {
        code: 'TEMPLATE_NO_COMMON_LEVEL',
        templateLevels: template.levels.map((entry) => entry.level),
        lessonLevels: lesson.levels,
      });
    }
    if (plan.leftOut.length > 0 && input.acknowledgeLeftOut !== true) {
      throw new BusinessRuleError('Part of this reusable block cannot be carried over to this lesson. Review what would be left out and confirm to insert it.', {
        code: 'TEMPLATE_LEVELS_NOT_CARRIED_OVER',
        leftOut: plan.leftOut,
        templateLevels: template.levels.map((entry) => entry.level),
        lessonLevels: lesson.levels,
      });
    }

    const variants: Partial<Record<LearningLevel, BlockContent>> = {};
    for (const entry of plan.kept) if (entry.content !== null) variants[entry.level] = entry.content;
    const block = await this.blocks.create(lesson.id, {
      type: template.type,
      sharedContent: template.sharedContent,
      position: input.position,
      levels: plan.kept.map((entry) => entry.level),
      variants,
      copiedFrom: template.sharedContent,
    });
    return { block, leftOut: plan.leftOut };
  }

  /** Shape check, then the same media/Scripture checks and stamping stored block content gets. `current` is what the content replaces (its stamped references stay). */
  private async prepare(definition: BlockTypeDefinition, content: BlockContent, current: BlockContent | null, manager: EntityManager): Promise<BlockContent> {
    const valid = checkBlockContent(definition, content);
    if (valid === null) throw new BusinessRuleError('The content is missing', { code: 'TEMPLATE_BLOCK_EMPTY' });
    return this.blocks.prepareContent(definition, '', valid, current, manager);
  }

  private async require(id: string): Promise<ReusableBlock> {
    const found = await this.templates.findById(id);
    if (!found) throw templateNotFound();
    return found;
  }
}

function templateNotFound() {
  return new NotFoundError('Reusable block not found');
}
