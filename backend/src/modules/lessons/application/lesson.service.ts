import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { CurriculumFacade } from '../../curriculum/index.js';
import {
  ConflictError,
  NotFoundError,
  checkExpectedVersion,
  checkReorder,
  positionsFor,
  resolveInsertPosition,
  statusAfterEdit,
} from '../../../shared-kernel/index.js';
import {
  type LessonFieldChanges,
  checkCoverMediaId,
  checkEstimatedMinutes,
  checkLessonChanges,
  checkLevels,
  checkOptionalText,
  checkTitle,
} from '../domain/lesson-rules.js';
import type { Lesson } from '../domain/models.js';
import { LessonBlockLevelRepository } from '../persistence/lesson-block-level.repository.js';
import { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import { LessonRepository } from '../persistence/lesson.repository.js';

export interface CreateLessonInput {
  title: string;
  shortTitle?: string | null;
  subtitle?: string | null;
  introduction?: string | null;
  estimatedMinutes?: number | null;
  coverMediaId?: string | null;
  /** Levels the lesson is available at. Omitted = none yet (the editor chooses explicitly). */
  levels?: string[];
  /** 1-based. Omit to append at the end of the module. */
  position?: number;
}

export interface UpdateLessonInput extends LessonFieldChanges {
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

/**
 * Lock order is always Module, then Lesson. Anything that changes the order of
 * lessons in a module locks the module row first; anything that edits one lesson
 * locks that lesson row.
 */
@Injectable()
export class LessonService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly blocks: LessonBlockRepository,
    private readonly blockLevels: LessonBlockLevelRepository,
    private readonly curriculum: CurriculumFacade,
    private readonly transactions: TransactionRunner,
  ) {}

  async create(
    courseId: string,
    moduleId: string,
    input: CreateLessonInput,
  ): Promise<Lesson> {
    const title = checkTitle(input.title);
    const shortTitle = checkOptionalText(input.shortTitle, 'shortTitle');
    const subtitle = checkOptionalText(input.subtitle, 'subtitle');
    const introduction = checkOptionalText(input.introduction, 'introduction');
    const estimatedMinutes = checkEstimatedMinutes(input.estimatedMinutes);
    checkCoverMediaId(input.coverMediaId);
    const levels = checkLevels(input.levels ?? []);

    return this.transactions.run(async (manager) => {
      await this.lockModuleOf(courseId, moduleId, manager);

      const count = await this.lessons.countByModule(moduleId, manager);
      const position = resolveInsertPosition(input.position, count);
      if (position <= count) {
        await this.lessons.shiftFrom(moduleId, position, 1, manager);
      }

      const lesson = await this.lessons.insert(
        {
          moduleId,
          title,
          shortTitle,
          subtitle,
          introduction,
          estimatedMinutes,
          position,
        },
        manager,
      );
      await this.lessons.replaceLevels(lesson.id, levels, manager);
      return this.lessons.reload(lesson.id, manager);
    });
  }

  /** Lessons of a module, in module order. */
  async list(courseId: string, moduleId: string): Promise<Lesson[]> {
    const module = await this.curriculum.findModule(moduleId);
    if (!module || module.courseId !== courseId) throw moduleNotFound();
    return this.lessons.listByModule(moduleId);
  }

  async get(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson) throw lessonNotFound();
    return lesson;
  }

  async update(lessonId: string, input: UpdateLessonInput): Promise<Lesson> {
    const changes = checkLessonChanges(input);
    // coverMediaId is validated (always null for now) but not stored until Media exists.
    const { coverMediaId: _cover, ...fields } = changes;

    return this.transactions.run(async (manager) => {
      const current = await this.lockLesson(lessonId, manager);
      checkExpectedVersion(current.version, input.version);

      return this.lessons.update(
        lessonId,
        { ...fields, status: statusAfterEdit(current.status) },
        manager,
      );
    });
  }

  /** Replaces the levels the lesson is available at. */
  async setLevels(
    lessonId: string,
    levels: string[],
    expectedVersion?: number,
  ): Promise<Lesson> {
    const checked = checkLevels(levels);

    return this.transactions.run(async (manager) => {
      const current = await this.lockLesson(lessonId, manager);
      checkExpectedVersion(current.version, expectedVersion);

      // A level cannot be removed while blocks are visible at it: hide them there first.
      const removed = current.levels.filter(
        (level) => !checked.includes(level),
      );
      if (removed.length > 0) {
        const visible = await this.blockLevels.findVisibleAt(
          lessonId,
          removed,
          manager,
        );
        if (visible.length > 0) {
          throw new ConflictError(
            'Some blocks are still visible at levels you are removing. Hide them at those levels first.',
            {
              levels: [...new Set(visible.map((row) => row.level))],
              blocks: visible,
            },
          );
        }
      }

      await this.lessons.replaceLevels(lessonId, checked, manager);
      // Availability is lesson content: count it as a change.
      return this.lessons.update(
        lessonId,
        { status: statusAfterEdit(current.status) },
        manager,
      );
    });
  }

  /** Removes the lesson and closes the gap in the module's order. A lesson that still has blocks cannot be deleted. */
  async delete(lessonId: string): Promise<void> {
    // Read the module id first (unlocked), so the locks can be taken in order: Module, then Lesson.
    const existing = await this.lessons.findById(lessonId);
    if (!existing) throw lessonNotFound();

    await this.transactions.run(async (manager) => {
      await this.curriculum.lockModule(existing.moduleId, manager);
      const current = await this.lockLesson(lessonId, manager);

      const blockCount = await this.blocks.countByLesson(lessonId, manager);
      if (blockCount > 0) {
        throw new ConflictError(
          'This lesson still has blocks. Remove its blocks before deleting it.',
          { blockCount },
        );
      }

      await this.lessons.delete(lessonId, manager);
      await this.lessons.shiftFrom(
        current.moduleId,
        current.position + 1,
        -1,
        manager,
      );
    });
  }

  /** Sets the order of all lessons of a module. `lessonIds` must list each lesson exactly once. */
  async reorder(
    courseId: string,
    moduleId: string,
    lessonIds: readonly string[],
  ): Promise<Lesson[]> {
    return this.transactions.run(async (manager) => {
      await this.lockModuleOf(courseId, moduleId, manager);

      const current = await this.lessons.listByModule(moduleId, manager);
      checkReorder(
        current.map((lesson) => lesson.id),
        lessonIds,
      );

      await this.lessons.applyPositions(
        moduleId,
        lessonIds,
        positionsFor(lessonIds),
        manager,
      );
      return this.lessons.listByModule(moduleId, manager);
    });
  }

  /** Locks the module and checks it belongs to the course in the URL. */
  private async lockModuleOf(
    courseId: string,
    moduleId: string,
    manager: EntityManager,
  ): Promise<void> {
    const module = await this.curriculum.lockModule(moduleId, manager);
    if (module.courseId !== courseId) throw moduleNotFound();
  }

  private async lockLesson(
    lessonId: string,
    manager: EntityManager,
  ): Promise<Lesson> {
    const lesson = await this.lessons.findByIdForUpdate(lessonId, manager);
    if (!lesson) throw lessonNotFound();
    return lesson;
  }
}

function lessonNotFound() {
  return new NotFoundError('Lesson not found');
}

function moduleNotFound() {
  return new NotFoundError('Module not found');
}
