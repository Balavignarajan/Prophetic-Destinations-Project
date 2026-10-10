import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { BLOCK_TYPES } from '../../domain/blocks/block-types.js';
import { MAX_BLOCKS_PER_LESSON } from '../../domain/blocks/block-content.js';
import type { LessonBlock } from '../../domain/models.js';

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

export class ReorderBlocksDto {
  /** Every block id of the lesson, in the desired order. */
  @IsArray()
  @ArrayMaxSize(MAX_BLOCKS_PER_LESSON)
  @IsUUID('all', { each: true })
  blockIds: string[];
}

export class BlockResponseDto {
  id: string;
  lessonId: string;
  type: string;
  position: number;
  sharedContent: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;

  static from(block: LessonBlock): BlockResponseDto {
    return {
      id: block.id,
      lessonId: block.lessonId,
      type: block.type,
      position: block.position,
      sharedContent: block.sharedContent,
      version: block.version,
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
    };
  }
}

export class BlockListResponseDto {
  items: BlockResponseDto[];

  static from(blocks: LessonBlock[]): BlockListResponseDto {
    return { items: blocks.map((block) => BlockResponseDto.from(block)) };
  }
}
