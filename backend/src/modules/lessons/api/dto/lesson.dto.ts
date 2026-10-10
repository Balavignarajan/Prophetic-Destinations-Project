import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LEARNING_LEVELS } from '../../../../shared-kernel/index.js';
import { LIMITS, MAX_ESTIMATED_MINUTES } from '../../domain/lesson-rules.js';
import type { Lesson } from '../../domain/models.js';

/** Trims string input before validation so whitespace-only values count as empty. */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

const COVER_MESSAGE =
  'coverMediaId can only be null until the Media module exists';

export class CreateLessonDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.title)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.shortTitle)
  shortTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.subtitle)
  subtitle?: string | null;

  /** Plain multi-paragraph text. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.introduction)
  introduction?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ESTIMATED_MINUTES)
  estimatedMinutes?: number | null;

  @IsOptional()
  @Equals(null, { message: COVER_MESSAGE })
  coverMediaId?: null;

  /** Levels the lesson is available at. Omit for none yet. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LEARNING_LEVELS.length)
  @ArrayUnique()
  @IsIn(LEARNING_LEVELS, { each: true })
  levels?: string[];

  /** 1-based. Inserts at that position and pushes later lessons down. Omit to append. */
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}

export class UpdateLessonDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.title)
  title?: string;

  /** null clears the field. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.shortTitle)
  shortTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.subtitle)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.introduction)
  introduction?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ESTIMATED_MINUTES)
  estimatedMinutes?: number | null;

  @IsOptional()
  @Equals(null, { message: COVER_MESSAGE })
  coverMediaId?: null;

  /** The version the editor last saw; if it is stale the update is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class SetLessonLevelsDto {
  /** The complete set of levels the lesson is available at (may be empty). */
  @IsArray()
  @ArrayMaxSize(LEARNING_LEVELS.length)
  @ArrayUnique()
  @IsIn(LEARNING_LEVELS, { each: true })
  levels: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ReorderLessonsDto {
  /** Every lesson id of the module, in the desired order. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  lessonIds: string[];
}

export class LessonResponseDto {
  id: string;
  moduleId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  coverMediaId: string | null;
  estimatedMinutes: number | null;
  levels: string[];
  position: number;
  status: string;
  version: number;
  /** Counts effective changes to the authoring content (including blocks); see Lesson.contentRevision. */
  contentRevision: number;
  createdAt: string;
  updatedAt: string;

  static from(lesson: Lesson): LessonResponseDto {
    return {
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: lesson.title,
      shortTitle: lesson.shortTitle,
      subtitle: lesson.subtitle,
      introduction: lesson.introduction,
      coverMediaId: lesson.coverMediaId,
      estimatedMinutes: lesson.estimatedMinutes,
      levels: lesson.levels,
      position: lesson.position,
      status: lesson.status,
      version: lesson.version,
      contentRevision: lesson.contentRevision,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }
}

export class LessonListResponseDto {
  items: LessonResponseDto[];

  static from(lessons: Lesson[]): LessonListResponseDto {
    return { items: lessons.map((lesson) => LessonResponseDto.from(lesson)) };
  }
}
