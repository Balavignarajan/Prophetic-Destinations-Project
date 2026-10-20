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
  Query,
} from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { LessonService } from '../application/lesson.service.js';
import {
  RelatedLessonsResponseDto,
  SetRelatedLessonsDto,
  DuplicateLessonDto,
  LessonResponseDto,
  SetLessonLevelsDto,
  UpdateLessonDto,
} from './dto/lesson.dto.js';
import { DELETE_LESSON_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

/** A single lesson, addressed by its own id. */
@Controller('admin/lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonService) {}

  /** Finds lessons by title, with course and module, for choosing related lessons. Declared before ':lessonId' so it is never read as an id. */
  @Get('search')
  @Roles(...READ_ROLES)
  async search(@Query('q') q?: string, @Query('exclude') exclude?: string) {
    const text = (q ?? '').trim();
    if (text.length < 2) return { items: [] };
    const items = await this.lessons.searchLessons(text, exclude && /^[0-9a-f-]{36}$/i.test(exclude) ? exclude : null);
    return { items };
  }

  /** Context of specific lessons by id (comma-separated), for a Continue Exploring block. Declared before ':lessonId'. */
  @Get('lookup')
  @Roles(...READ_ROLES)
  async lookup(@Query('ids') ids?: string) {
    const list = (ids ?? '').split(',').map((id) => id.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    return { items: await this.lessons.lookupLessons(list) };
  }

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

  /** Creates a separate Draft copy of the lesson's saved content in the same course/module, at the end of its group. */
  @Post(':lessonId/duplicate')
  @Roles(...WRITE_ROLES)
  async duplicate(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: DuplicateLessonDto,
  ): Promise<LessonResponseDto> {
    return LessonResponseDto.from(
      await this.lessons.duplicate(lessonId, dto.title),
    );
  }

  @Get(':lessonId/related')
  @Roles(...READ_ROLES)
  async related(@Param('lessonId', ParseUUIDPipe) lessonId: string): Promise<RelatedLessonsResponseDto> {
    return this.lessons.getRelated(lessonId);
  }

  /** Replaces the lesson's related lessons (manual links, in order). Counts as an edit of the lesson (Draft, version check). */
  @Put(':lessonId/related')
  @Roles(...WRITE_ROLES)
  async setRelated(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: SetRelatedLessonsDto,
  ): Promise<RelatedLessonsResponseDto> {
    return this.lessons.setRelated(lessonId, { lessonIds: dto.lessonIds, links: dto.links }, dto.version);
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
