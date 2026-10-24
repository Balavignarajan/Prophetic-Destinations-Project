import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TransactionRunner } from '../../../database/transaction-runner.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared-kernel/index.js';
import { MediaFacade } from '../../media/index.js';
import { QuizzesFacade } from '../../quizzes/index.js';
import { MAX_BLOCKS_PER_LESSON } from '../domain/blocks/block-content.js';
import { BlockTypeRegistry } from '../domain/blocks/registry.js';
import { type DraftRevisionSummary, type DraftSnapshot, DRAFT_SNAPSHOT_SCHEMA, readSnapshot } from '../domain/lesson-revisions.js';
import {
  checkCoverMediaId,
  checkEstimatedMinutes,
  checkOptionalText,
  checkTags,
  checkTitle,
} from '../domain/lesson-rules.js';
import type { Lesson } from '../domain/models.js';
import { LessonBlockLevelRepository, groupByBlock } from '../persistence/lesson-block-level.repository.js';
import { LessonBlockRepository } from '../persistence/lesson-block.repository.js';
import { LessonDraftRevisionRepository } from '../persistence/lesson-draft-revision.repository.js';
import { LessonRelatedRepository } from '../persistence/lesson-related.repository.js';
import { LessonRepository } from '../persistence/lesson.repository.js';

/** How many revisions the history lists at most. Only the LIST is bounded: every stored revision is kept, and each stays restorable by id. */
export const REVISION_LIST_LIMIT = 100;

export interface RevisionHistory {
  /** Where the lesson stands now: the state a restore would replace. */
  current: { contentRevision: number; status: string; updatedAt: Date };
  items: DraftRevisionSummary[];
  /** Every stored revision of the lesson (can exceed what is listed). */
  total: number;
}

export interface RestoreResult {
  lesson: Lesson;
  /** The revision that was restored. */
  restoredFromRevision: number;
  /** The revision under which the draft that was replaced is kept, so the restore can be undone. */
  keptRevision: number;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Draft revisions of a lesson (CMS-029): taking them, listing them and restoring one.
 *
 * TAKING. `ensureCaptured` is called by every operation that edits a lesson (LessonService, BlockService, BlockLevelService), inside its transaction, right after it has
 * locked the lesson and BEFORE it changes anything. It stores the lesson's whole editable state under the current `content_revision` unless that revision already has a copy.
 * So each persisted save yields exactly one revision, a state is stored before anything replaces it, and the state the lesson is in now is the live draft (it is stored the
 * moment the next edit begins). History therefore starts with the first edit made after this was introduced.
 *
 * RESTORING. `restore` makes an earlier revision the CURRENT editable draft, in one transaction under the lesson's row lock:
 *  - the caller must name the content revision they were looking at; if the lesson moved on since, nothing happens (409);
 *  - the state being replaced is stored first (so a restore is itself undone by restoring that revision);
 *  - the restored content is checked as a whole before anything is written: block types and shapes, own versions, images and quizzes that must still exist, lessons that are
 *    linked to; if anything is wrong the restore is refused with the full list and nothing changes;
 *  - blocks, their level settings, the lesson's fields and levels, tags and related links are replaced; restored blocks KEEP their ids (a published lesson's reading anchors, quiz
 *    results and previews are keyed by them, and the old rows are gone in the same transaction) with a block version higher than any seen, so a stale editor cannot overwrite them;
 *  - the lesson returns to Draft, and the restored state is stored as its own revision, marked as a restore.
 * Published lessons and snapshots are never read or written: a published lesson keeps serving learners until it is republished through the normal workflow, and a restore never
 * publishes anything. Learner progress and quiz attempts are not part of a revision and are untouched.
 */
