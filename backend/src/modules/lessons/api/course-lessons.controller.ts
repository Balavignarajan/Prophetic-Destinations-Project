import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { LessonService } from '../application/lesson.service.js';
import { CreateLessonDto, LessonListResponseDto, LessonResponseDto, ReorderLessonsDto } from './dto/lesson.dto.js';
import { READ_ROLES, WRITE_ROLES } from './roles.js';

/** Direct lessons of a course. Modules remain available as optional lesson groups. */
@Controller('admin/courses/:courseId/lessons')
export class CourseLessonsController {
  constructor(private readonly lessons: LessonService) {}

  @Post() @Roles(...WRITE_ROLES)
  async create(@Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: CreateLessonDto): Promise<LessonResponseDto> {
    return LessonResponseDto.from(await this.lessons.createDirect(courseId, dto));
  }

  @Get() @Roles(...READ_ROLES)
  async list(@Param('courseId', ParseUUIDPipe) courseId: string): Promise<LessonListResponseDto> {
    return LessonListResponseDto.from(await this.lessons.listDirect(courseId));
  }

  @Put('order') @Roles(...WRITE_ROLES)
  async reorder(@Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: ReorderLessonsDto): Promise<LessonListResponseDto> {
    return LessonListResponseDto.from(await this.lessons.reorderDirect(courseId, dto.lessonIds, dto.previousLessonIds));
  }
}
