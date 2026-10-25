import { Injectable } from '@nestjs/common';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import {
  type LessonNavigation,
  type PublishedCourseView,
  type PublishedHomeEntryCourses,
  type PublishedHomeEntryView,
  listedLessonIds,
  navigationFor,
  toCourseView,
  withLessonCovers,
} from '../domain/catalog-view.js';
import { PublicationRepository } from '../persistence/publication.repository.js';
import { type EnabledHomeEntry, PublishedCatalogRepository } from '../persistence/published-catalog.repository.js';

/** A related lesson as a learner may see it: only fields of its own ACTIVE published snapshot, never working data. */
/** The related lessons of one specific source publication: `publicationVersion` and `contentHash` name the lesson snapshot the list belongs to. */
export interface RelatedLessonsResult {
  publicationVersion: number;
  contentHash: string;
  lessons: RelatedLessonView[];
}

export interface RelatedLessonView {
  lessonId: string;
  /** The author's custom label for this link (frozen with the source publication), or null = show `title`. Only present for a target that is deliverable. */
  label: string | null;
  courseId: string | null;
  moduleId: string | null;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
  coverMediaId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const MAX_LINK_LABEL = 120;

interface FrozenLink {
  lessonId: string;
  label: string | null;
  /** null = shown at every level. A present but unreadable `levels` is kept as an empty list, which shows the link at NO level (fail closed). */
  levels: string[] | null;
}

/**
 * The links frozen into a source snapshot. New snapshots carry `relatedLinks` ({ lessonId, label?, levels? }); snapshots written before link labels
 * existed carry only `relatedLessonIds`, which read as links with no label and every level, exactly as before. Duplicates, the source itself and
 * malformed entries are dropped; at most 10 links; the author's order is kept.
 */
function frozenLinks(lesson: { relatedLessonIds?: unknown; relatedLinks?: unknown } | undefined, sourceId: string): FrozenLink[] {
  const out: FrozenLink[] = [];
  const seen = new Set<string>([sourceId.toLowerCase()]);
  const add = (id: unknown, label: unknown, levels: unknown) => {
    if (typeof id !== 'string' || !UUID.test(id)) return;
    const key = id.toLowerCase();
    if (seen.has(key) || out.length >= 10) return;
    seen.add(key);
    const cleanLabel = typeof label === 'string' && label.trim() !== '' && label.trim().length <= MAX_LINK_LABEL ? label.trim() : null;
    let cleanLevels: string[] | null = null;
    if (levels !== undefined && levels !== null) {
      cleanLevels = Array.isArray(levels) && levels.every((l) => typeof l === 'string' && LEVELS.includes(l)) ? (levels as string[]) : [];
    }
    out.push({ lessonId: key, label: cleanLabel, levels: cleanLevels });
  };
  if (Array.isArray(lesson?.relatedLinks)) {
    for (const raw of lesson.relatedLinks as unknown[]) {
      const link = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      add(link.lessonId, link.label, link.levels);
    }
  } else if (Array.isArray(lesson?.relatedLessonIds)) {
    for (const id of lesson.relatedLessonIds as unknown[]) add(id, undefined, undefined);
  }
  return out;
}

/**
 * What a learner may see of the catalog, from authoritative database state on every call: the ACTIVE catalog
 * snapshot of a course, filtered to the lessons that currently have an active lesson publication at the
 * requested level. Nothing is cached, nothing is read from a working copy, and no level falls back to another.
 * (The pure rules are in `domain/catalog-view.ts`.)
 */
@Injectable()
export class PublishedCatalogService {
  constructor(
    private readonly catalog: PublishedCatalogRepository,
    private readonly lessonPublications: PublicationRepository,
  ) {}

  /** Published courses with something to show at `level`, in the manual course order. */
  async listCourses(level: LearningLevel): Promise<PublishedCourseView[]> {
    const active = await this.catalog.listActive(level);
    const eligible = await this.lessonPublications.findEligibleLessonIds(
      level,
      [...new Set(active.flatMap((a) => listedLessonIds(a.content)))],
    );
    const covers = await this.lessonPublications.findActiveCovers(level, [...eligible]);
    return active.flatMap((a) => {
      const view = toCourseView(a.content, a.catalogVersion, eligible);
      return view ? [{ ...withLessonCovers(view, covers), book: a.book }] : [];
    });
  }

