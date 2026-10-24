import { IsInt, Min } from 'class-validator';
import type { LearningLevel } from '../../../../shared-kernel/index.js';
import type { DraftRevisionSummary } from '../../domain/lesson-revisions.js';
import type { RestoreResult, RevisionHistory } from '../../application/lesson-revision.service.js';
import { LessonResponseDto } from './lesson.dto.js';

/** Restores a stored draft revision as the lesson's current draft. */
export class RestoreRevisionDto {
  /**
   * The lesson's `contentRevision` as the editor last saw it (the one the history reported). REQUIRED: if the lesson has changed since, the restore is refused (409) and
   * nothing changes, so two editors cannot overwrite each other.
   */
  @IsInt()
  @Min(1)
  expectedContentRevision: number;
}

export class LessonRevisionItemDto {
  id: string;
  /** The lesson's content revision at that state. */
  contentRevision: number;
  /** When that state was last changed. */
  savedAt: string;
  /** When this copy was stored. */
  capturedAt: string;
  title: string;
  blockCount: number;
  levels: LearningLevel[];
  tags: string[];
  /** Set when this state is the result of a restore: the revision it was restored from, and who did it (their email). */
  restoredFromRevision: number | null;
  restoredBy: string | null;
  /** True for the state the lesson is in now (it cannot be restored: it is already the draft). */
  isCurrent: boolean;
  /** False when the stored copy is in a format that cannot be restored. */
  restorable: boolean;

  static from(item: DraftRevisionSummary, currentContentRevision: number): LessonRevisionItemDto {
    return {
      id: item.id,
      contentRevision: item.contentRevision,
      savedAt: item.savedAt.toISOString(),
      capturedAt: item.capturedAt.toISOString(),
      title: item.title,
      blockCount: item.blockCount,
      levels: item.levels,
      tags: item.tags,
      restoredFromRevision: item.restoredFromRevision,
      restoredBy: item.restoredBy,
      isCurrent: item.contentRevision === currentContentRevision,
      restorable: item.restorable && item.contentRevision !== currentContentRevision,
    };
  }
}

export class LessonRevisionHistoryDto {
  /** Where the lesson stands now. */
  current: { contentRevision: number; status: string; updatedAt: string };
  /** Newest first. */
  items: LessonRevisionItemDto[];
  /** Every stored revision of the lesson; can be more than `items`. */
  total: number;

  static from(history: RevisionHistory): LessonRevisionHistoryDto {
    return {
      current: { contentRevision: history.current.contentRevision, status: history.current.status, updatedAt: history.current.updatedAt.toISOString() },
      items: history.items.map((item) => LessonRevisionItemDto.from(item, history.current.contentRevision)),
      total: history.total,
    };
  }
}

export class RestoreRevisionResponseDto {
  lesson: LessonResponseDto;
  /** The revision that was restored. */
  restoredFromRevision: number;
  /** The revision under which the draft that was replaced is kept (restore it to undo this). */
  keptRevision: number;

  static from(result: RestoreResult): RestoreRevisionResponseDto {
    return { lesson: LessonResponseDto.from(result.lesson), restoredFromRevision: result.restoredFromRevision, keptRevision: result.keptRevision };
  }
}
