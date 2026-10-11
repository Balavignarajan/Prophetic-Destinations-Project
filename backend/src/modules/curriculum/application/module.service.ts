import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import {
  NotFoundError,
  checkReorder,
  positionsFor,
  resolveInsertPosition,
  statusAfterEdit,
  checkExpectedVersion,
} from '../../../shared-kernel/index.js';
import type { CourseModule } from '../domain/models.js';
import {
  checkTextChanges,
  checkTitle,
  normalizeDescription,
} from '../domain/text-rules.js';
import { CourseModuleRepository } from '../persistence/course-module.repository.js';
import { CourseRepository } from '../persistence/course.repository.js';

export interface CreateModuleInput {
  title: string;
  description?: string | null;
  /** 1-based. Omit to append at the end. */
  position?: number;
}

export interface UpdateModuleInput {
  title?: string;
  description?: string | null;
  version?: number;
}

/**
 * Every operation that changes a course's modules first locks the course row,
 * so concurrent inserts, deletes and reorders on one course run one at a time
 * and positions stay 1..n without gaps.
 */
@Injectable()
export class ModuleService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly modules: CourseModuleRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(courseId: string): Promise<CourseModule[]> {
    await this.requireCourse(courseId);
    return this.modules.listByCourse(courseId);
  }

  async get(courseId: string, moduleId: string): Promise<CourseModule> {
    const module = await this.modules.findById(moduleId);
    if (!module || module.courseId !== courseId) throw moduleNotFound();
    return module;
  }

  async create(
    courseId: string,
    input: CreateModuleInput,
  ): Promise<CourseModule> {
    const title = checkTitle(input.title);
    const description = normalizeDescription(input.description);

    return this.transactions.run(async (manager) => {
      await this.lockCourse(courseId, manager);

      const count = await this.modules.countByCourse(courseId, manager);
      const position = resolveInsertPosition(input.position, count);
      if (position <= count) {
        await this.modules.shiftFrom(courseId, position, 1, manager);
      }
      return this.modules.insert(
        { courseId, title, description, position },
        manager,
      );
    });
  }

  async update(
    courseId: string,
    moduleId: string,
    input: UpdateModuleInput,
  ): Promise<CourseModule> {
    const changes = checkTextChanges(input);

    return this.transactions.run(async (manager) => {
      const current = await this.modules.findByIdForUpdate(moduleId, manager);
      if (!current || current.courseId !== courseId) throw moduleNotFound();
      checkExpectedVersion(current.version, input.version);

      return this.modules.update(
        moduleId,
        { ...changes, status: statusAfterEdit(current.status) },
        manager,
      );
    });
  }

  /** Removes the module and closes the gap, so the remaining positions stay 1..n. */
  async delete(courseId: string, moduleId: string): Promise<void> {
    await this.transactions.run(async (manager) => {
      await this.lockCourse(courseId, manager);

      const current = await this.modules.findById(moduleId, manager);
      if (!current || current.courseId !== courseId) throw moduleNotFound();

      await this.modules.delete(moduleId, manager);
      await this.modules.shiftFrom(courseId, current.position + 1, -1, manager);
    });
  }

  /** Sets the order of all modules of a course. `moduleIds` must list each module exactly once. */
  async reorder(
    courseId: string,
    moduleIds: readonly string[],
  ): Promise<CourseModule[]> {
    return this.transactions.run(async (manager) => {
      const course = await this.lockCourse(courseId, manager);

      const current = await this.modules.listByCourse(courseId, manager);
      const currentIds = current.map((module) => module.id);
      checkReorder(currentIds, moduleIds);

      await this.modules.applyPositions(
        courseId,
        moduleIds,
        positionsFor(moduleIds),
        manager,
      );
      // The order of the modules is part of the course: changing it is an edit, so a published course goes
      // back to DRAFT and the new order only becomes public once it has been approved and published.
      if (moduleIds.some((id, index) => id !== currentIds[index])) {
        await this.courses.update(
          courseId,
          { status: statusAfterEdit(course.status) },
          manager,
        );
      }
      return this.modules.listByCourse(courseId, manager);
    });
  }

  private async requireCourse(courseId: string): Promise<void> {
    if (!(await this.courses.findById(courseId))) throw courseNotFound();
  }

  private async lockCourse(courseId: string, manager: EntityManager) {
    const course = await this.courses.findByIdForUpdate(courseId, manager);
    if (!course) throw courseNotFound();
    return course;
  }
}

function courseNotFound() {
  return new NotFoundError('Course not found');
}

function moduleNotFound() {
  return new NotFoundError('Module not found');
}
