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
  Query,
} from '@nestjs/common';
import { Roles } from '../../identity/index.js';
import { CourseService } from '../application/course.service.js';
import {
  CourseListResponseDto,
  CourseResponseDto,
  CreateCourseDto,
  ListCoursesQueryDto,
  UpdateCourseDto,
} from './dto/course.dto.js';
import { DELETE_COURSE_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

const DEFAULT_LIMIT = 50;

/** Thin HTTP layer for courses: parse, call CourseService, shape the response. */
@Controller('admin/courses')
export class CoursesController {
  constructor(private readonly courses: CourseService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(@Body() dto: CreateCourseDto): Promise<CourseResponseDto> {
    return CourseResponseDto.from(await this.courses.create(dto));
  }

  @Get()
  @Roles(...READ_ROLES)
  async list(
    @Query() query: ListCoursesQueryDto,
  ): Promise<CourseListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.courses.list(limit, offset);
    return {
      items: items.map((course) => CourseResponseDto.from(course)),
      total,
      limit,
      offset,
    };
  }

  @Get(':courseId')
  @Roles(...READ_ROLES)
  async get(
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<CourseResponseDto> {
    return CourseResponseDto.from(await this.courses.get(courseId));
  }

  @Patch(':courseId')
  @Roles(...WRITE_ROLES)
  async update(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseResponseDto> {
    return CourseResponseDto.from(await this.courses.update(courseId, dto));
  }

  /** Refused with 409 while the course still has modules. */
  @Delete(':courseId')
  @Roles(...DELETE_COURSE_ROLES)
  @HttpCode(204)
  async delete(
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<void> {
    await this.courses.delete(courseId);
  }
}
