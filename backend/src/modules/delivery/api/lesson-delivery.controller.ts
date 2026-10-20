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
import { LessonDeliveryService } from '../application/lesson-delivery.service.js';
import { LessonMediaDeliveryService } from '../application/lesson-media-delivery.service.js';
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
    private readonly media: LessonMediaDeliveryService,
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
  /**
   * The related lessons chosen by the author, limited to those a learner can open right now at this level. 404 when the lesson itself is not
   * deliverable. A related lesson that is not deliverable is left out entirely (no title, no placeholder).
   */
  @Get(':lessonId/related')
  async related(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(res, await this.catalog.getRelated(lessonId, query.level, ifNoneMatch));
  }

  /**
   * The targets of one Continue Exploring block, limited to those a learner can open right now at this level (same rules as the related list; a
   * hidden or unpublished target is left out together with its label). 404 when the lesson or the block is not deliverable at this level.
   */
  @Get(':lessonId/explore/:blockId')
  async exploring(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(res, await this.catalog.getExploring(lessonId, blockId, query.level, ifNoneMatch));
  }

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

  /**
   * One image of a published lesson, for the learner app. Served only when the lesson's active published snapshot at that
   * level contains an IMAGE block pointing at this asset; everything else is the same 404 (see LessonMediaDeliveryService).
   * The type is the one detected from the bytes at upload; the response may not run script.
   */
  @Get(':lessonId/media/:mediaId')
  async image(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const result = await this.media.getImage(
      lessonId,
      mediaId,
      query.level,
      ifNoneMatch,
    );
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
}
