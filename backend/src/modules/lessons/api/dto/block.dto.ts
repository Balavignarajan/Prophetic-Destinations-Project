import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import {
  LEARNING_LEVELS,
  type LearningLevel,
} from '../../../../shared-kernel/index.js';
import { BLOCK_TYPES } from '../../domain/blocks/block-types.js';
import { MAX_BLOCKS_PER_LESSON } from '../../domain/blocks/block-content.js';
import type { BlockView } from '../../domain/models.js';

export class CreateBlockDto {
  /** One of the guide's block types. Whether it can be used yet is decided by the registry (422 if not). */
  @IsIn(BLOCK_TYPES)
  type: (typeof BLOCK_TYPES)[number];

  /** Content shared by every level the block is visible at. Its shape depends on `type`. */
  @IsOptional()
  @IsObject()
  sharedContent?: Record<string, unknown> | null;

  /** 1-based. Inserts at that position and pushes later blocks down. Omit to append. */
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  /**
   * Levels the block is visible at (they must be levels the lesson is available at).
   * Omit for none: a new block is hidden everywhere until levels are chosen explicitly.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LEARNING_LEVELS.length)
  @ArrayUnique()
  @IsIn(LEARNING_LEVELS, { each: true })
  levels?: string[];
}

/** The type is deliberately not here: it can never be changed after creation. */
export class UpdateBlockDto {
  /** Replaces the content. null clears it. */
  @IsOptional()
  @IsObject()
  sharedContent?: Record<string, unknown> | null;

  /** The version the editor last saw; if it is stale the update is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

/** The key must be present: an object (a variant) or null (use the shared content). Omitting it is an error. */
function IsObjectOrNull(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isObjectOrNull',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an object (a variant) or null (use the shared content)`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          value === null ||
          (typeof value === 'object' &&
            !Array.isArray(value) &&
            value !== undefined),
      },
    });
  };
}

/** Full replacement of one level's setting for a block. */
export class PutBlockLevelDto {
  /** null = visible, using the block's shared content. An object = the full-replacement variant for this level. */
  @IsObjectOrNull()
  content: Record<string, unknown> | null;

  /** The block version the editor last saw; if it is stale the change is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class RemoveBlockLevelQueryDto {
  /** Must be "true" to hide a block that has a variant for this level (the variant is discarded). */
  @IsOptional()
  @IsIn(['true', 'false'])
  discardVariant?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class ReorderBlocksDto {
  /** Every block id of the lesson, in the desired order. */
  @IsArray()
  @ArrayMaxSize(MAX_BLOCKS_PER_LESSON)
  @IsUUID('all', { each: true })
  blockIds: string[];
}

export class BlockLevelDto {
  level: LearningLevel;
  /** The variant for this level, or null when the block uses its shared content here. */
  content: Record<string, unknown> | null;
}

export class BlockResponseDto {
  id: string;
  lessonId: string;
  type: string;
  position: number;
  sharedContent: Record<string, unknown> | null;
  /** The levels the block is visible at, in canonical order. Empty = hidden everywhere. */
  levels: BlockLevelDto[];
  version: number;
  createdAt: string;
  updatedAt: string;

  static from(block: BlockView): BlockResponseDto {
    return {
      id: block.id,
      lessonId: block.lessonId,
      type: block.type,
      position: block.position,
      sharedContent: block.sharedContent,
      levels: block.levels.map(({ level, content }) => ({ level, content })),
      version: block.version,
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
    };
  }
}

export class BlockListResponseDto {
  items: BlockResponseDto[];

  static from(blocks: BlockView[]): BlockListResponseDto {
    return { items: blocks.map((block) => BlockResponseDto.from(block)) };
  }
}
