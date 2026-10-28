import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
  Roles,
} from '../../identity/index.js';
import { MediaService } from '../application/media.service.js';
import { decodeUploadedFilename } from '../domain/filename.js';
import {
  ListMediaQueryDto,
  MediaListResponseDto,
  MediaResponseDto,
  MediaUsageQueryDto,
  UpdateMediaMetadataDto,
} from './dto/media.dto.js';
import { DELETE_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

const DEFAULT_LIMIT = 50;

/** What multer hands over for the single uploaded file (kept in memory; the size limit is enforced while reading). */
interface ParsedUpload {
  buffer: Buffer;
  originalname: string;
}

/**
 * Admin media library. Nothing here is public: every route needs a signed-in admin, and the bytes are only
 * streamed to an authenticated reader (for previews in the admin tool). No response contains a storage key or path.
 */
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** multipart/form-data with the file in a field named `file`. The size limit comes from MEDIA_MAX_BYTES (MEDIA_GLB_MAX_BYTES for a GLB 3D model). */
  @Post()
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @UploadedFile() file: ParsedUpload | undefined,
  ): Promise<MediaResponseDto> {
    const uploaded = file
      ? {
          buffer: file.buffer,
          originalname: decodeUploadedFilename(file.originalname),
        }
      : undefined;
    return MediaResponseDto.from(await this.media.upload(actor.id, uploaded));
  }

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async list(@Query() query: ListMediaQueryDto): Promise<MediaListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.media.list(limit, offset, query.q, query.contentType);
    return {
      items: items.map((asset) => MediaResponseDto.from(asset)),
      total,
      limit,
      offset,
    };
  }

  /** The upload rules as configured (largest file, largest GLB 3D model, accepted types). Declared before ':mediaId' so it is never read as an id. */
  @Get('settings')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  settings(): { maxBytes: number; glbMaxBytes: number; allowedTypes: string[] } {
    return this.media.uploadRules();
  }

  @Get(':mediaId')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<MediaResponseDto> {
    return MediaResponseDto.from(await this.media.get(mediaId));
  }

  /** Changes the image's descriptive details (never the file). Stale `version` -> 409. ADMIN and EDITOR only; REVIEWER may read. */
  @Patch(':mediaId')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  async updateMetadata(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: UpdateMediaMetadataDto,
  ): Promise<MediaResponseDto> {
    return MediaResponseDto.from(await this.media.updateMetadata(mediaId, dto.version, dto));
  }

  /** Where the image is used: working and published usage with course/lesson context. Admin roles only; learner endpoints never include it. */
  @Get(':mediaId/usage')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async usage(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Query() query: MediaUsageQueryDto,
  ) {
    return this.media.usageDetail(mediaId, query.limit ?? 50);
  }

  /**
   * The stored bytes, for an authenticated reader. The type is the one detected from the bytes at upload, the browser
   * is told not to guess otherwise, and the response may not run script or be cached.
   */
  @Get(':mediaId/content')
  @Roles(...READ_ROLES)
  async content(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { asset, stream, inline } = await this.media.openContent(mediaId);
    res.set({
      'Content-Type': asset.contentType,
      'Content-Length': String(asset.sizeBytes),
      'Content-Disposition': inline ? 'inline' : 'attachment',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(stream);
  }

  @Delete(':mediaId')
  @Roles(...DELETE_ROLES)
  @HttpCode(204)
  async delete(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<void> {
    await this.media.delete(mediaId);
  }
}
