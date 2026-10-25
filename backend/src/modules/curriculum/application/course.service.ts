import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { isForeignKeyViolation } from '../../../database/pg-errors.js';
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
  type TextChanges,
  checkTextChanges,
  checkTitle,
  normalizeDescription,
} from '../domain/text-rules.js';
import { CourseModuleRepository } from '../persistence/course-module.repository.js';
import { CourseRepository } from '../persistence/course.repository.js';
import { HomeEntryRepository } from '../persistence/home-entry.repository.js';

export interface CreateCourseInput {
  title: string;
  description?: string | null;
  /** A media-library image id, or null/omitted for no cover. */
  coverMediaId?: string | null;
  /** The Home Entry (learner Home topic) the course belongs to, or null/omitted for none. */
  homeEntryId?: string | null;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string | null;
  /** undefined = leave alone, null = remove the cover (the image itself is never deleted). */
  coverMediaId?: string | null;
  /** undefined = leave alone, null = no Home Entry. Changing ONLY this does not move the course's status or version. */
  homeEntryId?: string | null;
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

const MISSING_REFERENCE_MESSAGE = 'The selected Home Entry or cover image no longer exists. Reload the page and choose again.';

@Injectable()
export class CourseService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly modules: CourseModuleRepository,
    private readonly homeEntries: HomeEntryRepository,
    private readonly transactions: TransactionRunner,
    private readonly media: MediaFacade,
  ) {}

  async create(input: CreateCourseInput): Promise<Course> {
    const title = checkTitle(input.title);
    const description = normalizeDescription(input.description);
    const coverMediaId = checkCover(input.coverMediaId) ?? null;
    const homeEntryId = checkHomeEntryId(input.homeEntryId) ?? null;
    if (coverMediaId) await this.media.requireImage(coverMediaId);
    try {
      return await this.transactions.run(async (manager) => {
        await this.courses.lockOrdering(manager);
        if (homeEntryId) await this.requireHomeEntry(homeEntryId, manager);
        const position = await this.courses.nextPosition(manager);
        return this.courses.create({ title, description, coverMediaId, homeEntryId, position }, manager);
      });
    } catch (error) {
      throw translateMissingReference(error);
    }
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

  /**
   * Edits a course. Title, description and cover are CONTENT: saving a change to them returns the course to DRAFT and moves its version, as always. The Home Entry is not: it
   * only says which learner Home topic the course is listed under, like the manual course order, so a request that changes nothing but the Home Entry (the other fields, if
   * sent at all, equal to what is stored, which is how the course form sends them) leaves the course's status, version and publication exactly as they were.
   * A request that does not mention the Home Entry behaves exactly as before.
   */
  async update(id: string, input: UpdateCourseInput): Promise<Course> {
    const cover = checkCover(input.coverMediaId);
    const homeEntryId = checkHomeEntryId(input.homeEntryId);
    const hasText = input.title !== undefined || input.description !== undefined;
    // Something must change: a cover-only or Home-Entry-only update is valid; the text rules only require a title or description when nothing else is sent.
    if (!hasText && cover === undefined && homeEntryId === undefined) throw new BusinessRuleError('Nothing to update');
    const changes: TextChanges = hasText ? checkTextChanges(input) : {};

    try {
      return await this.transactions.run(async (manager) => {
        const current = await this.courses.findByIdForUpdate(id, manager);
        if (!current) throw courseNotFound();
        checkExpectedVersion(current.version, input.version);
        // Only a NEW cover or Home Entry is checked: keeping or removing one never needs it to exist.
        if (cover && cover !== current.coverMediaId) await this.media.requireImage(cover);
        if (homeEntryId && homeEntryId !== current.homeEntryId) await this.requireHomeEntry(homeEntryId, manager);

        const contentChanged =
          homeEntryId === undefined
            ? true // not a Home Entry request: the long-standing behaviour, every accepted edit is a content edit
            : (changes.title !== undefined && changes.title !== current.title) ||
              (changes.description !== undefined && changes.description !== current.description) ||
              (cover !== undefined && cover !== current.coverMediaId);

        if (!contentChanged) {
          if (homeEntryId !== undefined && homeEntryId !== current.homeEntryId) await this.courses.setHomeEntry(id, homeEntryId, manager);
          return (await this.courses.findById(id, manager)) ?? current;
        }
        return this.courses.update(
          id,
          {
            ...changes,
            ...(cover !== undefined ? { coverMediaId: cover } : {}),
            ...(homeEntryId !== undefined ? { homeEntryId } : {}),
            status: statusAfterEdit(current.status),
          },
          manager,
        );
      });
    } catch (error) {
      throw translateMissingReference(error);
    }
  }

  /** The Home Entry must exist. No lock is needed: the foreign key itself holds the entry row while a course points at it, and an entry deleted in between trips it (translated below). */
  private async requireHomeEntry(homeEntryId: string, manager: EntityManager): Promise<void> {
    if (!(await this.homeEntries.exists(homeEntryId, manager))) {
      throw new BusinessRuleError('The selected Home Entry no longer exists. Choose another, or None.', { code: 'HOME_ENTRY_NOT_FOUND', field: 'homeEntryId' });
    }
  }

  /**
   * A course that still has modules cannot be deleted: remove the modules first. Its Home Entry (if any) is not a reason to refuse: the entry holds no course of its own, so it
   * simply has one course fewer, and is hidden from learners by itself once none of its courses is published.
   */
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

/** undefined stays undefined (leave alone); null clears; anything else must be a Home Entry id. */
function checkHomeEntryId(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!UUID.test(value)) {
    throw new BusinessRuleError('homeEntryId must be a Home Entry id', { field: 'homeEntryId' });
  }
  return value.toLowerCase();
}

/** A Home Entry (or cover image) deleted between the check and the write trips a foreign key; the editor is told so instead of getting a server error. */
function translateMissingReference(error: unknown): unknown {
  return isForeignKeyViolation(error) ? new BusinessRuleError(MISSING_REFERENCE_MESSAGE, { code: 'COURSE_REFERENCE_MISSING' }) : error;
}

function courseNotFound() {
  return new NotFoundError('Course not found');
}
