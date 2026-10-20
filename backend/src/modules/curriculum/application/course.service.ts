import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { MediaFacade } from '../../media/index.js';
import {
  ConflictError,
  NotFoundError,
  BusinessRuleError,
  checkReorder,
  positionsFor,
  statusAfterEdit,
  checkExpectedVersion,
} from '../../../shared-kernel/index.js';
import type { Course } from '../domain/models.js';
import {
  checkTextChanges,
  checkTitle,
  normalizeDescription,
} from '../domain/text-rules.js';
import { CourseModuleRepository } from '../persistence/course-module.repository.js';
import { CourseRepository } from '../persistence/course.repository.js';

export interface CreateCourseInput {
  title: string;
  description?: string | null;
  /** A media-library image id, or null/omitted for no cover. */
  coverMediaId?: string | null;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string | null;
  /** undefined = leave alone, null = remove the cover (the image itself is never deleted). */
  coverMediaId?: string | null;
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

@Injectable()
export class CourseService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly modules: CourseModuleRepository,
    private readonly transactions: TransactionRunner,
    private readonly media: MediaFacade,
  ) {}

  async create(input: CreateCourseInput): Promise<Course> {
    const title = checkTitle(input.title);
    const description = normalizeDescription(input.description);
    const coverMediaId = checkCover(input.coverMediaId) ?? null;
    if (coverMediaId) await this.media.requireImage(coverMediaId);
    return this.transactions.run(async (manager) => {
      await this.courses.lockOrdering(manager);
      const position = await this.courses.nextPosition(manager);
      return this.courses.create({ title, description, coverMediaId, position }, manager);
    });
  }

  /** Every course in the manual order (the "Arrange courses" view). */
  listAll(): Promise<Course[]> {
    return this.courses.listAll();
  }

  /**
   * Sets the order of ALL courses. `courseIds` must list each course exactly once and `previousCourseIds` must be
   * the order the editor last saw: if anyone reordered, added or deleted a course since, it is refused (409) and
   * nothing changes. This is not a content edit, so course status and version are untouched; learners see the
   * new order immediately because the catalog list reads it live (it can never expose an unpublished course).
   */
  async reorder(
    courseIds: readonly string[],
    previousCourseIds: readonly string[],
  ): Promise<Course[]> {
    return this.transactions.run(async (manager) => {
      await this.courses.lockOrdering(manager);
      const currentIds = (await this.courses.listAll(manager)).map((c) => c.id);
      const unchanged =
        currentIds.length === previousCourseIds.length &&
        currentIds.every((id, index) => id === previousCourseIds[index]);
      if (!unchanged) {
        throw new ConflictError(
          'The course order was changed by someone else. Reload the list and try again.',
        );
      }
      checkReorder(currentIds, courseIds);
      await this.courses.applyPositions(
        courseIds,
        positionsFor(courseIds),
        manager,
      );
      return this.courses.listAll(manager);
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
    const cover = checkCover(input.coverMediaId);
    // A cover-only update is valid: the text rules only require something to change when no cover is sent.
    const changes = cover === undefined || input.title !== undefined || input.description !== undefined
      ? checkTextChanges(input)
      : {};

    return this.transactions.run(async (manager) => {
      const current = await this.courses.findByIdForUpdate(id, manager);
      if (!current) throw courseNotFound();
      checkExpectedVersion(current.version, input.version);
      // Only a NEW cover is checked: keeping or removing one never needs the asset to exist.
      if (cover && cover !== current.coverMediaId) await this.media.requireImage(cover);

      return this.courses.update(
        id,
        {
          ...changes,
          ...(cover !== undefined ? { coverMediaId: cover } : {}),
          status: statusAfterEdit(current.status),
        },
        manager,
      );
    });
  }

  /** A course that still has modules cannot be deleted: remove the modules first. */
  async delete(id: string): Promise<void> {
    await this.transactions.run(async (manager) => {
      await this.courses.lockOrdering(manager);
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** undefined stays undefined (leave alone); null clears; anything else must be an asset id. */
function checkCover(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!UUID.test(value)) {
    throw new BusinessRuleError('coverMediaId must be a media asset id', { field: 'coverMediaId' });
  }
  return value.toLowerCase();
}

function courseNotFound() {
  return new NotFoundError('Course not found');
}
