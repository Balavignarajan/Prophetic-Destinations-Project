import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { BlockService } from '../application/block.service.js';
import {
  BlockListResponseDto,
  BlockResponseDto,
  CreateBlockDto,
  ReorderBlocksDto,
  UpdateBlockDto,
} from './dto/block.dto.js';
import { DELETE_BLOCK_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

/** The blocks of one lesson. Thin HTTP layer: parse, call BlockService, shape the response. */
@Controller('admin/lessons/:lessonId/blocks')
export class BlocksController {
  constructor(private readonly blocks: BlockService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: CreateBlockDto,
  ): Promise<BlockResponseDto> {
    return BlockResponseDto.from(await this.blocks.create(lessonId, dto));
  }

  /** Blocks in lesson order. */
  @Get()
  @Roles(...READ_ROLES)
  async list(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<BlockListResponseDto> {
    return BlockListResponseDto.from(await this.blocks.list(lessonId));
  }

  @Put('order')
  @Roles(...WRITE_ROLES)
  async reorder(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: ReorderBlocksDto,
  ): Promise<BlockListResponseDto> {
    return BlockListResponseDto.from(
      await this.blocks.reorder(lessonId, dto.blockIds),
    );
  }

  @Get(':blockId')
  @Roles(...READ_ROLES)
  async get(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<BlockResponseDto> {
    return BlockResponseDto.from(await this.blocks.get(lessonId, blockId));
  }

  @Patch(':blockId')
  @Roles(...WRITE_ROLES)
  async update(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body() dto: UpdateBlockDto,
  ): Promise<BlockResponseDto> {
    return BlockResponseDto.from(
      await this.blocks.update(lessonId, blockId, dto),
    );
  }

  /** Creates an independent copy right after the original. */
  @Post(':blockId/duplicate')
  @Roles(...WRITE_ROLES)
  async duplicate(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<BlockResponseDto> {
    return BlockResponseDto.from(
      await this.blocks.duplicate(lessonId, blockId),
    );
  }

  @Delete(':blockId')
  @Roles(...DELETE_BLOCK_ROLES)
  @HttpCode(204)
  async delete(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<void> {
    await this.blocks.delete(lessonId, blockId);
  }
}