  /**
   * The Home Entries a learner at `level` may see, in the administrators' Home order. An entry is shown only if ALL of these hold right now: it is enabled, and at least one
   * course assigned to it is published and has a lesson deliverable at `level`. "Published and deliverable at the level" is decided by `listCourses` itself (the very same rules
   * and query as the course list, nothing is repeated here), so an entry vanishes by itself when its last eligible course is unpublished or has nothing at the level, and
   * returns by itself when one qualifies again. A draft or unpublished course is never in `listCourses`, so it can neither appear nor keep an entry alive. No entry qualifies ->
   * an empty list, never an error.
   */
  async listHomeEntries(level: LearningLevel): Promise<PublishedHomeEntryView[]> {
    const entries = await this.catalog.listEnabledHomeEntries();
    if (entries.length === 0) return [];
    const byEntry = await this.eligibleCoursesByEntry(level);
    return entries.flatMap((entry) => {
      const courses = byEntry.get(entry.id);
      return courses && courses.length > 0 ? [toHomeEntryView(entry, courses)] : [];
    });
  }

  /**
   * One Home Entry with the courses a learner at `level` can open in it, in the published course order (the course list's own order), or null when the entry is unknown,
   * disabled, or has no eligible course at that level. All of those are the same answer, so a caller cannot tell a disabled entry from a missing one or from one with only drafts.
   */
  async findHomeEntryCourses(entryId: string, level: LearningLevel): Promise<PublishedHomeEntryCourses | null> {
    const entry = await this.catalog.findEnabledHomeEntry(entryId);
    if (!entry) return null;
    const courses = (await this.eligibleCoursesByEntry(level)).get(entry.id);
    return courses && courses.length > 0 ? { entry: toHomeEntryView(entry, courses), courses } : null;
  }

  /** The card of one Home Entry as a learner at `level` may see it (for its picture), or null under the same conditions as `findHomeEntryCourses`. */
  async findHomeEntry(entryId: string, level: LearningLevel): Promise<PublishedHomeEntryView | null> {
    return (await this.findHomeEntryCourses(entryId, level))?.entry ?? null;
  }

  /** The eligible published courses at `level` grouped by the ENABLED Home Entry they belong to, each group in the course list's order. Courses with no (or a disabled) entry are left out. */
  private async eligibleCoursesByEntry(level: LearningLevel): Promise<Map<string, PublishedCourseView[]>> {
    const links = await this.catalog.listCourseEntryLinks();
    const grouped = new Map<string, PublishedCourseView[]>();
    if (links.size === 0) return grouped;
    for (const course of await this.listCourses(level)) {
      const entryId = links.get(course.courseId);
      if (entryId === undefined) continue;
      const list = grouped.get(entryId) ?? [];
      list.push(course);
      grouped.set(entryId, list);
    }
    return grouped;
  }

  /**
   * The related lessons of a published lesson, for one level, in the author's order. The links (ids, optional labels and level visibility) are the
   * ones FROZEN into the source lesson's active snapshot (working changes never alter them). A link is shown only if (a) the source is deliverable at
   * this level, (b) the frozen link permits this level (no `levels` = every level; the link's visibility is separate from the target's availability),
   * and (c) the target is deliverable (below). The custom label, if any, is returned only for a link that passes all three, so a label can never
   * reveal a hidden or unpublished target; without a label the target's own published title is used. A target is shown only if it is deliverable at this level right now: it has an
   * active lesson publication at the level AND is listed in an active catalog (the same rule as the lesson endpoint), and its title, cover etc.
   * come from that published snapshot. A target that is a draft, unpublished, withdrawn or deleted is simply left out: no placeholder, no title,
   * nothing about it. Null when the source lesson itself is not deliverable at this level. Targets are never published or recursed into.
   */
  async findRelated(lessonId: string, level: LearningLevel): Promise<RelatedLessonsResult | null> {
    const info = await this.lessonPublications.findActiveSnapshotInfo(lessonId, level);
    if (!info) return null;
    const snapshot = await this.lessonPublications.findActiveSnapshotContent(info.publicationId, level);
    if (!snapshot) return null;
    const lesson = snapshot.lesson as { relatedLessonIds?: unknown; relatedLinks?: unknown } | undefined;
    const links = frozenLinks(lesson, lessonId).filter((link) => link.levels === null || link.levels.includes(level));
    return { publicationVersion: info.publicationVersion, contentHash: info.contentHash, lessons: await this.resolveTargets(links, level) };
  }

