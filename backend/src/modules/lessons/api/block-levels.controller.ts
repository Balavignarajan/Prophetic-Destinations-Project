import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import { Roles } from '../../identity/index.js';
import { BlockLevelService } from '../application/block-level.service.js';
import {
  BlockResponseDto,
  PutBlockLevelDto,
  RemoveBlockLevelQueryDto,
} from './dto/block.dto.js';
import { LearningLevelPipe } from './learning-level.pipe.js';
import { WRITE_ROLES } from './roles.js';

/** Where a block is visible, and its per-level variants. */
@Controller('admin/lessons/:lessonId/blocks/:blockId/levels/:level')
export class BlockLevelsController {
  constructor(private readonly levels: BlockLevelService) {}

  /**
   * Makes the block visible at this level. `content: null` uses the shared content;
   * an object is the full-replacement variant for this level (only for block types
   * that support variants). Sending what is already stored changes nothing.
   */
  @Put()
  @Roles(...WRITE_ROLES)
  async put(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Param('level', new LearningLevelPipe()) level: LearningLevel,
    @Body() dto: PutBlockLevelDto,
  ): Promise<BlockResponseDto> {
    return BlockResponseDto.from(
      await this.levels.setLevel(lessonId, blockId, level, dto),
    );
  }

  /** Hides the block at this level. A block with a variant here needs `?discardVariant=true`. */
  @Delete()
  @Roles(...WRITE_ROLES)
  async remove(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Param('level', new LearningLevelPipe()) level: LearningLevel,
    @Query() query: RemoveBlockLevelQueryDto,
  ): Promise<BlockResponseDto> {
    return BlockResponseDto.from(
      await this.levels.removeLevel(lessonId, blockId, level, {
        discardVariant: query.discardVariant === 'true',
        version: query.version,
      }),
    );
  }
}
