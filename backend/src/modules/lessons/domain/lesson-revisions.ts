import { LEARNING_LEVELS, type LearningLevel, isLearningLevel } from '../../../shared-kernel/index.js';
import type { BlockType } from './blocks/block-types.js';
import { isBlockType } from './blocks/block-types.js';

/**
 * Draft revisions (CMS-029): complete, restorable copies of a lesson's EDITABLE state. Pure rules and types; no database, no HTTP.
 *
 * WHAT A REVISION IS. A lesson's `content_revision` counts every effective change to its authoring content. A revision is the whole editable state of the lesson as it
 * was at one value of that counter: the lesson's own fields (with tags), the levels it is available at, every block with its id, type, place, shared content and the
 * level settings with their own versions, and the related-lesson links. It is taken ONCE per value, just before the first change that would replace that state (see
 * LessonRevisionService.ensureCaptured), so one persisted save is one revision and nothing is stored per keystroke.
 *
 * WHAT IT IS NOT. It is not a published snapshot (those are immutable records of what learners get and are never read or written here), and it holds no learner
 * progress, quiz attempt or reading position: none of those is lesson content.
 */

export const DRAFT_SNAPSHOT_SCHEMA = 1;

export interface SnapshotLesson {
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  estimatedMinutes: number | null;
  coverMediaId: string | null;
  tags: string[];
}

export interface SnapshotBlockLevel {
  level: LearningLevel;
  /** That level's own version, or null = the level uses the block's shared content. */
  content: Record<string, unknown> | null;
}

export interface SnapshotBlock {
  /** The block's own id: a restored block keeps it (see LessonRevisionService.restore). */
  id: string;
  type: BlockType;
  /** 1-based place in the lesson. */
  position: number;
  /** The block's version when the state was taken (a restored block always gets a higher one). */
  version: number;
  sharedContent: Record<string, unknown> | null;
  levels: SnapshotBlockLevel[];
}

export interface SnapshotRelatedLink {
  lessonId: string;
  label: string | null;
  levels: string[] | null;
}

export interface DraftSnapshot {
  schema: typeof DRAFT_SNAPSHOT_SCHEMA;
  lesson: SnapshotLesson;
  /** The levels the lesson is available at. */
  levels: LearningLevel[];
  /** In lesson order. */
  blocks: SnapshotBlock[];
  related: SnapshotRelatedLink[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const textOrNull = (value: unknown): string | null | undefined => (value === null ? null : isText(value) ? value : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads a stored snapshot. Strict: anything that does not have exactly the expected shape (an older or damaged value) gives null, and the revision is then listed as
 * not restorable. Nothing is repaired or guessed, because a restore writes this back as the lesson.
 */
export function readSnapshot(raw: unknown): DraftSnapshot | null {
  if (!isObject(raw) || raw.schema !== DRAFT_SNAPSHOT_SCHEMA || !isObject(raw.lesson) || !Array.isArray(raw.levels) || !Array.isArray(raw.blocks) || !Array.isArray(raw.related)) return null;

  const l = raw.lesson;
  const shortTitle = textOrNull(l.shortTitle);
  const subtitle = textOrNull(l.subtitle);
  const introduction = textOrNull(l.introduction);
  const coverMediaId = textOrNull(l.coverMediaId);
  const minutes = l.estimatedMinutes;
  if (!isText(l.title) || shortTitle === undefined || subtitle === undefined || introduction === undefined || coverMediaId === undefined) return null;
  if (!(minutes === null || (typeof minutes === 'number' && Number.isInteger(minutes)))) return null;
  if (!Array.isArray(l.tags) || !l.tags.every(isText)) return null;

  if (!raw.levels.every(isLearningLevel)) return null;
  const levels = LEARNING_LEVELS.filter((level) => (raw.levels as unknown[]).includes(level));

  const blocks: SnapshotBlock[] = [];
  for (const entry of raw.blocks) {
    if (!isObject(entry) || !isText(entry.id) || !UUID.test(entry.id) || !isBlockType(entry.type)) return null;
    if (!Number.isInteger(entry.position) || !Number.isInteger(entry.version) || !Array.isArray(entry.levels)) return null;
    if (!(entry.sharedContent === null || isObject(entry.sharedContent))) return null;
    const blockLevels: SnapshotBlockLevel[] = [];
    for (const row of entry.levels) {
      if (!isObject(row) || !isLearningLevel(row.level) || !(row.content === null || isObject(row.content))) return null;
      blockLevels.push({ level: row.level, content: row.content as Record<string, unknown> | null });
    }
    blocks.push({
      id: entry.id.toLowerCase(),
      type: entry.type,
      position: entry.position as number,
      version: entry.version as number,
      sharedContent: entry.sharedContent as Record<string, unknown> | null,
      levels: blockLevels,
    });
  }

  const related: SnapshotRelatedLink[] = [];
  for (const link of raw.related) {
    if (!isObject(link) || !isText(link.lessonId) || !UUID.test(link.lessonId)) return null;
    const label = textOrNull(link.label);
    if (label === undefined) return null;
    if (!(link.levels === null || (Array.isArray(link.levels) && link.levels.every(isText)))) return null;
    related.push({ lessonId: link.lessonId.toLowerCase(), label, levels: link.levels as string[] | null });
  }

  return {
    schema: DRAFT_SNAPSHOT_SCHEMA,
    lesson: {
      title: l.title,
      shortTitle,
      subtitle,
      introduction,
      estimatedMinutes: minutes as number | null,
      coverMediaId,
      tags: l.tags as string[],
    },
    levels,
    blocks,
    related,
  };
}

/** One revision as the history lists it: no content, only what identifies it. */
export interface DraftRevisionSummary {
  id: string;
  /** The lesson's `content_revision` at that state. */
  contentRevision: number;
  /** When that state was last changed (the lesson's own updated time when it was taken). */
  savedAt: Date;
  /** When this copy was stored. */
  capturedAt: Date;
  title: string;
  blockCount: number;
  levels: LearningLevel[];
  tags: string[];
  /** Set when this state is the result of a restore: the revision it was restored from, and who did it. */
  restoredFromRevision: number | null;
  restoredBy: string | null;
  /** False when the stored copy is in a format this version cannot restore. */
  restorable: boolean;
}
