import {
  BusinessRuleError,
  LEARNING_LEVELS,
  type LearningLevel,
  isLearningLevel,
} from '../../../shared-kernel/index.js';
import type { BlockType } from './blocks/block-types.js';

/**
 * Reusable blocks (CMS-014): COPY-BASED templates of a lesson block. Pure rules; no database, no HTTP.
 *
 * A template is an authoring object of its own. It is not a lesson block: no lesson, publication, snapshot, public API, learner progress or quiz result ever
 * refers to it. Inserting one creates a NEW lesson block with its own identity (the ordinary block creation path, so every rule of a block applies), and from then on
 * the two never influence each other: editing or deleting the template changes no lesson, and editing the inserted block changes no template.
 */

export const TEMPLATE_LIMITS = { name: 120, description: 500 } as const;

/**
 * Block types that cannot be saved as a reusable block, with the reason that is shown. These two hold a REFERENCE to something that other parts of the CMS
 * protect and track only through lesson blocks, so a copy kept in a template would silently escape that protection:
 *  - QUIZ points at a quiz and the quiz VERSION it was saved against (the quiz module locks the quiz while a block refers to it, deletes are refused while a lesson
 *    block uses it, and publication compares the version); a template would be a reference those checks cannot see, and its stamped version would go stale.
 *  - CONTINUE_EXPLORING names other lessons; deleting a lesson removes links to it from lesson blocks only, and a link may never point at the lesson that holds it,
 *    which cannot be known for a template.
 * Everything else is a self-contained content contract (media references are tracked, see the media usage count) and is reusable.
 */
export const NON_REUSABLE_BLOCK_TYPES: Partial<Record<BlockType, string>> = {
  QUIZ: 'A quiz block refers to a quiz, and the quiz is locked, versioned and protected only through the lessons that use it. Add the quiz to each lesson from the Quizzes section instead.',
  CONTINUE_EXPLORING: 'A Continue Exploring block links to other lessons, and those links are kept consistent only inside the lesson that holds them. Add the links in each lesson instead.',
};

/** Throws (422) with the reason when the type cannot be a reusable block. */
export function checkReusableType(type: string): void {
  const reason = NON_REUSABLE_BLOCK_TYPES[type as BlockType];
  if (reason !== undefined) {
    throw new BusinessRuleError(`${type} blocks cannot be saved as reusable blocks. ${reason}`, { code: 'TEMPLATE_TYPE_NOT_SUPPORTED', type });
  }
}

function rejectNul(value: string, field: string): void {
  if (value.includes('\u0000')) throw new BusinessRuleError(`${field} contains an invalid character`, { field });
}

/** Required, trimmed, not blank, within the limit (never truncated). */
export function checkTemplateName(name: string): string {
  const trimmed = name.trim();
  rejectNul(trimmed, 'name');
  if (trimmed.length === 0) throw new BusinessRuleError('Give the reusable block a name', { field: 'name' });
  if (trimmed.length > TEMPLATE_LIMITS.name) {
    throw new BusinessRuleError(`The name must be at most ${TEMPLATE_LIMITS.name} characters`, { field: 'name', max: TEMPLATE_LIMITS.name });
  }
  return trimmed;
}

/** Optional plain text: trimmed, blank means "none", over-long is rejected. */
export function checkTemplateDescription(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.replace(/\r\n?/g, '\n').trim();
  rejectNul(text, 'description');
  if (text.length === 0) return null;
  if (text.length > TEMPLATE_LIMITS.description) {
    throw new BusinessRuleError(`The description must be at most ${TEMPLATE_LIMITS.description} characters`, { field: 'description', max: TEMPLATE_LIMITS.description });
  }
  return text;
}

/** One level the template is visible at; `content` is that level's own version, or null to use the shared content. Same meaning as a block's level row. */
export interface TemplateLevel {
  level: LearningLevel;
  content: Record<string, unknown> | null;
}

export interface ReusableBlock {
  id: string;
  name: string;
  description: string | null;
  type: BlockType;
  /** Shared content, in the block type's own canonical contract. */
  sharedContent: Record<string, unknown> | null;
  /** The levels the block was visible at when it was saved, in canonical level order. */
  levels: TemplateLevel[];
  /** Incremented on every change; used to detect conflicting edits. */
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored `levels` column, read defensively: unusable entries are dropped, the rest come back in canonical level order. */
export function readTemplateLevels(raw: unknown): TemplateLevel[] {
  if (!Array.isArray(raw)) return [];
  const found = new Map<LearningLevel, TemplateLevel>();
  for (const entry of raw) {
    if (!isObject(entry) || !isLearningLevel(entry.level)) continue;
    found.set(entry.level, { level: entry.level, content: isObject(entry.content) ? entry.content : null });
  }
  return LEARNING_LEVELS.flatMap((level) => {
    const hit = found.get(level);
    return hit ? [hit] : [];
  });
}

/** A level the template is visible at that the target lesson is not available at: it is left out, and `hadVariant` says whether an own version goes with it. */
export interface LeftOutLevel {
  level: LearningLevel;
  hadVariant: boolean;
  reason: 'LESSON_NOT_AVAILABLE_AT_LEVEL' | 'VARIANTS_NOT_SUPPORTED';
}

export interface InsertionPlan {
  /** Levels the new block will be visible at (with the template's own versions where they are kept). */
  kept: TemplateLevel[];
  /** Everything that is NOT carried over, so it can be shown to the author and agreed to. Empty = a complete copy. */
  leftOut: LeftOutLevel[];
}

/**
 * What inserting the template into a lesson available at `lessonLevels` would do. A block is never visible at a level its lesson is not available at, and the lesson's
 * availability is never widened for it, so such a level is left out; an own version at a level that is left out goes with it, and so does a version the block type no
 * longer supports (`variantsSupported` false): that is reported, not silently dropped, and the caller decides (see ReusableBlockService.insert).
 */
export function planInsertion(levels: readonly TemplateLevel[], lessonLevels: readonly LearningLevel[], variantsSupported: boolean): InsertionPlan {
  const kept: TemplateLevel[] = [];
  const leftOut: LeftOutLevel[] = [];
  for (const entry of levels) {
    const hadVariant = entry.content !== null;
    if (!lessonLevels.includes(entry.level)) {
      leftOut.push({ level: entry.level, hadVariant, reason: 'LESSON_NOT_AVAILABLE_AT_LEVEL' });
    } else if (hadVariant && !variantsSupported) {
      kept.push({ level: entry.level, content: null });
      leftOut.push({ level: entry.level, hadVariant, reason: 'VARIANTS_NOT_SUPPORTED' });
    } else {
      kept.push(entry);
    }
  }
  return { kept, leftOut };
}
