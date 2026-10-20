import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LEARNING_LEVELS } from '../../../../shared-kernel/index.js';
import { LIMITS, MAX_ESTIMATED_MINUTES } from '../../domain/lesson-rules.js';
import type { Lesson } from '../../domain/models.js';

/** Trims string input before validation so whitespace-only values count as empty. */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class DuplicateLessonDto {
  /** Title of the copy; defaults to "Copy of [original title]". */
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.title)
  title?: string;

  /**
   * Where the copy goes. Omit both to copy next to the original (the previous behaviour). `courseId` alone = directly in that course; with
   * `moduleId` = in that module (which must belong to the course).
   */
  @IsOptional()
  @IsUUID('all')
  courseId?: string;

  @IsOptional()
  @IsUUID('all')
  moduleId?: string;
}

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

  /** A media-library image id; null = no cover (on update, null removes the cover but never deletes the image). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  coverMediaId?: string | null;

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

/** One related link as authored: the target plus the link's own optional label and level visibility. */
export class RelatedLinkInputDto {
  @IsUUID('all')
  lessonId: string;

  /** Plain-text custom label (proposed limit 120). Null, empty or absent = use the target lesson's published title. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  label?: string | null;

  /** Levels the link is shown at. Null or absent = every level (the previous behaviour). Otherwise at least one. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(LEARNING_LEVELS, { each: true })
  levels?: string[] | null;
}

/**
 * The complete, ordered list of related lessons (may be empty). Send `links` (target, label, levels). `lessonIds` alone is still accepted from
 * older clients: it keeps the stored label and levels of every link that stays and gives new links no label and all levels.
 */
export class SetRelatedLessonsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  lessonIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RelatedLinkInputDto)
  links?: RelatedLinkInputDto[];

  /** The version the editor last saw; if it is stale the change is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class RelatedLessonItemDto {
  id: string;
  title: string;
  status: string;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  /** The link's custom label, or null = the target's published title is used. */
  label: string | null;
  /** The levels the link is shown at, or null = every level. */
  levels: string[] | null;
}

export class RelatedLessonsResponseDto {
  items: RelatedLessonItemDto[];
  /** The source lesson's version after the change (for the next save). */
  lessonVersion: number;
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
  /** null = a standalone library lesson. */
  courseId: string | null;
  moduleId: string | null;
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
      courseId: lesson.courseId,
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
