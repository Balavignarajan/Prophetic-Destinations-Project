import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { CourseModule } from '../../domain/models.js';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../../domain/text-rules.js';
import { Trim } from './text-fields.js';

export class CreateModuleDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TITLE_MAX_LENGTH)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** 1-based. Inserts at that position and pushes later modules down. Omit to append. */
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}

export class UpdateModuleDto {
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

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ReorderModulesDto {
  /** Every module id of the course, in the desired order. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  moduleIds: string[];
}

export class ModuleResponseDto {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;

  static from(module: CourseModule): ModuleResponseDto {
    return {
      id: module.id,
      courseId: module.courseId,
      title: module.title,
      description: module.description,
      status: module.status,
      position: module.position,
      version: module.version,
      createdAt: module.createdAt.toISOString(),
      updatedAt: module.updatedAt.toISOString(),
    };
  }
}

export class ModuleListResponseDto {
  items: ModuleResponseDto[];

  static from(modules: CourseModule[]): ModuleListResponseDto {
    return { items: modules.map((module) => ModuleResponseDto.from(module)) };
  }
}
