import type { BlockType } from './blocks/block-types.js';
import type {
  ContentStatus,
  LearningLevel,
} from '../../../shared-kernel/index.js';

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  /** Plain multi-paragraph text. Not a Rich Text document. */
  introduction: string | null;
  /** Reserved for the Media module; always null until it exists. */
  coverMediaId: string | null;
  estimatedMinutes: number | null;
  /** Levels the lesson is available at, in canonical order (BEGINNER, INTERMEDIATE, ADVANCED). */
  levels: LearningLevel[];
  /** 1-based, gap-free position within the module. */
  position: number;
  status: ContentStatus;
  /** Incremented on every change to the lesson; used to detect conflicting edits. */
  version: number;
  /**
   * Counts effective changes to the authoring content (metadata, level availability, blocks and
   * their level settings). Unlike `version` it also moves for block changes, and it never moves
   * for status transitions or no-op writes.
   */
  contentRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A block in a lesson: a placement with a stable id, an immutable type and an explicit position. */
export interface LessonBlock {
  id: string;
  lessonId: string;
  type: BlockType;
  /** 1-based, gap-free position within the lesson. */
  position: number;
  /** Content shared by every level the block is visible at. null = no content yet. Shape depends on `type`. */
  sharedContent: Record<string, unknown> | null;
  /** Incremented on every change to the block; used to detect conflicting edits. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One level a block is visible at. `content` is the full-replacement variant, or null to use the block's shared content. */
export interface BlockLevelSetting {
  level: LearningLevel;
  content: Record<string, unknown> | null;
}

/** A block together with the levels it is visible at, in canonical level order. */
export interface BlockView extends LessonBlock {
  levels: BlockLevelSetting[];
}