@Injectable()
export class LessonRevisionService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly blocks: LessonBlockRepository,
    private readonly blockLevels: LessonBlockLevelRepository,
    private readonly related: LessonRelatedRepository,
    private readonly revisions: LessonDraftRevisionRepository,
    private readonly registry: BlockTypeRegistry,
    private readonly media: MediaFacade,
    private readonly quizzes: QuizzesFacade,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Stores the lesson's current editable state as its revision, unless that revision already has a copy. The caller holds the lesson's row lock and has changed nothing yet. */
  async ensureCaptured(lesson: Lesson, manager: EntityManager): Promise<void> {
    if (await this.revisions.exists(lesson.id, lesson.contentRevision, manager)) return;
    const snapshot = await this.readState(lesson, manager);
    await this.revisions.insert({ lessonId: lesson.id, contentRevision: lesson.contentRevision, savedAt: lesson.updatedAt, snapshot }, manager);
  }

  async history(lessonId: string): Promise<RevisionHistory> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson) throw new NotFoundError('Lesson not found');
    const { items, total } = await this.revisions.list(lessonId, REVISION_LIST_LIMIT);
    return { current: { contentRevision: lesson.contentRevision, status: lesson.status, updatedAt: lesson.updatedAt }, items, total };
  }

  async restore(actorId: string, lessonId: string, revisionId: string, expectedContentRevision: number): Promise<RestoreResult> {
    return this.transactions.run(async (manager) => {
      const lesson = await this.lessons.findByIdForUpdate(lessonId, manager);
      if (!lesson) throw new NotFoundError('Lesson not found');
      if (lesson.contentRevision !== expectedContentRevision) {
        throw new ConflictError('This lesson was changed after you opened the draft history. Nothing was restored. Reload the lesson and open the history again.', {
          code: 'REVISION_STALE',
          currentContentRevision: lesson.contentRevision,
        });
      }
      const stored = await this.revisions.find(revisionId, manager);
      if (!stored || stored.lessonId !== lessonId) throw new NotFoundError('Draft revision not found');
      if (stored.contentRevision === lesson.contentRevision) {
        throw new BusinessRuleError('This is already the current draft, so there is nothing to restore.', { code: 'REVISION_IS_CURRENT' });
      }
      const snapshot = readSnapshot(stored.snapshot);
      if (!snapshot) {
        throw new BusinessRuleError('This revision was saved in a format that this version of the CMS cannot restore.', { code: 'REVISION_NOT_RESTORABLE', problems: ['The stored copy is unreadable.'] });
      }

      // The draft being replaced is kept first: restoring THAT revision undoes this restore.
      await this.ensureCaptured(lesson, manager);

      const checked = await this.check(snapshot, lessonId, manager);
      if (checked.problems.length > 0) {
        throw new BusinessRuleError('This draft cannot be restored as it is, so nothing was changed. See the reasons listed.', {
          code: 'REVISION_NOT_RESTORABLE',
          problems: checked.problems,
        });
      }

      const keptVersions = new Map((await this.blocks.listByLesson(lessonId, manager)).map((block) => [block.id, block.version]));
      await this.replaceDraft(lessonId, snapshot, checked.blocks, keptVersions, manager);
      const updated = await this.lessons.update(lessonId, { ...checked.fields, status: 'DRAFT' }, manager);

      // The restored state is stored under its own revision, marked as a restore, read back from what was actually written.
      await this.revisions.insert(
        {
          lessonId,
          contentRevision: updated.contentRevision,
          savedAt: updated.updatedAt,
          snapshot: await this.readState(updated, manager),
          restoredFromRevision: stored.contentRevision,
          restoredBy: actorId,
        },
        manager,
      );
      return { lesson: updated, restoredFromRevision: stored.contentRevision, keptRevision: lesson.contentRevision };
    });
  }

  /** The lesson's whole editable state, as stored in the database right now. */
  private async readState(lesson: Lesson, manager: EntityManager): Promise<DraftSnapshot> {
    const blocks = await this.blocks.listByLesson(lesson.id, manager);
    const rows = groupByBlock(await this.blockLevels.listByLesson(lesson.id, manager));
    const links = await this.related.listLinks(lesson.id, manager);
    return {
      schema: DRAFT_SNAPSHOT_SCHEMA,
      lesson: {
        title: lesson.title,
        shortTitle: lesson.shortTitle,
        subtitle: lesson.subtitle,
        introduction: lesson.introduction,
        estimatedMinutes: lesson.estimatedMinutes,
        coverMediaId: lesson.coverMediaId,
        tags: [...lesson.tags],
      },
      levels: [...lesson.levels],
      blocks: blocks.map((block) => ({
        id: block.id,
        type: block.type,
        position: block.position,
        version: block.version,
        sharedContent: block.sharedContent,
        levels: (rows.get(block.id) ?? []).map(({ level, content }) => ({ level, content })),
      })),
      related: links.map((link) => ({ lessonId: link.lessonId, label: link.label, levels: link.levels })),
    };
  }

  /**
   * Everything the restore depends on, checked before anything is written. Returns EVERY problem found (not only the first), plus the checked lesson fields and the blocks
   * in their final order. Takes share locks (never waits) on the quizzes and lessons the draft refers to, so none can be deleted before this transaction ends.
   */
  private async check(
    snapshot: DraftSnapshot,
    lessonId: string,
    manager: EntityManager,
  ): Promise<{ problems: string[]; fields: { title: string; shortTitle: string | null; subtitle: string | null; introduction: string | null; estimatedMinutes: number | null; coverMediaId: string | null; tags: string[] }; blocks: DraftSnapshot['blocks'] }> {
    const problems: string[] = [];
    const l = snapshot.lesson;

    let fields = { title: l.title, shortTitle: l.shortTitle, subtitle: l.subtitle, introduction: l.introduction, estimatedMinutes: l.estimatedMinutes, coverMediaId: l.coverMediaId, tags: l.tags };
    try {
      fields = {
        title: checkTitle(l.title),
        shortTitle: checkOptionalText(l.shortTitle, 'shortTitle'),
        subtitle: checkOptionalText(l.subtitle, 'subtitle'),
        introduction: checkOptionalText(l.introduction, 'introduction'),
        estimatedMinutes: checkEstimatedMinutes(l.estimatedMinutes),
        coverMediaId: checkCoverMediaId(l.coverMediaId),
        tags: checkTags(l.tags),
      };
    } catch (error) {
      if (!(error instanceof BusinessRuleError)) throw error;
      problems.push(`Lesson details: ${error.message}.`);
    }
    if (fields.coverMediaId) {
      const cover = await this.media.find(fields.coverMediaId);
      if (!cover) problems.push('The lesson cover image no longer exists in the Media Library.');
      else if (!cover.contentType.startsWith('image/')) problems.push('The lesson cover is no longer an image.');
    }

    const blocks = [...snapshot.blocks].sort((a, b) => a.position - b.position).map((block, index) => ({ ...block, position: index + 1 }));
    if (blocks.length > MAX_BLOCKS_PER_LESSON) problems.push(`A lesson can have at most ${MAX_BLOCKS_PER_LESSON} blocks.`);
    if (new Set(blocks.map((block) => block.id)).size !== blocks.length) problems.push('The draft lists the same block twice.');

    const mediaUses = new Map<string, number[]>();
    const quizUses = new Map<string, number[]>();
    const linkTargets = new Map<string, number[]>();
    const use = (map: Map<string, number[]>, id: string, number: number) => map.set(id, [...(map.get(id) ?? []), number]);

    blocks.forEach((block, index) => {
      const number = index + 1;
      const definition = this.registry.get(block.type);
      if (!definition) {
        problems.push(`Block ${number}: its type is no longer available.`);
        return;
      }
      const contents: { label: string; content: Record<string, unknown> }[] = [];
      if (block.sharedContent !== null) contents.push({ label: 'its content', content: block.sharedContent });
      const seen = new Set<string>();
      for (const row of block.levels) {
        if (seen.has(row.level)) problems.push(`Block ${number}: it lists the ${row.level} level twice.`);
        seen.add(row.level);
        if (!snapshot.levels.includes(row.level)) problems.push(`Block ${number}: it is visible at the ${row.level} level, which the lesson is not available at.`);
        if (row.content !== null) {
          if (definition.variants !== 'SUPPORTED') problems.push(`Block ${number}: it has its own ${row.level} version, which this kind of block no longer supports.`);
          else contents.push({ label: `its ${row.level} version`, content: row.content });
        }
      }
      for (const { label, content } of contents) {
        for (const problem of definition.validateShape(content)) problems.push(`Block ${number}, ${label}: ${problem.message}`);
        for (const reference of definition.extractReferences(content)) {
          if (reference.kind === 'MEDIA') use(mediaUses, reference.targetId, number);
          else if (reference.kind === 'QUIZ') use(quizUses, reference.targetId, number);
        }
      }
      if (block.type === 'CONTINUE_EXPLORING' && block.sharedContent !== null && Array.isArray(block.sharedContent.links)) {
        for (const link of block.sharedContent.links as unknown[]) {
          if (isObject(link) && typeof link.lessonId === 'string') use(linkTargets, link.lessonId.toLowerCase(), number);
        }
      }
    });

    for (const [mediaId, numbers] of mediaUses) {
      if (!(await this.media.find(mediaId))) problems.push(`${blockList(numbers)}: an image or file it uses no longer exists in the Media Library.`);
    }
    for (const [quizId, numbers] of quizUses) {
      if ((await this.quizzes.lockForReference(quizId, manager)) === null) problems.push(`${blockList(numbers)}: the quiz it uses no longer exists.`);
    }

    // Lessons that are linked to (by a Continue Exploring block, or the related-lessons list) must still exist and must not be this lesson.
    const related = snapshot.related.map((link) => link.lessonId.toLowerCase());
    const wanted = [...new Set([...linkTargets.keys(), ...related])];
    const existing = await this.related.existingLocked(wanted.filter((id) => id !== lessonId.toLowerCase()), manager);
    for (const [target, numbers] of linkTargets) {
      if (target === lessonId.toLowerCase()) problems.push(`${blockList(numbers)}: it links to this lesson itself.`);
      else if (!existing.has(target)) problems.push(`${blockList(numbers)}: a lesson it links to no longer exists.`);
    }
    for (const target of related) {
      if (target === lessonId.toLowerCase()) problems.push('The related lessons list includes this lesson itself.');
      else if (!existing.has(target)) problems.push('The related lessons list includes a lesson that no longer exists.');
    }

    // A restored block keeps its id, so that id must not belong to any other lesson.
    if (blocks.length > 0) {
      const taken: { id: string }[] = await manager.query(`SELECT "id" FROM "lesson_blocks" WHERE "id" = ANY($1::uuid[]) AND "lesson_id" <> $2`, [blocks.map((block) => block.id), lessonId]);
      if (taken.length > 0) problems.push('A block of this draft has an identity that now belongs to another lesson, so it cannot be restored here.');
    }

    return { problems, fields, blocks };
  }

  /** Replaces the lesson's blocks, level settings, levels and related links with the checked draft. Runs inside `restore`'s transaction. */
  private async replaceDraft(
    lessonId: string,
    snapshot: DraftSnapshot,
    blocks: DraftSnapshot['blocks'],
    keptVersions: ReadonlyMap<string, number>,
    manager: EntityManager,
  ): Promise<void> {
    // Level settings reference both the block and the lesson's levels, so they go first and come back last.
    await manager.query(`DELETE FROM "lesson_block_levels" WHERE "lesson_id" = $1`, [lessonId]);
    await manager.query(`DELETE FROM "lesson_blocks" WHERE "lesson_id" = $1`, [lessonId]);
    await this.lessons.replaceLevels(lessonId, snapshot.levels, manager);

    if (blocks.length > 0) {
      await manager.query(
        `INSERT INTO "lesson_blocks" ("id", "lesson_id", "type", "position", "shared_content", "version")
         SELECT v."id", $1::uuid, v."type", v."position", v."content"::jsonb, v."version"
           FROM unnest($2::uuid[], $3::text[], $4::int[], $5::text[], $6::int[]) AS v("id", "type", "position", "content", "version")`,
        [
          lessonId,
          blocks.map((block) => block.id),
          blocks.map((block) => block.type),
          blocks.map((block) => block.position),
          blocks.map((block) => (block.sharedContent === null ? null : JSON.stringify(block.sharedContent))),
          // Higher than the stored copy and than the row it replaces, so an editor still holding the old version number is refused (409), never silently accepted.
          blocks.map((block) => Math.max(block.version, keptVersions.get(block.id) ?? 0) + 1),
        ],
      );
    }
    const settings = blocks.flatMap((block) => block.levels.map((row) => ({ blockId: block.id, level: row.level, content: row.content })));
    if (settings.length > 0) {
      await manager.query(
        `INSERT INTO "lesson_block_levels" ("block_id", "lesson_id", "level", "content")
         SELECT v."block_id", $1::uuid, v."level", v."content"::jsonb
           FROM unnest($2::uuid[], $3::text[], $4::text[]) AS v("block_id", "level", "content")`,
        [lessonId, settings.map((row) => row.blockId), settings.map((row) => row.level), settings.map((row) => (row.content === null ? null : JSON.stringify(row.content)))],
      );
    }
    await this.related.replace(lessonId, snapshot.related, manager);
  }
}

/** "Block 3" or "Blocks 2, 5". */
function blockList(numbers: readonly number[]): string {
  const unique = [...new Set(numbers)];
  return unique.length === 1 ? `Block ${unique[0]}` : `Blocks ${unique.join(', ')}`;
}
