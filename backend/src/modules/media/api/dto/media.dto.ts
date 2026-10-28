import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MEDIA_METADATA_LIMITS } from '../../domain/metadata.js';
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

  /** Part of the file name, the title or a tag (case-insensitive). Internal rights notes are never searched. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Only assets of this exact stored type (for pickers that accept one kind of file, such as animated WebP, MP4 video, Lottie JSON or a GLB 3D model), or `image/*` for any image. */
  @IsOptional()
  @IsIn(['image/webp', 'video/mp4', 'application/json', 'model/gltf-binary', 'image/*'])
  contentType?: string;
}

/**
 * Changes the descriptive metadata. `version` is the metadata version the editor last saw (required: a stale one is refused with 409, so nothing is
 * silently overwritten). Send the COMPLETE metadata: an omitted or blank text field clears it, and `tags` replaces the list.
 */
export class UpdateMediaMetadataDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MEDIA_METADATA_LIMITS.title * 2)
  title?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MEDIA_METADATA_LIMITS.altText * 2)
  altText?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MEDIA_METADATA_LIMITS.caption * 2)
  caption?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MEDIA_METADATA_LIMITS.source * 2)
  source?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MEDIA_METADATA_LIMITS.rightsNotes * 2)
  rightsNotes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MEDIA_METADATA_LIMITS.maxTags * 2)
  @IsString({ each: true })
  tags?: string[];
}

export class MediaUsageQueryDto {
  /** How many places to list per group (default 50, at most 200). Lists cut at this number say so; the exact totals are always returned. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** The only media fields the API returns: no storage key, no path. `rightsNotes` appears here because this API is admin-only; it never reaches a learner endpoint. */
export class MediaResponseDto {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  source: string | null;
  rightsNotes: string | null;
  tags: string[];
  /** Send this back as `version` when changing the metadata. */
  version: number;

  static from(asset: MediaAsset): MediaResponseDto {
    return {
      id: asset.id,
      originalFilename: asset.originalFilename,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt.toISOString(),
      title: asset.title,
      altText: asset.altText,
      caption: asset.caption,
      source: asset.source,
      rightsNotes: asset.rightsNotes,
      tags: asset.tags,
      version: asset.metadataVersion,
    };
  }
}

export class MediaListResponseDto {
  items: MediaResponseDto[];
  total: number;
  limit: number;
  offset: number;
}
