import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  CatalogTransitionResult,
  CatalogWorkflowState,
} from '../../application/catalog-workflow.service.js';
import type { PublishedModuleEntry } from '../../domain/catalog-snapshot.js';
import type {
  CatalogLevelSnapshot,
  CatalogPublication,
  CatalogWorkflowEvent,
  PublicationEndReason,
} from '../../domain/models.js';
import { NOTE_MAX_LENGTH } from '../../domain/notes.js';

/** Trims string input before validation so whitespace-only values count as empty. */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Body of submit, approve, publish and unpublish for a course or module: both fields are optional. */
export class CatalogTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;

  /** The `version` of the course/module you were looking at; if it moved meanwhile the request is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

/** Body of request-changes: a note saying what needs to change is mandatory. */
export class CatalogRequestChangesDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_MAX_LENGTH)
  note: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class CatalogEventDto {
  id: string;
  courseId: string;
  /** Null for a course's own transition. */
  moduleId: string | null;
  action: string;
  fromStatus: string;
  toStatus: string;
  actor: { adminId: string; role: string };
  note: string | null;
  /** The course's / module's own version at the time. */
  subjectVersion: number;
  /** The catalog version this action created (publish, module actions) or ended (course unpublish). */
  publicationId: string | null;
  createdAt: string;

  static from(event: CatalogWorkflowEvent): CatalogEventDto {
    return {
      id: event.id,
      courseId: event.courseId,
      moduleId: event.moduleId,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: { adminId: event.actorAdminId, role: event.actorRole },
      note: event.note,
      subjectVersion: event.subjectVersion,
      publicationId: event.publicationId,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

export class CatalogEventListDto {
  items: CatalogEventDto[];
  total: number;
  limit: number;
  offset: number;
}

export class CatalogPublicationDto {
  id: string;
  courseId: string;
  version: number;
  active: boolean;
  /** What created this version: COURSE_PUBLISH, MODULE_PUBLISH or MODULE_UNPUBLISH. */
  cause: string;
  snapshotSchemaVersion: number;
  title: string;
  description: string | null;
  /** courses.version when this catalog version was created. */
  sourceCourseVersion: number;
  publishedAt: string;
  publishedBy: string;
  endedAt: string | null;
  endedBy: string | null;
  endedReason: PublicationEndReason | null;
  modules: PublishedModuleEntry[];
  levels: { level: string; contentHash: string; contentBytes: number }[];

  static from(publication: CatalogPublication): CatalogPublicationDto {
    return {
      id: publication.id,
      courseId: publication.courseId,
      version: publication.version,
      active: publication.endedAt === null,
      cause: publication.cause,
      snapshotSchemaVersion: publication.snapshotSchemaVersion,
      title: publication.courseTitle,
      description: publication.courseDescription,
      sourceCourseVersion: publication.sourceCourseVersion,
      publishedAt: publication.publishedAt.toISOString(),
      publishedBy: publication.publishedBy,
      endedAt: publication.endedAt?.toISOString() ?? null,
      endedBy: publication.endedBy,
      endedReason: publication.endedReason,
      modules: publication.modules.map((module) => ({ ...module })),
      levels: publication.levels.map((level) => ({ ...level })),
    };
  }
}

export class CatalogPublicationListDto {
  items: CatalogPublicationDto[];
  total: number;
  limit: number;
  offset: number;
}

/** The stored catalog snapshot of one level of one catalog version (admin view). */
export class CatalogLevelSnapshotDto {
  courseId: string;
  publicationId: string;
  version: number;
  level: string;
  contentHash: string;
  contentBytes: number;
  content: CatalogLevelSnapshot['content'];

  static from(snapshot: CatalogLevelSnapshot): CatalogLevelSnapshotDto {
    return {
      courseId: snapshot.courseId,
      publicationId: snapshot.publicationId,
      version: snapshot.version,
      level: snapshot.level,
      contentHash: snapshot.contentHash,
      contentBytes: snapshot.contentBytes,
      content: snapshot.content,
    };
  }
}

export class CatalogStateDto {
  courseId: string;
  moduleId: string | null;
  status: string;
  version: number;
  allowedActions: string[];
  published: boolean;
  activePublication: CatalogPublicationDto | null;
  latestEvent: CatalogEventDto | null;

  static from(state: CatalogWorkflowState): CatalogStateDto {
    return {
      courseId: state.courseId,
      moduleId: state.moduleId,
      status: state.status,
      version: state.version,
      allowedActions: state.allowedActions,
      published: state.published,
      activePublication: state.activePublication
        ? CatalogPublicationDto.from(state.activePublication)
        : null,
      latestEvent: state.latestEvent
        ? CatalogEventDto.from(state.latestEvent)
        : null,
    };
  }
}

export class CatalogTransitionResponseDto {
  courseId: string;
  moduleId: string | null;
  fromStatus: string;
  status: string;
  version: number;
  event: CatalogEventDto;
  /** Publish and the module actions: the catalog version created. Course unpublish: the version that ended. */
  publication?: CatalogPublicationDto;
  /** The catalog version the new one replaced. */
  supersededVersion?: number;
  /** Course publish: the modules published together with it. */
  modulesPublished?: string[];
  /** Course publish: modules left out because they are not approved, or withdrawn on purpose and not approved again. */
  modulesNotIncluded?: {
    moduleId: string;
    status: string;
    reason: 'NOT_APPROVED' | 'WITHDRAWN';
  }[];

  static from(result: CatalogTransitionResult): CatalogTransitionResponseDto {
    return {
      courseId: result.courseId,
      moduleId: result.moduleId,
      fromStatus: result.fromStatus,
      status: result.status,
      version: result.version,
      event: CatalogEventDto.from(result.event),
      ...(result.publication
        ? { publication: CatalogPublicationDto.from(result.publication) }
        : {}),
      ...(result.supersededPublication
        ? { supersededVersion: result.supersededPublication.version }
        : {}),
      ...(result.modulesPublished.length > 0
        ? { modulesPublished: result.modulesPublished }
        : {}),
      ...(result.modulesNotIncluded.length > 0
        ? { modulesNotIncluded: result.modulesNotIncluded }
        : {}),
    };
  }
}
