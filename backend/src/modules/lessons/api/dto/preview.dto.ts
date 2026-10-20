import { IsIn } from 'class-validator';
import {
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../../shared-kernel/index.js';
import type {
  Diagnostic,
  DiagnosticCode,
} from '../../domain/level-resolution.js';
import type { Preview } from '../../application/preview.service.js';

export class PreviewQueryDto {
  /** The level to preview. Required, upper-case. */
  @IsIn(LEARNING_LEVELS)
  level: LearningLevel;
}

export class PreviewBlockDto {
  blockId: string;
  type: string;
  /** 1..m over the blocks visible at this level. */
  ordinal: number;
  source: 'VARIANT' | 'SHARED' | null;
  content: Record<string, unknown> | null;
  /** Present exactly when the block could not be resolved. */
  unresolved?: { code: DiagnosticCode; message: string };
}

export class PreviewResponseDto {
  level: LearningLevel;
  /** false when the lesson is not available at this level (blocks is then empty). */
  available: boolean;
  lesson: {
    id: string;
    courseId: string;
    moduleId: string | null;
    title: string;
    shortTitle: string | null;
    subtitle: string | null;
    introduction: string | null;
    coverMediaId: string | null;
    estimatedMinutes: number | null;
    status: string;
    version: number;
    availableLevels: LearningLevel[];
  };
  blocks: PreviewBlockDto[];
  diagnostics: Diagnostic[];

  static from({ lesson, resolution }: Preview): PreviewResponseDto {
    return {
      level: resolution.level,
      available: resolution.available,
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        moduleId: lesson.moduleId,
        title: lesson.title,
        shortTitle: lesson.shortTitle,
        subtitle: lesson.subtitle,
        introduction: lesson.introduction,
        coverMediaId: lesson.coverMediaId,
        estimatedMinutes: lesson.estimatedMinutes,
        status: lesson.status,
        version: lesson.version,
        availableLevels: lesson.levels,
      },
      blocks: resolution.blocks.map((block) => ({
        blockId: block.blockId,
        type: block.type,
        ordinal: block.ordinal,
        source: block.source,
        content: block.content,
        ...(block.unresolved ? { unresolved: block.unresolved } : {}),
      })),
      diagnostics: resolution.diagnostics,
    };
  }
}