  /**
   * The Continue Exploring block `blockId` of a deliverable lesson, for one level: the block's own links as FROZEN into the source lesson's active
   * snapshot (separate from the lesson-metadata related links; the two lists are never merged), filtered by the same three rules as related lessons
   * (source deliverable, link permits the level, target deliverable) and resolved only from published content. The result names the exact source
   * publication, so a client can refuse a list that belongs to another version. Null when the lesson is not deliverable at this level or the block
   * is not in that snapshot (it may be hidden at this level or not published yet).
   */
  async findExploring(lessonId: string, blockId: string, level: LearningLevel): Promise<(RelatedLessonsResult & { blockId: string }) | null> {
    const info = await this.lessonPublications.findActiveSnapshotInfo(lessonId, level);
    if (!info) return null;
    const snapshot = await this.lessonPublications.findActiveSnapshotContent(info.publicationId, level);
    const blocks = (snapshot as { blocks?: unknown } | null)?.blocks;
    if (!Array.isArray(blocks)) return null;
    const block = blocks.find((b): b is { blockId: string; type: string; content: Record<string, unknown> } => typeof b === 'object' && b !== null && (b as { blockId?: unknown }).blockId === blockId && (b as { type?: unknown }).type === 'CONTINUE_EXPLORING');
    if (!block || typeof block.content !== 'object' || block.content === null) return null;
    // Same cleaning as the metadata links: a link has { lessonId, label?, levels? }; unusable entries, duplicates and the source itself are dropped.
    const links = frozenLinks({ relatedLinks: block.content.links }, lessonId).filter((link) => link.levels === null || link.levels.includes(level));
    return { blockId, publicationVersion: info.publicationVersion, contentHash: info.contentHash, lessons: await this.resolveTargets(links, level) };
  }

  /**
   * Turns frozen links into what a learner may see: only targets that are deliverable at `level` right now (an active lesson publication at the level
   * AND listed in its course's active catalog, the same rule as the lesson endpoint). A draft, unpublished, withdrawn or deleted target is left out
   * entirely, together with its label, so a label can never reveal it. Title, cover etc. come from the target's own published snapshot. Targets are
   * never published or recursed into.
   */
  private async resolveTargets(links: FrozenLink[], level: LearningLevel): Promise<RelatedLessonView[]> {
    return (await this.classifyTargets(links, level)).flatMap((r) => (r.view ? [r.view] : []));
  }

  /**
   * The author's WORKING Continue Exploring selection as a learner at `level` would meet it, for the admin preview (nothing here is published, stored or
   * changed). Each link, in the author's order, is either a learner card or an omission with the reason; omissions carry only the lesson id, the author's
   * own label and the reason, never a target's draft metadata. The same rules as published delivery are applied (link level, target active publication
   * at the level, target in its course's active catalog); whether the target still exists is the caller's input (`missing`).
   */
  async previewWorkingLinks(
    rawLinks: unknown,
    sourceId: string,
    level: LearningLevel,
    missing: ReadonlySet<string>,
  ): Promise<{ cards: RelatedLessonView[]; omitted: { lessonId: string; label: string | null; reason: string }[] }> {
    const links = frozenLinks({ relatedLinks: rawLinks }, sourceId);
    const permitted: FrozenLink[] = [];
    const omitted: { lessonId: string; label: string | null; reason: string }[] = [];
    for (const link of links) {
      if (missing.has(link.lessonId)) omitted.push({ lessonId: link.lessonId, label: link.label, reason: 'LESSON_DELETED' });
      else if (link.levels !== null && !link.levels.includes(level)) omitted.push({ lessonId: link.lessonId, label: link.label, reason: 'LINK_HIDDEN_AT_LEVEL' });
      else permitted.push(link);
    }
    const cards: RelatedLessonView[] = [];
    for (const r of await this.classifyTargets(permitted, level)) {
      if (r.view) cards.push(r.view);
      else omitted.push({ lessonId: r.link.lessonId, label: r.link.label, reason: r.reason ?? 'NOT_AVAILABLE' });
    }
    return { cards, omitted };
  }

