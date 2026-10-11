import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../platform/public.decorator.js';
import { CatalogDeliveryService } from '../application/catalog-delivery.service.js';
import {
  CourseListResponseDto,
  CourseResponseDto,
} from './dto/catalog-delivery.dto.js';
import { LessonDeliveryQueryDto } from './dto/lesson-delivery.dto.js';
import { respond } from './respond.js';

/**
 * The anonymous learner catalog: published courses at one level, and one course with its modules and lessons.
 * Same rules as the lesson endpoint: @Public() skips authentication only, the rate limiter is an explicit guard,
 * every response starts as `no-store` (see no-store.middleware.ts) and only a 200/304 relaxes it, and ETag +
 * `If-None-Match` follow RFC 9110. Read-only; it never reads authoring data.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('courses')
export class CourseDeliveryController {
  constructor(private readonly catalog: CatalogDeliveryService) {}

  /** Published courses with something to show at `level`, in the order they were first published. */
  @Get()
  async list(
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CourseListResponseDto | undefined> {
    return respond(
      res,
      await this.catalog.listCourses(query.level, ifNoneMatch),
    );
  }

  /** One published course at `level`; 404 if it is not published or has nothing eligible at that level. */
  @Get(':courseId')
  async get(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CourseResponseDto | undefined> {
    return respond(
      res,
      await this.catalog.getCourse(courseId, query.level, ifNoneMatch),
    );
  }
}
