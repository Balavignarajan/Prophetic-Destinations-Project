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
import { HomeEntryCoursesResponseDto, HomeEntryListResponseDto } from './dto/home-entry-delivery.dto.js';
import { LessonDeliveryQueryDto } from './dto/lesson-delivery.dto.js';
import { PUBLISHED_CACHE_CONTROL, respond } from './respond.js';

/**
 * The anonymous learner Home: the topics the administrators set up, and the courses in each, filtered to what this learner can open. Same rules as the course catalog: @Public() skips authentication
 * only, the rate limiter is an explicit guard, every response starts as `no-store` (see no-store.middleware.ts) and only a 200/304 relaxes it, and ETag + `If-None-Match`
 * follow RFC 9110. Read-only; it never reads authoring data and never exposes a draft, unpublished or level-less course.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('home-entries')
export class HomeEntryDeliveryController {
  constructor(
    private readonly catalog: CatalogDeliveryService,
    private readonly media: LessonMediaDeliveryService,
  ) {}

  /** The Home topics available at `level`, in the administrators' order. An empty `entries` list is a normal answer. */
  @Get()
  async list(
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HomeEntryListResponseDto | undefined> {
    return respond(res, await this.catalog.listHomeEntries(query.level, ifNoneMatch));
  }

  /**
   * The courses a learner can open in this Home Entry at `level`: its published courses with lessons at that level, exactly as `GET /courses?level=` lists them and in the same
   * order. 404 (one answer for all) if the entry is unknown, disabled, or has no eligible course at that level.
   */
  @Get(':entryId/courses')
  async courses(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HomeEntryCoursesResponseDto | undefined> {
    return respond(res, await this.catalog.getHomeEntryCourses(entryId, query.level, ifNoneMatch));
  }

  /** The card's own picture (only while the entry is visible at that level and uses exactly this asset; otherwise 404). */
  @Get(':entryId/media/:mediaId')
  async image(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Query() query: LessonDeliveryQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const result = await this.media.getHomeEntryImage(entryId, mediaId, query.level, ifNoneMatch);
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
