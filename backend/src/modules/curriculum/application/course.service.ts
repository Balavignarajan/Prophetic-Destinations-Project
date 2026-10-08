import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { ConflictError, NotFoundError } from '../../../shared-kernel/index.js';
import { statusAfterEdit } from '../domain/content-status.js';
import type { Course } from '../domain/models.js';
import {
  checkTextChanges,
  checkTitle,
  normalizeDescription,
} from '../domain/text-rules.js';
import { checkExpectedVersion } from '../domain/versioning.js';
import { CourseModuleRepository } from '../persistence/course-module.repository.js';
import { CourseRepository } from '../persistence/course.repository.js';

export interface CreateCourseInput {
  title: string;
  description?: string | null;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string | null;
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

@Injectable()
export class CourseService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly modules: CourseModuleRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async create(input: CreateCourseInput): Promise<Course> {
    return this.courses.create({
      title: checkTitle(input.title),
      description: normalizeDescription(input.description),
    });
  }

  list(limit: number, offset: number) {
    return this.courses.list(limit, offset);
  }

  async get(id: string): Promise<Course> {
    const course = await this.courses.findById(id);
    if (!course) throw courseNotFound();
    return course;
  }

  async update(id: string, input: UpdateCourseInput): Promise<Course> {
    const changes = checkTextChanges(input);

    return this.transactions.run(async (manager) => {
      const current = await this.courses.findByIdForUpdate(id, manager);
      if (!current) throw courseNotFound();
      checkExpectedVersion(current.version, input.version);

      return this.courses.update(
        id,
        { ...changes, status: statusAfterEdit(current.status) },
        manager,
      );
    });
  }

  /** A course that still has modules cannot be deleted: remove the modules first. */
  async delete(id: string): Promise<void> {
    await this.transactions.run(async (manager) => {
      const course = await this.courses.findByIdForUpdate(id, manager);
      if (!course) throw courseNotFound();

      const moduleCount = await this.modules.countByCourse(id, manager);
      if (moduleCount > 0) {
        throw new ConflictError(
          'This course still has modules. Remove its modules before deleting it.',
          { moduleCount },
        );
      }
      await this.courses.delete(id, manager);
    });
  }
}

function courseNotFound() {
  return new NotFoundError('Course not found');
}
