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
import { LessonDeliveryService } from '../application/lesson-delivery.service.js';
import {
  LessonDeliveryQueryDto,
  LessonSnapshotResponseDto,
} from './dto/lesson-delivery.dto.js';

/**
 * Freshness policy of a published lesson: it MAY be stored by a cache but must be revalidated
 * (with the ETag) before every reuse. Published snapshots never change, so revalidation is cheap
 * (a 304 with no body), and a withdrawn lesson stops being served on the very next request instead
 * of lingering for a freshness lifetime. Errors are `no-store` (see no-store.middleware.ts).
 */
export const LESSON_CACHE_CONTROL = 'public, no-cache';

/**
 * The anonymous learner endpoint. @Public() skips authentication only; the rate limiter below is
 * an explicit guard on this controller, so it applies to every caller, authenticated or not.
 * Read-only, and it never reads authoring data: see LessonDeliveryService.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('lessons')
export class LessonDeliveryController {
  constructor(private readonly delivery: LessonDeliveryService) {}

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
}
