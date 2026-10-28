import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LEARNING_LEVELS, type LearningLevel } from '../../../../shared-kernel/index.js';
import type { HomeEntry } from '../../domain/models.js';
import { HOME_ENTRY_DESCRIPTION_MAX_LENGTH, HOME_ENTRY_TITLE_MAX_LENGTH } from '../../domain/home-entry-rules.js';
import { Trim } from './text-fields.js';

/** Enough for any realistic Home (there is no product limit), and a bound on a single request body. */
const MAX_ENTRIES_PER_REQUEST = 10000;

export class CreateHomeEntryDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HOME_ENTRY_TITLE_MAX_LENGTH)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(HOME_ENTRY_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** A media-library image id for the card; null / omitted = none (the learner app then shows the cover of the first published course). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  imageMediaId?: string | null;

  /** Defaults to true. */
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /** 1-based place on Home; omitted = at the end. */
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  /** The learning levels that see the entry on Home: at least one, each at most once. Omitted = all three. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(LEARNING_LEVELS as unknown as string[], { each: true })
  visibleLevels?: LearningLevel[];
}

export class UpdateHomeEntryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HOME_ENTRY_TITLE_MAX_LENGTH)
  title?: string;

  /** null clears the description. */
  @IsOptional()
  @IsString()
  @MaxLength(HOME_ENTRY_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** null = no card image (the image itself is never deleted). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  imageMediaId?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /** The learning levels that see the entry on Home: at least one, each at most once. Omitted = leave the choice as it is. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(LEARNING_LEVELS as unknown as string[], { each: true })
  visibleLevels?: LearningLevel[];

  /** The version the editor last saw; if it is stale the update is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ReorderHomeEntriesDto {
  /** Every entry id, in the desired order. */
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @IsUUID('all', { each: true })
  entryIds: string[];

  /** The full order the editor last saw; if it is stale the reorder is refused (409). */
  @IsArray()
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @IsUUID('all', { each: true })
  previousEntryIds: string[];
}

export class HomeEntryResponseDto {
  id: string;
  title: string;
  description: string | null;
  imageMediaId: string | null;
  position: number;
  isEnabled: boolean;
  /** The learning levels the administrators chose to show this entry at (all three unless a choice was made). Not a promise that learners see it: that also needs a published course. */
  visibleLevels: LearningLevel[];
  version: number;
  /** How many courses are assigned to this entry (any status). 0 = "No courses assigned" in the CMS. */
  courseCount: number;
  /** The assigned courses in the course order, with their status, so the CMS can show which are published. */
  courses: { id: string; title: string; status: string }[];
  createdAt: string;
  updatedAt: string;

  static from(entry: HomeEntry): HomeEntryResponseDto {
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      imageMediaId: entry.imageMediaId,
      position: entry.position,
      isEnabled: entry.isEnabled,
      visibleLevels: entry.visibleLevels,
      version: entry.version,
      courseCount: entry.courseCount,
      courses: entry.courses.map((course) => ({ id: course.id, title: course.title, status: course.status })),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}

/** The whole list in Home order (also the response of a reorder). */
export class HomeEntryListResponseDto {
  items: HomeEntryResponseDto[];
}
