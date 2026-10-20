import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { LessonService } from '../application/lesson.service.js';
import {
  CreateLessonDto,
  LessonListResponseDto,
  LessonResponseDto,
  ReorderLessonsDto,
} from './dto/lesson.dto.js';
import { READ_ROLES, WRITE_ROLES } from './roles.js';

/** The lessons of one module: the collection routes, nested under course and module. */
@Controller('admin/courses/:courseId/modules/:moduleId/lessons')
export class ModuleLessonsController {
  constructor(private readonly lessons: LessonService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: CreateLessonDto,
  ): Promise<LessonResponseDto> {
    return LessonResponseDto.from(
      await this.lessons.create(courseId, moduleId, dto),
    );
  }

  /** Lessons in module order. */
  @Get()
  @Roles(...READ_ROLES)
  async list(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
  ): Promise<LessonListResponseDto> {
    return LessonListResponseDto.from(
      await this.lessons.list(courseId, moduleId),
    );
  }

  @Put('order')
  @Roles(...WRITE_ROLES)
  async reorder(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: ReorderLessonsDto,
  ): Promise<LessonListResponseDto> {
    return LessonListResponseDto.from(
      await this.lessons.reorder(courseId, moduleId, dto.lessonIds, dto.previousLessonIds),
    );
  }
}
