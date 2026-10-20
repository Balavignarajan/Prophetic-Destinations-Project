import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { isForeignKeyViolation } from '../../../database/pg-errors.js';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { CurriculumFacade } from '../../curriculum/index.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  checkExpectedVersion,
  checkReorder,
  positionsFor,
  resolveInsertPosition,
  statusAfterEdit,
} from '../../../shared-kernel/index.js';
import { MediaFacade } from '../../media/index.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import {
  LIMITS,
  type LessonFieldChanges,
  checkCoverMediaId,
  checkEstimatedMinutes,
  checkLessonChanges,
  checkLevels,
  checkOptionalText,
  checkTitle,
  lessonFieldsDiffer,
  sameLevels,
} from '../domain/lesson-rules.js';
import type { Lesson } from '../domain/models.js';
import { type LessonLookupRow, LessonRelatedRepository, type RelatedLinkInput, type RelatedLinkRow } from '../persistence/lesson-related.repository.js';
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
    private readonly blockTypes: BlockTypeRegistry,
    private readonly media: MediaFacade,
    private readonly related: LessonRelatedRepository,
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
    const coverMediaId = checkCoverMediaId(input.coverMediaId);
    const levels = checkLevels(input.levels ?? []);

    return this.transactions.run(async (manager) => {
      await this.lockModuleOf(courseId, moduleId, manager);
      if (coverMediaId) await this.media.requireImage(coverMediaId);

      // Append = after the highest position (the module lock is held); an explicit position inserts and shifts.
      const count = await this.lessons.countByModule(moduleId, manager);
      const position =
        input.position === undefined
          ? (await this.lessons.maxPositionByModule(moduleId, manager)) + 1
          : resolveInsertPosition(input.position, count);
      if (input.position !== undefined && position <= count) {
        await this.lessons.shiftFrom(moduleId, position, 1, manager);
      }

      const lesson = await this.lessons.insert(
        {
          courseId,
          moduleId,
          title,
          shortTitle,
          subtitle,
          introduction,
          estimatedMinutes,
          coverMediaId,
          position,
        },
        manager,
      );
      await this.lessons.replaceLevels(lesson.id, levels, manager);
      return this.lessons.reload(lesson.id, manager);
    });
  }

  /**
   * Creates a standalone LIBRARY lesson: no course, no module, so no parent lock and no order. It is an authoring source that is copied into a course
   * or module (see `duplicate`) to be reviewed, published and delivered; on its own it can never be published or reach a learner. Position is
   * always 1 (it has no siblings).
   */
  async createLibrary(input: CreateLessonInput): Promise<Lesson> {
    const title = checkTitle(input.title);
    const shortTitle = checkOptionalText(input.shortTitle, 'shortTitle');
    const subtitle = checkOptionalText(input.subtitle, 'subtitle');
    const introduction = checkOptionalText(input.introduction, 'introduction');
    const estimatedMinutes = checkEstimatedMinutes(input.estimatedMinutes);
    const coverMediaId = checkCoverMediaId(input.coverMediaId);
    const levels = checkLevels(input.levels ?? []);
    return this.transactions.run(async (manager) => {
      if (coverMediaId) await this.media.requireImage(coverMediaId);
      const lesson = await this.lessons.insert(
        { courseId: null, moduleId: null, title, shortTitle, subtitle, introduction, estimatedMinutes, coverMediaId, position: 1 },
        manager,
      );
      await this.lessons.replaceLevels(lesson.id, levels, manager);
      return this.lessons.reload(lesson.id, manager);
    });
  }

  /** The library: standalone lessons, most recently changed first, optionally filtered by a title search. */
  listLibrary(text: string, limit: number, offset: number) {
    return this.lessons.listLibrary(text.trim(), limit, offset);
  }

  /** Creates a lesson directly inside a course; modules are optional groups, never implicit containers. */
  async createDirect(courseId: string, input: CreateLessonInput): Promise<Lesson> {
    const title = checkTitle(input.title);
    const shortTitle = checkOptionalText(input.shortTitle, 'shortTitle');
    const subtitle = checkOptionalText(input.subtitle, 'subtitle');
    const introduction = checkOptionalText(input.introduction, 'introduction');
    const estimatedMinutes = checkEstimatedMinutes(input.estimatedMinutes);
    const coverMediaId = checkCoverMediaId(input.coverMediaId);
    const levels = checkLevels(input.levels ?? []);
    return this.transactions.run(async (manager) => {
      await this.curriculum.lockCourse(courseId, manager);
      if (coverMediaId) await this.media.requireImage(coverMediaId);
      // Append = after the highest position (the course lock is held); an explicit position inserts and shifts.
      const count = await this.lessons.countDirectByCourse(courseId, manager);
      const position =
        input.position === undefined
          ? (await this.lessons.maxPositionDirect(courseId, manager)) + 1
          : resolveInsertPosition(input.position, count);
      if (input.position !== undefined && position <= count) await this.lessons.shiftDirectFrom(courseId, position, 1, manager);
      const lesson = await this.lessons.insert({ courseId, moduleId: null, title, shortTitle, subtitle, introduction, estimatedMinutes, coverMediaId, position }, manager);
      await this.lessons.replaceLevels(lesson.id, levels, manager);
      return this.lessons.reload(lesson.id, manager);
    });
  }

  /**
   * Copies the saved working content of a lesson into a new, independent DRAFT lesson, appended to the end of its destination. Without a
   * `destination` the copy goes where the source is (the same course and module; a library lesson's copy is another library lesson). With one, the
   * copy goes into that course (directly) or into that module of it: the destination parent is locked first, then the source lesson, in one transaction.
   * Copied: metadata, the cover reference, levels, blocks in order, every block level row (visibility and variants) with the content JSON unchanged
   * (media and quiz ids stay shared references, files are not copied, media-usage protection sees both lessons; Scripture stamps are kept as they
   * are), and the authored related links. Not copied: status (always Draft), version/revision counters, timestamps, workflow events, approvals,
   * publications, learner progress. Block content holds no ids of other blocks, so nothing needs remapping. A lesson with a block type that is not
   * implemented cannot be copied safely, so it is refused. The source is never modified.
   */
  async duplicate(
    lessonId: string,
    requestedTitle?: string,
    destination?: { courseId: string; moduleId?: string | null },
  ): Promise<Lesson> {
    const existing = await this.lessons.findById(lessonId);
    if (!existing) throw lessonNotFound();
    if (destination?.moduleId && !destination.courseId) {
      throw new BusinessRuleError('A module needs its course', { code: 'DESTINATION_COURSE_REQUIRED' });
    }
    // Where the copy goes: the explicit destination, otherwise next to the source (a library source stays in the library).
    const target: { courseId: string | null; moduleId: string | null } = destination
      ? { courseId: destination.courseId, moduleId: destination.moduleId ?? null }
      : { courseId: existing.courseId, moduleId: existing.moduleId };

    return this.transactions.run(async (manager) => {
      // Lock order: the destination parent (module, else course), then the source lesson. A library destination has no parent to lock.
      if (target.moduleId) {
        const module = await this.curriculum.lockModule(target.moduleId, manager);
        if (module.courseId !== target.courseId) throw moduleNotFound();
      } else if (target.courseId) {
        await this.curriculum.lockCourse(target.courseId, manager);
      }
      const source = await this.lockLesson(lessonId, manager);
      if (source.moduleId !== existing.moduleId || source.courseId !== existing.courseId) {
        throw new ConflictError('The lesson was moved while it was being copied. Try again.');
      }

      const title = checkTitle(
        requestedTitle ?? `Copy of ${source.title}`.slice(0, LIMITS.title),
      );
      const sourceBlocks = await this.blocks.listByLesson(lessonId, manager);
      const unsupported = [...new Set(sourceBlocks.map((b) => b.type))].filter(
        (type) => !this.blockTypes.get(type),
      );
      if (unsupported.length > 0) {
        throw new BusinessRuleError(
          `This lesson contains block types that cannot be duplicated yet (${unsupported.join(', ')}). Nothing was copied.`,
          { unsupportedTypes: unsupported },
        );
      }

      // Append after the highest existing position (the parent lock is held), so a gap can never cause a collision.
      const last = target.moduleId
        ? await this.lessons.maxPositionByModule(target.moduleId, manager)
        : target.courseId
          ? await this.lessons.maxPositionDirect(target.courseId, manager)
          : 0;
      const copy = await this.lessons.insert(
        {
          courseId: target.courseId,
          moduleId: target.moduleId,
          title,
          shortTitle: source.shortTitle,
          subtitle: source.subtitle,
          introduction: source.introduction,
          estimatedMinutes: source.estimatedMinutes,
          coverMediaId: source.coverMediaId,
          position: target.courseId ? last + 1 : 1,
        },
        manager,
      );
      await this.lessons.replaceLevels(copy.id, source.levels, manager);

      for (const block of sourceBlocks) {
        const created = await this.blocks.insert(
          {
            lessonId: copy.id,
            type: block.type,
            sharedContent: block.sharedContent,
            position: block.position,
          },
          manager,
        );
        await this.blockLevels.copyToLesson(block.id, created.id, copy.id, manager);
      }
      // Related lessons are copied by reference (targets are never duplicated); links that point at the original are not copied.
      await this.related.copyOwned(source.id, copy.id, manager);
      return this.lessons.reload(copy.id, manager);
    });
  }

  /** The lesson's related lessons in order, with course/module context and status (draft targets are marked by their status). */
  async getRelated(lessonId: string): Promise<{ items: RelatedLinkRow[]; lessonVersion: number }> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson) throw lessonNotFound();
    return { items: await this.related.listDetailed(lessonId), lessonVersion: lesson.version };
  }

  /** Lessons whose title contains `text`, with context, for choosing related lessons. `excludeId` (the lesson being edited) is left out. */
  searchLessons(text: string, excludeId: string | null): Promise<LessonLookupRow[]> {
    return this.related.search(text.trim(), excludeId, 20);
  }

  /** The lessons with these ids (context for the targets already chosen in a Continue Exploring block). */
  lookupLessons(ids: readonly string[]): Promise<LessonLookupRow[]> {
    return this.related.lookup(ids.slice(0, 20));
  }

  /**
   * Replaces the related lessons (manual links, in the author's order, each with an optional custom label and level visibility). This is lesson
   * content: like any edit it moves the version and content revision and returns an approved/published lesson to Draft, so a changed selection,
   * label or visibility is approved again before it is published. An identical request (same targets, order, labels and levels) changes nothing.
   * Rules (proposed): at most 10; no duplicates; never the lesson itself; every target must exist; label is plain text of at most 120 characters
   * (blank = none); levels are a non-empty subset of the three levels, and all three is stored as "every level" (null).
   * A target need not be published to be linked (it is simply not shown to learners until it is deliverable); linking never publishes it, and the
   * target lesson is never modified by editing a link.
   */
  async setRelated(
    lessonId: string,
    input: { lessonIds?: readonly string[]; links?: readonly { lessonId: string; label?: string | null; levels?: readonly string[] | null }[] },
    expectedVersion?: number,
  ): Promise<{ items: RelatedLinkRow[]; lessonVersion: number }> {
    if (!input.links && !input.lessonIds) throw new BusinessRuleError('Send the list of related lessons', { code: 'RELATED_LIST_REQUIRED' });
    const ids = input.links ? input.links.map((l) => l.lessonId) : input.lessonIds!;
    if (ids.length > 10) throw new BusinessRuleError('A lesson can have at most 10 related lessons', { max: 10 });
    if (new Set(ids).size !== ids.length) throw new BusinessRuleError('A lesson can be listed only once', { code: 'DUPLICATE_RELATED' });
    if (ids.includes(lessonId)) throw new BusinessRuleError('A lesson cannot be related to itself', { code: 'SELF_RELATED' });

    return this.transactions.run(async (manager) => {
      const current = await this.lockLesson(lessonId, manager);
      checkExpectedVersion(current.version, expectedVersion);
      const stored = await this.related.listLinks(lessonId, manager);
      // Older clients send ids only: links that stay keep their stored label and levels.
      const wanted: RelatedLinkInput[] = input.links
        ? input.links.map((l) => ({ lessonId: l.lessonId, label: normaliseLinkLabel(l.label), levels: normaliseLinkLevels(l.levels) }))
        : ids.map((id) => stored.find((s) => s.lessonId === id) ?? { lessonId: id, label: null, levels: null });
      const same = (a: RelatedLinkInput, b: RelatedLinkInput) => a.lessonId === b.lessonId && a.label === b.label && JSON.stringify(a.levels) === JSON.stringify(b.levels);
      if (stored.length === wanted.length && stored.every((link, index) => same(link, wanted[index]))) {
        return { items: await this.related.listDetailed(lessonId, manager), lessonVersion: current.version };
      }
      const found = await this.related.existing(ids, manager);
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new BusinessRuleError('One of the chosen lessons no longer exists. Reload the list and choose again.', { code: 'RELATED_NOT_FOUND', missing });
      }
      try {
        await this.related.replace(lessonId, wanted, manager);
      } catch (error) {
        // A chosen lesson was deleted between the check above and the insert (the foreign key is the backstop).
        if (isForeignKeyViolation(error)) {
          throw new BusinessRuleError('One of the chosen lessons no longer exists. Reload the list and choose again.', { code: 'RELATED_NOT_FOUND' });
        }
        throw error;
      }
      const updated = await this.lessons.update(lessonId, { status: statusAfterEdit(current.status) }, manager);
      return { items: await this.related.listDetailed(lessonId, manager), lessonVersion: updated.version };
    });
  }

  /** Lessons of a module, in module order. */
  async list(courseId: string, moduleId: string): Promise<Lesson[]> {
    const module = await this.curriculum.findModule(moduleId);
    if (!module || module.courseId !== courseId) throw moduleNotFound();
    return this.lessons.listByModule(moduleId);
  }

  async listDirect(courseId: string): Promise<Lesson[]> {
    if (!(await this.curriculum.findCourse(courseId))) throw courseNotFound();
    return this.lessons.listDirectByCourse(courseId);
  }

  async get(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson) throw lessonNotFound();
    return lesson;
  }

  async update(lessonId: string, input: UpdateLessonInput): Promise<Lesson> {
    const changes = checkLessonChanges(input);
    const fields = changes;

    return this.transactions.run(async (manager) => {
      const current = await this.lockLesson(lessonId, manager);
      checkExpectedVersion(current.version, input.version);
      // Only a NEW cover is checked: keeping or removing one never needs the asset to exist.
      if (fields.coverMediaId && fields.coverMediaId !== current.coverMediaId) {
        await this.media.requireImage(fields.coverMediaId);
      }

      // Nothing would change: no write, so no version bump, no revision move and no reset of the status.
      if (!lessonFieldsDiffer(current, fields)) return current;

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

      // Same set of levels: nothing changes, so nothing is written.
      if (sameLevels(current.levels, checked)) return current;

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
      if (existing.moduleId) await this.curriculum.lockModule(existing.moduleId, manager);
      else if (existing.courseId) await this.curriculum.lockCourse(existing.courseId, manager);
      // (a library lesson has no parent to lock)
      // Lock order: parent (module or course), then this lesson TOGETHER with every lesson that links to it, in ascending id order.
      await this.lockWithSources(lessonId, manager);
      const current = await this.lockLesson(lessonId, manager);

      const blockCount = await this.blocks.countByLesson(lessonId, manager);
      if (blockCount > 0) {
        throw new ConflictError(
          'This lesson still has blocks. Remove its blocks before deleting it.',
          { blockCount },
        );
      }

      // Lessons that link to this one lose that link. That changes THEIR working content, so each is treated like any other edit.
      await this.removeIncomingLinks(lessonId, manager);

      await this.lessons.delete(lessonId, manager);
      if (current.moduleId) await this.lessons.shiftFrom(current.moduleId, current.position + 1, -1, manager);
      else if (current.courseId) await this.lessons.shiftDirectFrom(current.courseId, current.position + 1, -1, manager);
    });
  }

  /**
   * Locks the lesson and every lesson that links to it in one id-ordered statement (see LessonRepository.lockMany). If a new link to the lesson
   * appeared between reading the sources and locking them, the set is no longer the locked one and the caller must retry (409), so no source is
   * ever changed without its lock.
   */
  // LOCK ORDER (every path that writes or removes a reference to a lesson):
  //  - Deleting T: parent, then T and every source of T (metadata links AND Continue Exploring blocks) in ONE id-ordered FOR UPDATE; then the sources are
  //    re-read, and any source that appeared meanwhile makes the whole delete a retryable 409.
  //  - Saving a Continue Exploring block of S: S (FOR UPDATE), then only the NEW targets FOR SHARE NOWAIT in id order. It never waits for a target, so it
  //    cannot be the waiting half of a cycle; if a target is being deleted it gets a retryable 409, and if the delete has not started it blocks the delete
  //    until this save commits, after which the delete sees the new reference and retries.
  //  - Duplicating a lesson or a block: the source is locked FOR UPDATE; the copy is a new source that the deleter's re-read detects (409) rather than
  //    misses. Metadata links keep their foreign keys as the backstop.
  // This does NOT claim deadlock freedom for every combination (two deletes of lessons that link to each other, or a metadata-link save, can still wait
  // on each other): PostgreSQL then aborts one transaction and TransactionRunner turns it into the same retryable 409; nothing is half-applied.
  private async lockWithSources(lessonId: string, manager: EntityManager): Promise<void> {
    const sources = await this.related.sourcesOf(lessonId, manager);
    const locked = new Set(await this.lessons.lockMany([lessonId, ...sources], manager));
    if (!locked.has(lessonId)) throw lessonNotFound();
    const now = await this.related.sourcesOf(lessonId, manager);
    if (now.some((id) => !locked.has(id))) {
      throw new ConflictError('Another lesson was just linked to this one. Try again.');
    }
  }

  /**
   * Removes the links that point at a lesson that is being deleted. Each affected source (already locked by lockWithSources) is edited like any
   * other change to its content: its links lose the target, its version and content revision move, and an approved or published source returns to
   * Draft, so the changed selection is approved again before it is published. Published snapshots are not touched (they keep the id they froze;
   * learners simply stop being shown a lesson that no longer exists).
   */
  private async removeIncomingLinks(targetId: string, manager: EntityManager): Promise<void> {
    const sources = await this.related.sourcesOf(targetId, manager);
    for (const sourceId of sources) {
      const source = await this.lockLesson(sourceId, manager);
      await this.related.removeLink(sourceId, targetId, manager);
      // The same lesson may also link to the target from a Continue Exploring block of its own: that is separate data, removed here for the same reason.
      await this.related.removeBlockLinks(sourceId, targetId, manager);
      await this.lessons.update(sourceId, { status: statusAfterEdit(source.status) }, manager);
    }
  }

  /** Sets the order of all lessons of a module. `lessonIds` must list each lesson exactly once. */
  async reorder(
    courseId: string,
    moduleId: string,
    lessonIds: readonly string[],
    previousLessonIds?: readonly string[],
  ): Promise<Lesson[]> {
    return this.transactions.run(async (manager) => {
      await this.lockModuleOf(courseId, moduleId, manager);

      const current = await this.lessons.listByModule(moduleId, manager);
      const currentIds = current.map((lesson) => lesson.id);
      // With the order the editor last saw: any difference is a 409 and nothing is written.
      if (previousLessonIds && (currentIds.length !== previousLessonIds.length || currentIds.some((id, index) => id !== previousLessonIds[index]))) {
        throw new ConflictError('The lesson order was changed by someone else. Reload the module and try again.');
      }
      checkReorder(currentIds, lessonIds);
      // Published ordering only: when the editor sent the order it saw, lessons that are not PUBLISHED must keep their place.
      if (previousLessonIds) {
        const moved = current.filter((lesson, index) => lesson.status !== 'PUBLISHED' && lessonIds[index] !== lesson.id);
        if (moved.length > 0) {
          throw new BusinessRuleError('Only published lessons can be reordered here. Lessons that are not published must keep their place.', {
            code: 'ONLY_PUBLISHED_REORDERABLE',
            lessonIds: moved.map((lesson) => lesson.id),
          });
        }
      }

      await this.lessons.applyPositions(
        moduleId,
        lessonIds,
        positionsFor(lessonIds),
        manager,
      );
      // The lesson order is part of the module: changing it is an edit of the module (a published module goes
      // back to DRAFT), so a new order is only published once the module has been approved again.
      if (lessonIds.some((id, index) => id !== currentIds[index])) {
        await this.curriculum.markModuleEdited(moduleId, manager);
      }
      return this.lessons.listByModule(moduleId, manager);
    });
  }

  /**
   * Sets the order of ALL of a course's direct lessons, under the course lock. With `previousLessonIds` (the order the editor last saw) the stored order
   * must match it exactly, else 409 and nothing is written, so two editors cannot silently overwrite each other; then only PUBLISHED lessons may change
   * places: every other lesson must stay at its own position. The request must still list every lesson exactly once (no duplicates, unknown or missing ids,
   * and so no lesson of another course). It changes positions only: no lesson content, version, revision or status. What learners see changes when the
   * course catalog is published again (the catalog takes the authoring order of direct lessons at a course publish).
   */
  async reorderDirect(courseId: string, lessonIds: readonly string[], previousLessonIds?: readonly string[]): Promise<Lesson[]> {
    return this.transactions.run(async (manager) => {
      await this.curriculum.lockCourse(courseId, manager);
      const current = await this.lessons.listDirectByCourse(courseId, manager);
      if (previousLessonIds && (current.length !== previousLessonIds.length || current.some((lesson, index) => lesson.id !== previousLessonIds[index]))) {
        throw new ConflictError('The lesson order was changed by someone else. Reload the course and try again.');
      }
      checkReorder(current.map((lesson) => lesson.id), lessonIds);
      if (previousLessonIds) {
        const moved = current.filter((lesson, index) => lesson.status !== 'PUBLISHED' && lessonIds[index] !== lesson.id);
        if (moved.length > 0) {
          throw new BusinessRuleError('Only published lessons can be reordered here. Lessons that are not published must keep their place.', {
            code: 'ONLY_PUBLISHED_REORDERABLE',
            lessonIds: moved.map((lesson) => lesson.id),
          });
        }
      }
      if (lessonIds.some((id, index) => id !== current[index]?.id)) {
        await this.lessons.applyDirectPositions(courseId, lessonIds, positionsFor(lessonIds), manager);
      }
      return this.lessons.listDirectByCourse(courseId, manager);
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

function courseNotFound() {
  return new NotFoundError('Course not found');
}

const MAX_LINK_LABEL = 120;
const LEVEL_ORDER = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

/** A link label: plain text, trimmed; blank means "none" (the target's own title is used). */
function normaliseLinkLabel(label: string | null | undefined): string | null {
  if (label === null || label === undefined) return null;
  const text = label.trim();
  if (text === '') return null;
  if (text.length > MAX_LINK_LABEL) throw new BusinessRuleError(`A link label can be at most ${MAX_LINK_LABEL} characters`, { code: 'LINK_LABEL_TOO_LONG', max: MAX_LINK_LABEL });
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new BusinessRuleError('A link label must be plain text on one line', { code: 'LINK_LABEL_INVALID' });
  return text;
}

/** Link visibility: null/absent or all three levels = every level (stored as null); otherwise a canonical-order subset with at least one level. */
function normaliseLinkLevels(levels: readonly string[] | null | undefined): string[] | null {
  if (levels === null || levels === undefined) return null;
  const set = new Set(levels);
  for (const level of set) {
    if (!(LEVEL_ORDER as readonly string[]).includes(level)) throw new BusinessRuleError(`Unknown level "${level}"`, { code: 'LINK_LEVEL_INVALID' });
  }
  if (set.size === 0) throw new BusinessRuleError('Choose at least one level for the link, or show it at every level', { code: 'LINK_LEVELS_EMPTY' });
  if (set.size === LEVEL_ORDER.length) return null;
  return LEVEL_ORDER.filter((level) => set.has(level));
}
