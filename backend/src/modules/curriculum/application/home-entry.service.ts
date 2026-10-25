import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { MediaFacade } from '../../media/index.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  checkExpectedVersion,
  checkReorder,
  positionsFor,
  resolveInsertPosition,
} from '../../../shared-kernel/index.js';
import { checkHomeEntryTitle, checkReference, normalizeHomeEntryDescription } from '../domain/home-entry-rules.js';
import type { HomeEntry } from '../domain/models.js';
import { HomeEntryRepository } from '../persistence/home-entry.repository.js';

export interface CreateHomeEntryInput {
  title: string;
  description?: string | null;
  /** A media-library image id for the card, or null/omitted for none (the app then shows the cover of the first published course). */
  imageMediaId?: string | null;
  /** Defaults to enabled. */
  isEnabled?: boolean;
  /** 1-based place on Home; omitted = at the end. */
  position?: number;
}

export interface UpdateHomeEntryInput {
  title?: string;
  /** null clears the description. */
  description?: string | null;
  /** undefined = leave alone, null = no card image (the image itself is never deleted). */
  imageMediaId?: string | null;
  isEnabled?: boolean;
  /** The version the editor last saw; a mismatch means a conflicting edit. */
  version?: number;
}

/** What `MediaFacade.requireImage` says when the picture of a Home Entry is missing or is not an image. */
const IMAGE_SUBJECT = {
  field: 'imageMediaId',
  missing: 'The selected Home Entry image no longer exists. Choose another image.',
  notImage: 'The selected Home Entry image is not an image',
};

const DUPLICATE_MESSAGE = 'There is already a Home Entry with this title. Choose a different title, or edit the existing entry.';

/**
 * The topics of the learner Home screen, managed in the Admin CMS. An entry holds NO course of its own: courses join it from the course form (`courses.home_entry_id`), so an
 * entry can exist with none, and deleting an entry only takes its courses out of it (they, their lessons, the image and learner progress are untouched). What a learner actually
 * sees is decided at read time by the public catalog (enabled, and at least one assigned course published with lessons at the learner's level), so this service never has to know about
 * publishing.
 */
@Injectable()
export class HomeEntryService {
  constructor(
    private readonly entries: HomeEntryRepository,
    private readonly transactions: TransactionRunner,
    private readonly media: MediaFacade,
  ) {}

  async create(input: CreateHomeEntryInput): Promise<HomeEntry> {
    const title = checkHomeEntryTitle(input.title);
    const description = normalizeHomeEntryDescription(input.description);
    const imageMediaId = input.imageMediaId ? checkReference(input.imageMediaId, 'imageMediaId') : null;
    if (imageMediaId) await this.media.requireImage(imageMediaId, IMAGE_SUBJECT);

    return this.transactions.run(async (manager) => {
      await this.entries.lockOrdering(manager);
      await this.requireFreeTitle(title, null, manager);
      const existing = await this.entries.listIds(manager);
      const position = resolveInsertPosition(input.position, existing.length);
      // Created at the end, then moved into place: the whole list is renumbered in the same transaction, so positions stay 1..n with no gaps and no duplicates.
      const created = await this.entries.create(
        { title, description, imageMediaId, isEnabled: input.isEnabled ?? true, position: existing.length + 1 },
        manager,
      );
      if (position === existing.length + 1) return created;
      const order = [...existing];
      order.splice(position - 1, 0, created.id);
      await this.entries.applyPositions(order, positionsFor(order), manager);
      return (await this.entries.findById(created.id, manager)) ?? created;
    });
  }

  /** Every entry in the Home order, enabled or not, each with its assigned courses. There is no cap on the number of entries, so the list is not paged. */
  list(): Promise<HomeEntry[]> {
    return this.entries.listAll();
  }

  async get(id: string): Promise<HomeEntry> {
    const entry = await this.entries.findById(id);
    if (!entry) throw entryNotFound();
    return entry;
  }

  async update(id: string, input: UpdateHomeEntryInput): Promise<HomeEntry> {
    const title = input.title !== undefined ? checkHomeEntryTitle(input.title) : undefined;
    const description = input.description !== undefined ? normalizeHomeEntryDescription(input.description) : undefined;
    const imageMediaId = input.imageMediaId === undefined ? undefined : input.imageMediaId === null ? null : checkReference(input.imageMediaId, 'imageMediaId');
    if (title === undefined && description === undefined && imageMediaId === undefined && input.isEnabled === undefined) {
      throw new BusinessRuleError('Nothing to update');
    }

    return this.transactions.run(async (manager) => {
      // A rename takes the same lock as create and delete BEFORE the row lock (the order they use), so two concurrent renames cannot both pass the title check.
      if (title !== undefined) await this.entries.lockOrdering(manager);
      const current = await this.entries.findByIdForUpdate(id, manager);
      if (!current) throw entryNotFound();
      checkExpectedVersion(current.version, input.version);
      if (title !== undefined && title.toLowerCase() !== current.title.trim().toLowerCase()) await this.requireFreeTitle(title, id, manager);
      // Only a NEW image is checked: keeping the current one never needs it to be re-validated.
      if (imageMediaId && imageMediaId !== current.imageMediaId) await this.media.requireImage(imageMediaId, IMAGE_SUBJECT);

      return this.entries.update(
        id,
        {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(imageMediaId !== undefined ? { imageMediaId } : {}),
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
        },
        manager,
      );
    });
  }

  /**
   * Sets the order of ALL entries. `entryIds` must list each entry exactly once and `previousEntryIds` must be the order the editor last saw: if anyone reordered, added or
   * deleted an entry since, it is refused (409) and nothing changes. Not a content edit: versions are untouched. Learners get the new order on their next refresh.
   */
  async reorder(entryIds: readonly string[], previousEntryIds: readonly string[]): Promise<HomeEntry[]> {
    return this.transactions.run(async (manager) => {
      await this.entries.lockOrdering(manager);
      const currentIds = await this.entries.listIds(manager);
      const unchanged = currentIds.length === previousEntryIds.length && currentIds.every((entryId, index) => entryId === previousEntryIds[index]);
      if (!unchanged) {
        throw new ConflictError('The Home Entry order was changed by someone else. Reload the list and try again.');
      }
      checkReorder(currentIds, entryIds);
      await this.entries.applyPositions(entryIds, positionsFor(entryIds), manager);
      return this.entries.listAll(manager);
    });
  }

  /**
   * Deletes the entry. In ONE transaction its courses are first taken out of it (they become ordinary courses, their status, version, publication, lessons and progress untouched),
   * then the entry is removed and the rest are renumbered 1..n. Nothing else is deleted: not a course, a lesson, an image or any learner data.
   */
  async delete(id: string): Promise<void> {
    await this.transactions.run(async (manager) => {
      await this.entries.lockOrdering(manager);
      const entry = await this.entries.findByIdForUpdate(id, manager);
      if (!entry) throw entryNotFound();
      await this.entries.unassignCourses(id, manager);
      await this.entries.delete(id, manager);
      const rest = await this.entries.listIds(manager);
      await this.entries.applyPositions(rest, positionsFor(rest), manager);
    });
  }

  /** Titles are unique ignoring case and spaces: the course forms choose an entry by its title, so two identical names could not be told apart. */
  private async requireFreeTitle(title: string, exceptId: string | null, manager: EntityManager): Promise<void> {
    if (await this.entries.titleTaken(title, exceptId, manager)) {
      throw new ConflictError(DUPLICATE_MESSAGE, { code: 'HOME_ENTRY_DUPLICATE', field: 'title' });
    }
  }
}

function entryNotFound() {
  return new NotFoundError('Home Entry not found');
}
