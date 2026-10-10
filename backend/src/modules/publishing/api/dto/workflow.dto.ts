import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  TransitionResult,
  WorkflowState,
} from '../../application/workflow.service.js';
import type { WorkflowEvent } from '../../domain/models.js';
import { NOTE_MAX_LENGTH } from '../../domain/notes.js';

/** Trims string input before validation so whitespace-only values count as empty. */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Body of submit and approve: both fields are optional. */
export class TransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;

  /** The content revision you were looking at; if it moved meanwhile the request is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedContentRevision?: number;
}

/** Body of request-changes: a note saying what needs to change is mandatory. */
export class RequestChangesDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_MAX_LENGTH)
  note: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedContentRevision?: number;
}

export class ListEventsQueryDto {
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

export class WorkflowEventDto {
  id: string;
  lessonId: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  actor: { adminId: string; role: string };
  note: string | null;
  /** The lesson's content revision when the transition happened. */
  contentRevision: number;
  createdAt: string;

  static from(event: WorkflowEvent): WorkflowEventDto {
    return {
      id: event.id,
      lessonId: event.lessonId,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: { adminId: event.actorAdminId, role: event.actorRole },
      note: event.note,
      contentRevision: event.contentRevision,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

export class WorkflowEventListDto {
  items: WorkflowEventDto[];
  total: number;
  limit: number;
  offset: number;
}

export class WorkflowStateDto {
  lessonId: string;
  status: string;
  contentRevision: number;
  allowedActions: string[];
  latestEvent: WorkflowEventDto | null;

  static from(state: WorkflowState): WorkflowStateDto {
    return {
      lessonId: state.lessonId,
      status: state.status,
      contentRevision: state.contentRevision,
      allowedActions: state.allowedActions,
      latestEvent: state.latestEvent
        ? WorkflowEventDto.from(state.latestEvent)
        : null,
    };
  }
}

export class TransitionResponseDto {
  lessonId: string;
  fromStatus: string;
  status: string;
  contentRevision: number;
  event: WorkflowEventDto;

  static from(result: TransitionResult): TransitionResponseDto {
    return {
      lessonId: result.lessonId,
      fromStatus: result.fromStatus,
      status: result.status,
      contentRevision: result.contentRevision,
      event: WorkflowEventDto.from(result.event),
    };
  }
}
