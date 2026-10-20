import type {
  AssembledLesson,
  BlockProblemCode,
  ContentProblem,
  DiagnosticCode,
} from '../../lessons/index.js';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import {
  MAX_LEVEL_SNAPSHOT_BYTES,
  buildLevelPayload,
  payloadBytes,
} from './snapshot-payload.js';

/**
 * Where a readiness rule comes from, so confirmed requirements stay distinct from
 * engineering safeguards:
 *  - RULE:      a rule of the product/domain (lesson needs a level and a title; block content must be complete).
 *  - RESOLVER:  a diagnostic of the pure level resolver (always blocking for publishing).
 *  - SAFEGUARD: an engineering check against bad data or limits, not a product rule.
 */
export type IssueSource = 'RULE' | 'RESOLVER' | 'SAFEGUARD';

export type ReadinessCode =
  | DiagnosticCode
  | BlockProblemCode
  | 'LESSON_TITLE_MISSING'
  | 'LESSON_HAS_NO_LEVELS'
  | 'COVER_NOT_SUPPORTED'
  | 'SNAPSHOT_TOO_LARGE';

export interface ReadinessIssue {
  code: ReadinessCode;
  /** Every issue blocks publication. */
  severity: 'BLOCKING';
  source: IssueSource;
  level?: LearningLevel;
  blockId?: string;
  message: string;
  /** The block-content problems behind a content issue (capped). */
  problems?: ContentProblem[];
}

export interface LevelReadiness {
  level: LearningLevel;
  /** Blocks visible at this level (resolved or not). */
  visibleBlocks: number;
  /** Visible blocks that resolved to content. */
  resolvedBlocks: number;
}

export interface ReadinessReport {
  lessonId: string;
  ready: boolean;
  /** The authoring revision the report describes. */
  contentRevision: number;
  issues: ReadinessIssue[];
  levels: LevelReadiness[];
}

const MAX_PROBLEMS_PER_ISSUE = 5;

/** Block-content problems that are product rules vs safeguards. */
const BLOCK_PROBLEM_SOURCE: Record<BlockProblemCode, IssueSource> = {
  BLOCK_CONTENT_INCOMPLETE: 'RULE',
  BLOCK_CONTENT_INVALID: 'SAFEGUARD',
  BLOCK_TYPE_NOT_AVAILABLE: 'SAFEGUARD',
};

/**
 * Judges an assembled lesson and reports every problem at once (never just the
 * first). Pure: it only looks at the assembled data. Issue order is deterministic:
 * lesson-level rules first, then each level in canonical order (resolver
 * diagnostics, then block problems, then the size check), block by block.
 */
export function evaluateReadiness(assembled: AssembledLesson): ReadinessReport {
  const issues: ReadinessIssue[] = [];

  // Lesson-level rules. Title is the only mandatory metadata field.
  if (assembled.lesson.title.trim().length === 0) {
    issues.push({
      code: 'LESSON_TITLE_MISSING',
      severity: 'BLOCKING',
      source: 'RULE',
      message: 'The lesson needs a title',
    });
  }
  if (assembled.availableLevels.length === 0) {
    issues.push({
      code: 'LESSON_HAS_NO_LEVELS',
      severity: 'BLOCKING',
      source: 'RULE',
      message: 'The lesson must be available at one or more learning levels',
    });
  }

  const levels: LevelReadiness[] = [];
  for (const level of assembled.levels) {
    levels.push({
      level: level.level,
      visibleBlocks: level.resolution.blocks.length,
      resolvedBlocks: level.resolution.blocks.filter(
        (block) => block.source !== null,
      ).length,
    });

    for (const diagnostic of level.resolution.diagnostics) {
      issues.push({
        code: diagnostic.code,
        severity: 'BLOCKING',
        source: 'RESOLVER',
        level: level.level,
        ...(diagnostic.blockId ? { blockId: diagnostic.blockId } : {}),
        message: diagnostic.message,
      });
    }

    for (const problem of level.blockProblems) {
      issues.push({
        code: problem.code,
        severity: 'BLOCKING',
        source: BLOCK_PROBLEM_SOURCE[problem.code],
        level: level.level,
        blockId: problem.blockId,
        message: blockProblemMessage(problem.code, level.level),
        problems: problem.problems.slice(0, MAX_PROBLEMS_PER_ISSUE),
      });
    }

    const bytes = payloadBytes(buildLevelPayload(assembled, level));
    if (bytes > MAX_LEVEL_SNAPSHOT_BYTES) {
      issues.push({
        code: 'SNAPSHOT_TOO_LARGE',
        severity: 'BLOCKING',
        source: 'SAFEGUARD',
        level: level.level,
        message: `The ${level.level} snapshot would be ${bytes} bytes; the limit is ${MAX_LEVEL_SNAPSHOT_BYTES}`,
      });
    }
  }

  return {
    lessonId: assembled.lessonId,
    ready: issues.length === 0,
    contentRevision: assembled.contentRevision,
    issues,
    levels,
  };
}

function blockProblemMessage(
  code: BlockProblemCode,
  level: LearningLevel,
): string {
  switch (code) {
    case 'BLOCK_CONTENT_INCOMPLETE':
      return `The block's content is incomplete at the ${level} level`;
    case 'BLOCK_CONTENT_INVALID':
      return `The block's stored content is not valid at the ${level} level`;
    case 'BLOCK_TYPE_NOT_AVAILABLE':
      return `The block's type is not available, so it cannot be published at the ${level} level`;
  }
}
