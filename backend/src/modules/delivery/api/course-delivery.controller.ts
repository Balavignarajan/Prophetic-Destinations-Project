import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../platform/public.decorator.js';
import { CatalogDeliveryService } from '../application/catalog-delivery.service.js';
import { LessonMediaDeliveryService } from '../application/lesson-media-delivery.service.js';
import {
  CourseListResponseDto,
  CourseResponseDto,
} from './dto/catalog-delivery.dto.js';
import { LessonDeliveryQueryDto } from './dto/lesson-delivery.dto.js';
import { PUBLISHED_CACHE_CONTROL, respond } from './respond.js';

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
  constructor(
    private readonly catalog: CatalogDeliveryService,
    private readonly media: LessonMediaDeliveryService,
  ) {}

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

  /** The published cover of a course (only the asset named by the active catalog snapshot; otherwise 404). */
  @Get(':courseId/media/:mediaId')
  async cover(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const result = await this.media.getCourseCover(courseId, mediaId, query.level, ifNoneMatch);
    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', PUBLISHED_CACHE_CONTROL);
    if (result.kind === 'NOT_MODIFIED') {
      res.status(304);
      return undefined;
    }
    const { asset, stream } = result.content;
    res.set({
      'Content-Type': asset.contentType,
      'Content-Length': String(asset.sizeBytes),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(stream);
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
