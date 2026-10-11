import {
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../shared-kernel/index.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  canonicalJson,
  hashCanonicalJson,
} from './snapshot-payload.js';

/**
 * The immutable catalog snapshot of a course (pure rules; no database).
 *
 * One snapshot is stored per learning level that has at least one published lesson. It is the
 * learner-facing structure of the course at the moment a catalog version was created:
 * the course as published, its published modules in order, and under each module the lessons that
 * had an ACTIVE LESSON PUBLICATION at that level, in lesson order, with the summary taken from that
 * published lesson snapshot (never from a working copy). The nested order is the one and only
 * navigation order; there is no separate ordering list.
 */
export const CATALOG_SNAPSHOT_SCHEMA_VERSION = 1;

/** The display fields of a published lesson shown in a catalog. */
export interface LessonSummary {
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  estimatedMinutes: number | null;
}

export interface CatalogLessonEntry extends LessonSummary {
  id: string;
}

export interface CatalogModuleSnapshot {
  id: string;
  title: string;
  description: string | null;
  lessons: CatalogLessonEntry[];
}

export interface CatalogLevelContent {
  schemaVersion: number;
  level: LearningLevel;
  course: { id: string; title: string; description: string | null };
  modules: CatalogModuleSnapshot[];
}

/** A module as it is published in a catalog version. `position` is its ordinal there (1..n). */
export interface PublishedModuleEntry {
  moduleId: string;
  position: number;
  title: string;
  description: string | null;
}

/**
 * Orders `live` (the current authoring order of the ids that are eligible now) so that it keeps the relative
 * order of `previous` (the order already published) for every id both contain. An id that is new is inserted
 * right before the closest id that follows it in `live` and is already placed; when nothing follows it, it goes
 * last. Deterministic, and with no `previous` it returns `live` unchanged.
 */
export function preserveOrder(
  live: readonly string[],
  previous: readonly string[],
): string[] {
  const liveSet = new Set(live);
  const result = previous.filter(
    (id, index) => liveSet.has(id) && previous.indexOf(id) === index,
  );
  const placed = new Set(result);
  // Walking backwards means the ids that follow an id are already placed (or are known) when it is reached.
  for (let index = live.length - 1; index >= 0; index -= 1) {
    const id = live[index];
    if (placed.has(id)) continue;
    let before = result.length;
    for (let j = index + 1; j < live.length; j += 1) {
      if (placed.has(live[j])) {
        before = result.indexOf(live[j]);
        break;
      }
    }
    result.splice(before, 0, id);
    placed.add(id);
  }
  return result;
}

export interface CatalogBuildInput {
  course: { id: string; title: string; description: string | null };
  /** The modules of this version, in the order learners see them. */
  modules: readonly PublishedModuleEntry[];
  /** Lessons of those modules in lesson order within each module (module order is taken from `modules`). */
  placements: readonly { lessonId: string; moduleId: string }[];
  /** Published summaries: lesson id -> level -> summary, for lessons with an active publication at that level. */
  summaries: ReadonlyMap<string, ReadonlyMap<LearningLevel, LessonSummary>>;
  /** The version being replaced, per level. Its lesson order is kept except for `liveLessonOrder` modules. */
  previous?: ReadonlyMap<LearningLevel, CatalogLevelContent>;
  /**
   * Modules whose current authoring lesson order has been approved (so it may change the published order).
   * For every other module the order of `previous` is kept and only new lessons are inserted.
   */
  liveLessonOrder?: ReadonlySet<string>;
}

/**
 * Builds the per-level contents of a new catalog version. Only levels with at least one lesson are
 * returned; within a level, modules with no lesson at that level are left out.
 */
export function buildCatalogLevels(
  input: CatalogBuildInput,
): Map<LearningLevel, CatalogLevelContent> {
  const placementsByModule = new Map<string, string[]>();
  for (const placement of input.placements) {
    const list = placementsByModule.get(placement.moduleId) ?? [];
    list.push(placement.lessonId);
    placementsByModule.set(placement.moduleId, list);
  }

  const levels = new Map<LearningLevel, CatalogLevelContent>();
  for (const level of LEARNING_LEVELS) {
    const modules: CatalogModuleSnapshot[] = [];
    for (const module of [...input.modules].sort(
      (a, b) => a.position - b.position,
    )) {
      const eligible = (placementsByModule.get(module.moduleId) ?? []).filter(
        (lessonId) => input.summaries.get(lessonId)?.get(level),
      );
      const before = input.previous
        ?.get(level)
        ?.modules.find((m) => m.id === module.moduleId);
      const ordered =
        before && !input.liveLessonOrder?.has(module.moduleId)
          ? preserveOrder(
              eligible,
              before.lessons.map((lesson) => lesson.id),
            )
          : eligible;
      const lessons: CatalogLessonEntry[] = ordered.map((lessonId) => ({
        id: lessonId,
        ...input.summaries.get(lessonId)!.get(level)!,
      }));
      if (lessons.length > 0) {
        modules.push({
          id: module.moduleId,
          title: module.title,
          description: module.description,
          lessons,
        });
      }
    }
    if (modules.length > 0) {
      levels.set(level, {
        schemaVersion: CATALOG_SNAPSHOT_SCHEMA_VERSION,
        level,
        course: { ...input.course },
        modules,
      });
    }
  }
  return levels;
}

/** The text that is stored, measured and hashed: measured and hashed from the same canonical serialization. */
export interface SerializedCatalogLevel {
  level: LearningLevel;
  json: string;
  bytes: number;
  hash: string;
}

export function serializeCatalogLevel(
  content: CatalogLevelContent,
): SerializedCatalogLevel {
  const json = canonicalJson(content);
  return {
    level: content.level,
    json,
    bytes: Buffer.byteLength(json, 'utf8'),
    hash: hashCanonicalJson(json),
  };
}

export type CatalogReadinessCode =
  'NO_PUBLISHED_LESSONS' | 'SNAPSHOT_TOO_LARGE';

export interface CatalogReadinessIssue {
  code: CatalogReadinessCode;
  message: string;
  level?: LearningLevel;
}

export interface CatalogReadinessReport {
  ready: boolean;
  issues: CatalogReadinessIssue[];
}

/** What must be true of a catalog version before it may be published (every problem is reported). */
export function evaluateCatalogReadiness(
  serialized: readonly SerializedCatalogLevel[],
): CatalogReadinessReport {
  const issues: CatalogReadinessIssue[] = [];
  if (serialized.length === 0) {
    issues.push({
      code: 'NO_PUBLISHED_LESSONS',
      message:
        'The catalog would list no published lesson at any level. Publish at least one lesson of this course first.',
    });
  }
  for (const level of serialized) {
    if (level.bytes > MAX_LEVEL_SNAPSHOT_BYTES) {
      issues.push({
        code: 'SNAPSHOT_TOO_LARGE',
        level: level.level,
        message: `The ${level.level} catalog snapshot would be ${level.bytes} bytes; the limit is ${MAX_LEVEL_SNAPSHOT_BYTES}`,
      });
    }
  }
  return { ready: issues.length === 0, issues };
}
