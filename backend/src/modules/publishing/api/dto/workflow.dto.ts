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
import { PublicationDto } from './publication.dto.js';

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
  /** The publication a publish created or an unpublish ended. */
  publicationId: string | null;
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
      publicationId: event.publicationId,
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
  /** The version learners currently get, if any; it can exist while the working copy is edited. */
  activePublication: PublicationDto | null;
  latestEvent: WorkflowEventDto | null;

  static from(state: WorkflowState): WorkflowStateDto {
    return {
      lessonId: state.lessonId,
      status: state.status,
      contentRevision: state.contentRevision,
      allowedActions: state.allowedActions,
      activePublication: state.activePublication
        ? PublicationDto.from(state.activePublication)
        : null,
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
  /** Publish: the new version. Unpublish: the version that was ended. Absent for review actions. */
  publication?: PublicationDto;
  /** Publish only: the version that the new one replaced. */
  supersededVersion?: number;

  static from(result: TransitionResult): TransitionResponseDto {
    return {
      lessonId: result.lessonId,
      fromStatus: result.fromStatus,
      status: result.status,
      contentRevision: result.contentRevision,
      event: WorkflowEventDto.from(result.event),
      ...(result.publication
        ? { publication: PublicationDto.from(result.publication) }
        : {}),
      ...(result.supersededPublication
        ? { supersededVersion: result.supersededPublication.version }
        : {}),
    };
  }
}
