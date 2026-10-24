import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { LearningLevel } from '../../../../shared-kernel/index.js';
import { BLOCK_TYPES } from '../../domain/blocks/block-types.js';
import { type LeftOutLevel, type ReusableBlock, TEMPLATE_LIMITS } from '../../domain/reusable-blocks.js';
import type { ReusableBlockSummary } from '../../persistence/reusable-block.repository.js';
import type { InsertedReusableBlock } from '../../application/reusable-block.service.js';
import { BlockResponseDto } from './block.dto.js';

/** Surrounding whitespace is not content; whether what remains is empty is decided by the rules (422). */
const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Saves a block of a lesson as a reusable block. The STORED block is the source; nothing about its content is sent. */
export class CreateReusableBlockDto {
  @IsUUID('all')
  lessonId: string;

  @IsUUID('all')
  blockId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_LIMITS.name)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_LIMITS.description * 2)
  description?: string | null;
}

export class UpdateReusableBlockDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TEMPLATE_LIMITS.name)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_LIMITS.description * 2)
  description?: string | null;

  /** Replaces the shared content; its shape depends on the template's block type. null is refused by the rules. */
  @IsOptional()
  @IsObject()
  sharedContent?: Record<string, unknown> | null;

  /** The version the editor last saw; if it is stale the update is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class InsertReusableBlockDto {
  @IsUUID('all')
  lessonId: string;

  /** 1-based. Inserts at that place and pushes later blocks down. Omit to append. */
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  /** Agree to insert without the levels (and their own versions) that cannot be carried over. Without it such an insertion is refused with the list. */
  @IsOptional()
  @IsBoolean()
  acknowledgeLeftOut?: boolean;
}

export class ListReusableBlocksQueryDto {
  /** Part of the name. */
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_LIMITS.name)
  q?: string;

  @IsOptional()
  @IsIn(BLOCK_TYPES)
  type?: (typeof BLOCK_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ReusableBlockSummaryDto {
  id: string;
  name: string;
  description: string | null;
  type: string;
  /** The levels it is visible at, and whether each has its own version. No content. */
  levels: { level: LearningLevel; hasVariant: boolean }[];
  version: number;
  createdAt: string;
  updatedAt: string;

  static from(summary: ReusableBlockSummary): ReusableBlockSummaryDto {
    return {
      id: summary.id,
      name: summary.name,
      description: summary.description,
      type: summary.type,
      levels: summary.levels.map(({ level, hasVariant }) => ({ level, hasVariant })),
      version: summary.version,
      createdAt: summary.createdAt.toISOString(),
      updatedAt: summary.updatedAt.toISOString(),
    };
  }
}

export class ReusableBlockListResponseDto {
  items: ReusableBlockSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export class ReusableBlockResponseDto {
  id: string;
  name: string;
  description: string | null;
  type: string;
  sharedContent: Record<string, unknown> | null;
  /** The levels it is visible at; `content` is that level's own version, or null to use the shared content. */
  levels: { level: LearningLevel; content: Record<string, unknown> | null }[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  static from(template: ReusableBlock): ReusableBlockResponseDto {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      type: template.type,
      sharedContent: template.sharedContent,
      levels: template.levels.map(({ level, content }) => ({ level, content })),
      version: template.version,
      createdBy: template.createdBy,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}

export class InsertedReusableBlockResponseDto {
  /** The new lesson block (its own id; a draft edit of the lesson like any other). */
  block: BlockResponseDto;
  /** What was not carried over, if anything. Empty = a complete copy. */
  leftOut: LeftOutLevel[];

  static from(inserted: InsertedReusableBlock): InsertedReusableBlockResponseDto {
    return { block: BlockResponseDto.from(inserted.block), leftOut: inserted.leftOut };
  }
}
