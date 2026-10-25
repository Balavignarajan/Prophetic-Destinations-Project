import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { HomeEntryService } from '../application/home-entry.service.js';
import {
  CreateHomeEntryDto,
  HomeEntryListResponseDto,
  HomeEntryResponseDto,
  ReorderHomeEntriesDto,
  UpdateHomeEntryDto,
} from './dto/home-entry.dto.js';
import { READ_ROLES, WRITE_ROLES } from './roles.js';

/**
 * The cards of the learner Home screen (Batch 28). Staff only: every route needs a signed-in admin with the curriculum roles (read: admin, editor, reviewer; create, edit,
 * enable, reorder and delete: admin, editor). Deleting an entry removes a card and nothing else, so it needs no stronger role than editing one. Nothing here is part of the
 * public learner API (GET /home-entries is). Thin HTTP layer: parse, call HomeEntryService, shape the response.
 */
@Controller('admin/home-entries')
export class HomeEntriesController {
  constructor(private readonly entries: HomeEntryService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async create(@Body() dto: CreateHomeEntryDto): Promise<HomeEntryResponseDto> {
    return HomeEntryResponseDto.from(await this.entries.create(dto));
  }

  /** Every entry in the Home order, enabled or not. Not paged: there is no limit on the number of entries. */
  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async list(): Promise<HomeEntryListResponseDto> {
    return { items: (await this.entries.list()).map((entry) => HomeEntryResponseDto.from(entry)) };
  }

  /** Declared before ':entryId' so it is never read as an id. */
  @Put('order')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async reorder(@Body() dto: ReorderHomeEntriesDto): Promise<HomeEntryListResponseDto> {
    const items = await this.entries.reorder(dto.entryIds, dto.previousEntryIds);
    return { items: items.map((entry) => HomeEntryResponseDto.from(entry)) };
  }

  @Get(':entryId')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async get(@Param('entryId', ParseUUIDPipe) entryId: string): Promise<HomeEntryResponseDto> {
    return HomeEntryResponseDto.from(await this.entries.get(entryId));
  }

  /** Title, description, course, image and/or enabled. Refused with 409 when `version` is stale. */
  @Patch(':entryId')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async update(@Param('entryId', ParseUUIDPipe) entryId: string, @Body() dto: UpdateHomeEntryDto): Promise<HomeEntryResponseDto> {
    return HomeEntryResponseDto.from(await this.entries.update(entryId, dto));
  }

  /** Removes the card only: the course, its lessons, the image and learner progress are not touched. */
  @Delete(':entryId')
  @Roles(...WRITE_ROLES)
  @HttpCode(204)
  async delete(@Param('entryId', ParseUUIDPipe) entryId: string): Promise<void> {
    await this.entries.delete(entryId);
  }
}
