import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { LessonService } from '../application/lesson.service.js';
import {
  LessonResponseDto,
  SetLessonLevelsDto,
  UpdateLessonDto,
} from './dto/lesson.dto.js';
import { DELETE_LESSON_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

/** A single lesson, addressed by its own id. */
@Controller('admin/lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonService) {}

  @Get(':lessonId')
  @Roles(...READ_ROLES)
  async get(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<LessonResponseDto> {
    return LessonResponseDto.from(await this.lessons.get(lessonId));
  }

  @Patch(':lessonId')
  @Roles(...WRITE_ROLES)
  async update(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: UpdateLessonDto,
  ): Promise<LessonResponseDto> {
    return LessonResponseDto.from(await this.lessons.update(lessonId, dto));
  }

  /** Replaces the set of levels the lesson is available at. */
  @Put(':lessonId/levels')
  @Roles(...WRITE_ROLES)
  async setLevels(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: SetLessonLevelsDto,
  ): Promise<LessonResponseDto> {
    return LessonResponseDto.from(
      await this.lessons.setLevels(lessonId, dto.levels, dto.version),
    );
  }

  @Delete(':lessonId')
  @Roles(...DELETE_LESSON_ROLES)
  @HttpCode(204)
  async delete(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<void> {
    await this.lessons.delete(lessonId);
  }
}
