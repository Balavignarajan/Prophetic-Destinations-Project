import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { Course } from '../../domain/models.js';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../../domain/text-rules.js';
import { Trim } from './text-fields.js';

export class CreateCourseDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TITLE_MAX_LENGTH)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** A media-library image id; null = no cover (on update, null removes the cover but never deletes the image). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  coverMediaId?: string | null;
}

export class UpdateCourseDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  /** null clears the description. */
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** A media-library image id; null = no cover (on update, null removes the cover but never deletes the image). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  coverMediaId?: string | null;

  /** The version the editor last saw; if it is stale the update is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ListCoursesQueryDto {
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

export class ReorderCoursesDto {
  /** Every course id, in the desired order. */
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  courseIds: string[];

  /** The full order the editor last saw; if it is stale the reorder is refused (409). */
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  previousCourseIds: string[];
}

export class CourseResponseDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  coverMediaId: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;

  static from(course: Course): CourseResponseDto {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      coverMediaId: course.coverMediaId,
      position: course.position,
      version: course.version,
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  }
}

export class CourseOrderResponseDto {
  items: CourseResponseDto[];
}

export class CourseListResponseDto {
  items: CourseResponseDto[];
  total: number;
  limit: number;
  offset: number;
}
