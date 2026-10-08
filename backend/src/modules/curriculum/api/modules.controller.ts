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
import { ModuleService } from '../application/module.service.js';
import {
  CreateModuleDto,
  ModuleListResponseDto,
  ModuleResponseDto,
  ReorderModulesDto,
  UpdateModuleDto,
} from './dto/module.dto.js';
import { READ_ROLES, WRITE_ROLES } from './roles.js';

/** Thin HTTP layer for the modules of a course. */
@Controller('admin/courses/:courseId/modules')
export class ModulesController {
  constructor(private readonly modules: ModuleService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateModuleDto,
  ): Promise<ModuleResponseDto> {
    return ModuleResponseDto.from(await this.modules.create(courseId, dto));
  }

  /** Modules in course order. */
  @Get()
  @Roles(...READ_ROLES)
  async list(
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<ModuleListResponseDto> {
    return ModuleListResponseDto.from(await this.modules.list(courseId));
  }

  @Put('order')
  @Roles(...WRITE_ROLES)
  async reorder(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReorderModulesDto,
  ): Promise<ModuleListResponseDto> {
    return ModuleListResponseDto.from(
      await this.modules.reorder(courseId, dto.moduleIds),
    );
  }

  @Get(':moduleId')
  @Roles(...READ_ROLES)
  async get(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
  ): Promise<ModuleResponseDto> {
    return ModuleResponseDto.from(await this.modules.get(courseId, moduleId));
  }

  @Patch(':moduleId')
  @Roles(...WRITE_ROLES)
  async update(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: UpdateModuleDto,
  ): Promise<ModuleResponseDto> {
    return ModuleResponseDto.from(
      await this.modules.update(courseId, moduleId, dto),
    );
  }

  @Delete(':moduleId')
  @Roles(...WRITE_ROLES)
  @HttpCode(204)
  async delete(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
  ): Promise<void> {
    await this.modules.delete(courseId, moduleId);
  }
}
