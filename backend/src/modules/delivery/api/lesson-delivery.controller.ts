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
import { LessonDeliveryService } from '../application/lesson-delivery.service.js';
import { NavigationResponseDto } from './dto/catalog-delivery.dto.js';
import {
  LessonDeliveryQueryDto,
  LessonSnapshotResponseDto,
} from './dto/lesson-delivery.dto.js';
import { PUBLISHED_CACHE_CONTROL, respond } from './respond.js';

/** Kept under its old name for the lesson endpoint; the policy itself lives in respond.ts. */
export const LESSON_CACHE_CONTROL = PUBLISHED_CACHE_CONTROL;

/**
 * The anonymous learner endpoint. @Public() skips authentication only; the rate limiter below is
 * an explicit guard on this controller, so it applies to every caller, authenticated or not.
 * Read-only, and it never reads authoring data: see LessonDeliveryService.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('lessons')
export class LessonDeliveryController {
  constructor(
    private readonly delivery: LessonDeliveryService,
    private readonly catalog: CatalogDeliveryService,
  ) {}

  /**
   * The active published snapshot of one lesson at one level, with a strong ETag.
   * 200 with the envelope; 304 when `If-None-Match` matches; 400 for a bad id or level;
   * 404 for anything that is not currently published at that level; 429 when rate limited.
   */
  @Get(':lessonId')
  async get(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LessonSnapshotResponseDto | undefined> {
    const result = await this.delivery.getLessonSnapshot(
      lessonId,
      query.level,
      ifNoneMatch,
    );

    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', LESSON_CACHE_CONTROL);
    if (result.kind === 'NOT_MODIFIED') {
      res.status(304);
      return undefined;
    }
    return result.envelope;
  }

  /**
   * The previous and next eligible lesson of a deliverable lesson, within its published course (see the
   * architecture notes). The lesson endpoint's envelope is unchanged; the course id lives only here.
   * 404 for anything that is not deliverable at that level or has no place in a published catalog.
   */
  @Get(':lessonId/navigation')
  async navigation(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<NavigationResponseDto | undefined> {
    return respond(
      res,
      await this.catalog.getNavigation(lessonId, query.level, ifNoneMatch),
    );
  }
}
