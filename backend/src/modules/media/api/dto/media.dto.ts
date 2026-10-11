import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { MediaAsset } from '../../domain/models.js';

export class ListMediaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** The only media fields the API returns: no storage key, no path. */
export class MediaResponseDto {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;

  static from(asset: MediaAsset): MediaResponseDto {
    return {
      id: asset.id,
      originalFilename: asset.originalFilename,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt.toISOString(),
    };
  }
}

export class MediaListResponseDto {
  items: MediaResponseDto[];
  total: number;
  limit: number;
  offset: number;
}
