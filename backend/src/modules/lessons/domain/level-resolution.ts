import type { LearningLevel } from '../../../shared-kernel/index.js';
import type { VariantSupport } from './blocks/registry.js';
import type { BlockType } from './blocks/block-types.js';

/**
 * The level-aware resolver: lesson + level -> the blocks a learner at that level
 * would see. A pure function over plain data (no entities, no database, no clock),
 * used by preview today and intended to be the one implementation that publishing
 * and learner delivery reuse.
 *
 * Rules:
 *  1. The lesson must be available at the level.
 *  2. A block is visible at the level only if it has a level row for it. No row =
 *     hidden = skipped, and a hidden block is not a diagnostic.
 *  3. A visible block shows its variant for that level if it has one, otherwise
 *     its own explicitly authored shared content, otherwise it is *unresolved*.
 *  4. Content of any other level is never read: only the single row for the
 *     requested level is ever looked at.
 *  5. A visible block that cannot be resolved is returned as an unresolved entry
 *     with a diagnostic. It is never skipped silently and never replaced.
 */

export type Content = Record<string, unknown>;

export interface ResolvableBlock {
  id: string;
  type: BlockType;
  position: number;
  sharedContent: Content | null;
  /** Whether the block's type may have variants (from the BlockTypeRegistry). */
  variantSupport: VariantSupport;
  /** One entry per level the block is visible at; `variant` null = use shared content. */
  levels: ReadonlyArray<{ level: LearningLevel; variant: Content | null }>;
}

export interface ResolvableLesson {
  availableLevels: readonly LearningLevel[];
  blocks: readonly ResolvableBlock[];
}

export type DiagnosticCode =
  | 'LESSON_NOT_AVAILABLE_AT_LEVEL'
  | 'NO_VISIBLE_BLOCKS'
  | 'BLOCK_NO_CONTENT'
  | 'BLOCK_VARIANT_NOT_ALLOWED';

export interface Diagnostic {
  code: DiagnosticCode;
  /** Present for block-level diagnostics. */
  blockId?: string;
  message: string;
}

export type ContentSource = 'VARIANT' | 'SHARED';

export interface ResolvedBlock {
  blockId: string;
  type: BlockType;
  /** 1..m over the blocks visible at this level (resolved or not). */
  ordinal: number;
  source: ContentSource | null;
  /** The content object itself (not copied); callers must not mutate it. */
  content: Content | null;
  /** Present exactly when the block could not be resolved. */
  unresolved?: { code: DiagnosticCode; message: string };
}

export interface Resolution {
  level: LearningLevel;
  available: boolean;
  blocks: ResolvedBlock[];
  diagnostics: Diagnostic[];
}

export function resolveLesson(
  lesson: ResolvableLesson,
  level: LearningLevel,
): Resolution {
  if (!lesson.availableLevels.includes(level)) {
    return {
      level,
      available: false,
      blocks: [],
      diagnostics: [
        {
          code: 'LESSON_NOT_AVAILABLE_AT_LEVEL',
          message: `The lesson is not available at the ${level} level`,
        },
      ],
    };
  }

  const blocks: ResolvedBlock[] = [];
  const diagnostics: Diagnostic[] = [];

  const ordered = [...lesson.blocks].sort((a, b) => a.position - b.position);
  for (const block of ordered) {
    // Only the row for the requested level is ever read. Other levels' rows are out of reach.
    const row = block.levels.find((entry) => entry.level === level);
    if (!row) continue; // hidden at this level: not unresolved, no diagnostic

    const ordinal = blocks.length + 1;
    const unresolved = (code: DiagnosticCode, message: string) => {
      blocks.push({
        blockId: block.id,
        type: block.type,
        ordinal,
        source: null,
        content: null,
        unresolved: { code, message },
      });
      diagnostics.push({ code, blockId: block.id, message });
    };

    if (row.variant !== null) {
      if (block.variantSupport !== 'SUPPORTED') {
        unresolved(
          'BLOCK_VARIANT_NOT_ALLOWED',
          `A ${level} variant is stored, but ${block.type} blocks do not support variants`,
        );
      } else {
        blocks.push({
          blockId: block.id,
          type: block.type,
          ordinal,
          source: 'VARIANT',
          content: row.variant,
        });
      }
    } else if (block.sharedContent !== null) {
      blocks.push({
        blockId: block.id,
        type: block.type,
        ordinal,
        source: 'SHARED',
        content: block.sharedContent,
      });
    } else {
      unresolved(
        'BLOCK_NO_CONTENT',
        `The block is visible at ${level} but has neither a ${level} variant nor shared content`,
      );
    }
  }

  // Only when nothing is visible at all; visible-but-unresolved blocks report their own diagnostics.
  if (blocks.length === 0) {
    diagnostics.push({
      code: 'NO_VISIBLE_BLOCKS',
      message: `No block is visible at the ${level} level`,
    });
  }

  return { level, available: true, blocks, diagnostics };
}
