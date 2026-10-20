import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  type ContentStatus,
  type LearningLevel,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import type { ContentProblem } from '../domain/blocks/rich-text.js';
import { type Resolution, resolveLesson } from '../domain/level-resolution.js';
import {
  LessonBlockLevelRepository,
  groupByBlock,
} from '../persistence/lesson-block-level.repository.js';
import { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import { LessonRepository } from '../persistence/lesson.repository.js';
import { LessonRelatedRepository } from '../persistence/lesson-related.repository.js';
import { QuizEmbedService } from './quiz-embed.service.js';
import { ScriptureEmbedService } from './scripture-embed.service.js';
import { toResolvable } from './resolvable.js';

/** The little the workflow needs to know about a lesson (plain data, never an entity). */
export interface LessonWorkflowState {
  id: string;
  /** null = a library lesson: it cannot enter the review/publish workflow. */
  courseId: string | null;
  moduleId: string | null;
  status: ContentStatus;
  /** Counts effective authoring-content changes; moves for block changes too, never for status transitions. */
  contentRevision: number;
  availableLevels: LearningLevel[];
}

export type BlockProblemCode =
  | 'BLOCK_CONTENT_INVALID'
  | 'BLOCK_CONTENT_INCOMPLETE'
  | 'BLOCK_TYPE_NOT_AVAILABLE';

/** A content problem found in a block that is visible and resolved at a level. */
export interface BlockProblem {
  blockId: string;
  code: BlockProblemCode;
  problems: ContentProblem[];
}

export interface AssembledLevel {
  level: LearningLevel;
  /** The pure resolver's result for this level, computed separately from every other level. */
  resolution: Resolution;
  /** Shape and completeness problems of the blocks the resolver returned content for. */
  blockProblems: BlockProblem[];
}

/** The lesson's own fields, as a learner-facing snapshot would carry them. */
export interface AssembledLessonFields {
  id: string;
  courseId: string | null;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  estimatedMinutes: number | null;
  coverMediaId: string | null;
  /** The authored related lessons (ids only, in order), frozen into the snapshot; titles are resolved for learners at request time. */
  relatedLessonIds: string[];
  /**
   * The same links with the author's optional label and level visibility, frozen with the source publication. `label` is left out when there is none
   * (the target's published title is used) and `levels` when the link is shown at every level.
   */
  relatedLinks: { lessonId: string; label?: string; levels?: string[] }[];
}

/** Everything Publishing needs to judge and snapshot a lesson, resolved level by level. */
export interface AssembledLesson {
  lessonId: string;
  courseId: string | null;
  moduleId: string | null;
  status: ContentStatus;
  contentRevision: number;
  lesson: AssembledLessonFields;
  availableLevels: LearningLevel[];
  /** One entry per available level, in canonical level order. */
  levels: AssembledLevel[];
}

/**
 * What other modules may ask the lessons module. Publishing owns the workflow
 * rules; this facade only locks, reads and compare-and-sets the status, and
 * assembles resolved content. Every method returns plain data, never entities
 * or repositories. Methods that write or lock require the caller's transaction.
 */
@Injectable()
export class LessonsFacade {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly blocks: LessonBlockRepository,
    private readonly blockLevels: LessonBlockLevelRepository,
    private readonly registry: BlockTypeRegistry,
    private readonly quizEmbed: QuizEmbedService,
    private readonly scriptureEmbed: ScriptureEmbedService,
    private readonly related: LessonRelatedRepository,
  ) {}

  /**
   * Locks the lesson row until the transaction ends. Every authoring write takes
   * this same lock first, so while it is held nothing about the lesson can change.
   */
  /**
   * The WORKING state of one block and its lesson, for the admin preview of a Continue Exploring block: the saved content, the levels the block is
   * visible at and the levels the lesson is available at, plus which of the given lesson ids still exist. Read-only, no locks.
   */
  async findBlockForPreview(lessonId: string, blockId: string): Promise<{ type: string; content: Record<string, unknown> | null; blockLevels: string[]; lessonLevels: string[]; existing: (ids: readonly string[]) => Promise<Set<string>> } | null> {
    const block = await this.blocks.findById(blockId);
    const lesson = await this.lessons.findById(lessonId);
    if (!block || !lesson || block.lessonId !== lessonId) return null;
    const settings = await this.blockLevels.listByBlock(blockId);
    return {
      type: block.type,
      content: block.sharedContent,
      blockLevels: settings.map((s) => s.level),
      lessonLevels: [...lesson.levels],
      existing: (ids) => this.related.existing(ids),
    };
  }

  async lockForWorkflow(
    lessonId: string,
    manager: EntityManager,
  ): Promise<LessonWorkflowState> {
    const lesson = await this.lessons.findByIdForUpdate(lessonId, manager);
    if (!lesson) throw new NotFoundError('Lesson not found');
    return toState(lesson);
  }

  /** Reads the workflow state without locking (for read-only endpoints). */
  async findWorkflowState(
    lessonId: string,
    manager?: EntityManager,
  ): Promise<LessonWorkflowState | null> {
    const lesson = await this.lessons.findById(lessonId, manager);
    return lesson ? toState(lesson) : null;
  }

  /**
   * Moves the status from `from` to `to` only if it is still `from`. Returns false
   * (and changes nothing) otherwise. A status transition is not an authoring change:
   * neither `version` nor `contentRevision` moves.
   */
  compareAndSetStatus(
    lessonId: string,
    from: ContentStatus,
    to: ContentStatus,
    manager: EntityManager,
  ): Promise<boolean> {
    return this.lessons.compareAndSetStatus(lessonId, from, to, manager);
  }

  /**
   * Where the lessons of the given modules sit: id, module and `position` within the module, ordered by
   * module and then position. Plain ordering data only (no titles or content): Publishing combines it
   * with PUBLISHED lesson data to build catalog snapshots.
   */
  listLessonPlacements(
    moduleIds: readonly string[],
    manager?: EntityManager,
  ): Promise<{ lessonId: string; moduleId: string; position: number }[]> {
    return this.lessons.listPlacements(moduleIds, manager);
  }

  listDirectLessonPlacements(courseId: string, manager?: EntityManager): Promise<{ lessonId: string; position: number }[]> {
    return this.lessons.listDirectPlacements(courseId, manager);
  }

  /** Ids of the lessons with a status, in id order after `afterId` (keyset paging; for consistency checks). */
  listLessonIdsByStatus(
    status: ContentStatus,
    limit: number,
    afterId: string | null,
  ): Promise<string[]> {
    return this.lessons.idsByStatus(status, limit, afterId);
  }

  /**
   * Reads the lesson, its blocks and their level rows, then resolves every available
   * level separately with the pure resolver and checks each resolved block against its
   * block type. Call it inside the transaction that holds `lockForWorkflow` so the
   * result is one consistent state. Without a manager it still works, but it is then an
   * advisory read: separate unlocked queries that can mix old and new data under
   * concurrent edits, and must never be used to decide a publication.
   */
  async assembleForPublication(
    lessonId: string,
    manager?: EntityManager,
  ): Promise<AssembledLesson> {
    const lesson = await this.lessons.findById(lessonId, manager);
    if (!lesson) throw new NotFoundError('Lesson not found');

    const blocks = await this.blocks.listByLesson(lessonId, manager);
    const rows = groupByBlock(
      await this.blockLevels.listByLesson(lessonId, manager),
    );
    const resolvable = toResolvable(lesson, blocks, rows, this.registry);

    const levels: AssembledLevel[] = [];
    for (const level of lesson.levels) {
      const resolution = resolveLesson(resolvable, level);
      const blockProblems = this.checkResolvedBlocks(resolution);
      // Quiz blocks are replaced by a frozen copy of the quiz they point at (this is what the snapshot stores); a quiz that is
      // missing, empty or edited since the block was saved is reported like any other incomplete block.
      const embedded = await this.quizEmbed.embed(resolution.blocks, manager, level);
      for (const problem of embedded.problems) {
        blockProblems.push({ blockId: problem.blockId, code: 'BLOCK_CONTENT_INCOMPLETE', problems: problem.problems });
      }
      // Scripture passages likewise become the verified, frozen passage (text + structured reference + data set identity).
      const scripture = await this.scriptureEmbed.embed(embedded.blocks);
      for (const problem of scripture.problems) {
        blockProblems.push({ blockId: problem.blockId, code: 'BLOCK_CONTENT_INCOMPLETE', problems: problem.problems });
      }
      // Continue Exploring: a link whose target lesson no longer exists is reported, never silently dropped (the author removes it).
      for (const block of scripture.blocks) {
        if (block.type !== 'CONTINUE_EXPLORING' || block.content === null) continue;
        const targets = Array.isArray((block.content as { links?: unknown }).links) ? ((block.content as { links: unknown[] }).links) : [];
        const ids = targets.map((l) => (typeof l === 'object' && l !== null ? (l as { lessonId?: unknown }).lessonId : undefined)).filter((id): id is string => typeof id === 'string');
        const found = await this.related.existing(ids, manager);
        const problems = targets.flatMap((l, index) => {
          const id = typeof l === 'object' && l !== null ? (l as { lessonId?: unknown }).lessonId : undefined;
          return typeof id === 'string' && !found.has(id)
            ? [{ path: `links[${index}].lessonId`, message: `Link ${index + 1} points at a lesson that no longer exists. Remove it before publishing.` }]
            : [];
        });
        if (problems.length > 0) blockProblems.push({ blockId: block.blockId, code: 'BLOCK_CONTENT_INCOMPLETE', problems });
      }
      levels.push({ level, resolution: { ...resolution, blocks: scripture.blocks }, blockProblems });
    }

    const links = await this.related.listLinks(lessonId, manager);

    return {
      lessonId: lesson.id,
      courseId: lesson.courseId,
      moduleId: lesson.moduleId,
      status: lesson.status,
      contentRevision: lesson.contentRevision,
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        moduleId: lesson.moduleId,
        title: lesson.title,
        shortTitle: lesson.shortTitle,
        subtitle: lesson.subtitle,
        introduction: lesson.introduction,
        estimatedMinutes: lesson.estimatedMinutes,
        coverMediaId: lesson.coverMediaId,
        relatedLessonIds: links.map((l) => l.lessonId),
        relatedLinks: links.map((l) => ({ lessonId: l.lessonId, ...(l.label ? { label: l.label } : {}), ...(l.levels ? { levels: [...l.levels] } : {}) })),
      },
      availableLevels: [...lesson.levels],
      levels,
    };
  }

  private checkResolvedBlocks(resolution: Resolution): BlockProblem[] {
    const found: BlockProblem[] = [];
    for (const block of resolution.blocks) {
      if (block.source === null || block.content === null) continue; // unresolved: the resolver already reports it

      const definition = this.registry.get(block.type);
      if (!definition) {
        found.push({
          blockId: block.blockId,
          code: 'BLOCK_TYPE_NOT_AVAILABLE',
          problems: [
            { path: '', message: `Block type ${block.type} is not available` },
          ],
        });
        continue;
      }

      const shape = definition.validateShape(block.content);
      if (shape.length > 0) {
        found.push({
          blockId: block.blockId,
          code: 'BLOCK_CONTENT_INVALID',
          problems: shape,
        });
        continue;
      }
      const complete = definition.validateComplete(block.content);
      if (complete.length > 0) {
        found.push({
          blockId: block.blockId,
          code: 'BLOCK_CONTENT_INCOMPLETE',
          problems: complete,
        });
      }
    }
    return found;
  }
}

function toState(lesson: {
  id: string;
  courseId: string | null;
  moduleId: string | null;
  status: ContentStatus;
  contentRevision: number;
  levels: LearningLevel[];
}): LessonWorkflowState {
  return {
    id: lesson.id,
    courseId: lesson.courseId,
    moduleId: lesson.moduleId,
    status: lesson.status,
    contentRevision: lesson.contentRevision,
    availableLevels: [...lesson.levels],
  };
}