  private async classifyTargets(links: FrozenLink[], level: LearningLevel): Promise<{ link: FrozenLink; view?: RelatedLessonView; reason?: string }[]> {
    const out: { link: FrozenLink; view?: RelatedLessonView; reason?: string }[] = [];
    for (const link of links) {
      const id = link.lessonId;
      const targetInfo = await this.lessonPublications.findActiveSnapshotInfo(id, level);
      if (!targetInfo) {
        out.push({ link, reason: 'NOT_PUBLISHED_AT_LEVEL' });
        continue;
      }
      if (!(await this.catalog.findForLesson(id, level))) {
        out.push({ link, reason: 'NOT_IN_PUBLISHED_CATALOG' });
        continue;
      }
      const target = await this.lessonPublications.findActiveSnapshotContent(targetInfo.publicationId, level);
      const fields = target?.lesson as Record<string, unknown> | undefined;
      const title = text(fields?.title);
      if (!fields || !title) {
        out.push({ link, reason: 'NOT_AVAILABLE' });
        continue;
      }
      out.push({
        link,
        view: {
          lessonId: id,
          label: link.label,
          courseId: text(fields.courseId),
          moduleId: text(fields.moduleId),
          title,
          shortTitle: text(fields.shortTitle),
          subtitle: text(fields.subtitle),
          estimatedMinutes: typeof fields.estimatedMinutes === 'number' ? fields.estimatedMinutes : null,
          coverMediaId: text(fields.coverMediaId),
        },
      });
    }
    return out;
  }

  async findCourse(
    courseId: string,
    level: LearningLevel,
  ): Promise<PublishedCourseView | null> {
    const active = await this.catalog.findActive(courseId, level);
    if (!active) return null;
    const eligible = await this.lessonPublications.findEligibleLessonIds(
      level,
      listedLessonIds(active.content),
    );
    const view = toCourseView(active.content, active.catalogVersion, eligible);
    if (!view) return null;
    return { ...withLessonCovers(view, await this.lessonPublications.findActiveCovers(level, [...eligible])), book: active.book };
  }

  /**
   * Previous and next eligible lesson of a lesson that is itself deliverable at `level` (active lesson
   * publication, module and course published) and listed in its course's active catalog. Null otherwise.
   */
  async findNavigation(
    lessonId: string,
    level: LearningLevel,
  ): Promise<LessonNavigation | null> {
    const found = await this.catalog.findForLesson(lessonId, level);
    if (!found) return null;
    const eligible = await this.lessonPublications.findEligibleLessonIds(
      level,
      listedLessonIds(found.content),
    );
    return navigationFor(
      found.content,
      found.catalogVersion,
      lessonId.toLowerCase(),
      eligible,
    );
  }
}

function toHomeEntryView(entry: EnabledHomeEntry, courses: readonly PublishedCourseView[]): PublishedHomeEntryView {
  const covered = courses.find((course) => course.coverMediaId);
  return {
    entryId: entry.id,
    title: entry.title,
    description: entry.description,
    sortOrder: entry.position,
    imageMediaId: entry.imageMediaId,
    courseCount: courses.length,
    lessonCount: courses.reduce((total, course) => total + course.lessonCount, 0),
    coverCourseId: covered ? covered.courseId : null,
    coverMediaId: covered ? covered.coverMediaId : null,
  };
}
