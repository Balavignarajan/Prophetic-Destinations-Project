import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type AuthenticatedAdmin, CurrentAdmin, Roles } from '../../identity/index.js';
import { ReusableBlockService } from '../application/reusable-block.service.js';
import {
  CreateReusableBlockDto,
  InsertReusableBlockDto,
  InsertedReusableBlockResponseDto,
  ListReusableBlocksQueryDto,
  ReusableBlockListResponseDto,
  ReusableBlockResponseDto,
  ReusableBlockSummaryDto,
  UpdateReusableBlockDto,
} from './dto/reusable-block.dto.js';
import { DELETE_BLOCK_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

const DEFAULT_LIMIT = 50;

/**
 * The reusable block library (CMS-014, copy-based). Staff only: every route needs a signed-in admin with the lesson roles (read: admin, editor, reviewer; save, edit,
 * insert: admin, editor; delete: admin, editor). Nothing here is part of any public learner API. Thin HTTP layer: parse, call ReusableBlockService, shape the response.
 */
@Controller('admin/reusable-blocks')
export class ReusableBlocksController {
  constructor(private readonly templates: ReusableBlockService) {}

  /** Saves a stored lesson block as a reusable block. The lesson block is not changed. */
  @Post()
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async create(@CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: CreateReusableBlockDto): Promise<ReusableBlockResponseDto> {
    return ReusableBlockResponseDto.from(await this.templates.createFromBlock(actor.id, dto));
  }

  /** Most recently changed first; `q` filters by name, `type` by block type. */
  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async list(@Query() query: ListReusableBlocksQueryDto): Promise<ReusableBlockListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.templates.list({ text: query.q ?? '', type: query.type }, limit, offset);
    return { items: items.map((item) => ReusableBlockSummaryDto.from(item)), total, limit, offset };
  }

  @Get(':templateId')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async get(@Param('templateId', ParseUUIDPipe) templateId: string): Promise<ReusableBlockResponseDto> {
    return ReusableBlockResponseDto.from(await this.templates.get(templateId));
  }

  /** Renames, re-describes and/or replaces the shared content. Lessons that already hold a copy are not changed. */
  @Patch(':templateId')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async update(@Param('templateId', ParseUUIDPipe) templateId: string, @Body() dto: UpdateReusableBlockDto): Promise<ReusableBlockResponseDto> {
    return ReusableBlockResponseDto.from(await this.templates.update(templateId, dto));
  }

  /** Deletes the template only; lesson blocks inserted from it stay. */
  @Delete(':templateId')
  @Roles(...DELETE_BLOCK_ROLES)
  @HttpCode(204)
  async delete(@Param('templateId', ParseUUIDPipe) templateId: string): Promise<void> {
    await this.templates.delete(templateId);
  }

  /** Inserts an independent copy into a lesson, as a draft edit of that lesson. Nothing is published. */
  @Post(':templateId/insert')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async insert(@Param('templateId', ParseUUIDPipe) templateId: string, @Body() dto: InsertReusableBlockDto): Promise<InsertedReusableBlockResponseDto> {
    return InsertedReusableBlockResponseDto.from(await this.templates.insert(templateId, dto));
  }
}
