import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTENT_STATUSES, type ContentStatus, type LearningLevel } from '../../../../shared-kernel/index.js';
import {
  ASSESSMENT_LIMITS,
  type LevelPoints,
  type PublicAssessment,
  QUESTION_TYPES,
  type QuestionType,
  type ScoringConfig,
} from '../../domain/assessment-rules.js';
import type { AssessmentAction } from '../../domain/assessment-workflow.js';
import type { AssessmentDetail, TransitionResult } from '../../application/assessment.service.js';
import type { SubmissionResult } from '../../application/assessment-delivery.service.js';
import type { AssessmentSummary, Publication, WorkflowEvent } from '../../persistence/assessment.repository.js';

/** Surrounding whitespace is not content; whether what remains is empty is decided by the rules (422). */
const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

// ================================================================================================================================== admin: requests

export class OptionInputDto {
  /** Send the option's id when it already exists (it is kept); omit it for a new option. */
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @Trim()
  @IsString()
  @MaxLength(ASSESSMENT_LIMITS.optionTextMax * 2)
  text: string;

  /** Points this answer gives to each level. All three levels are required, each a whole number from 0 to 100: { "BEGINNER": 0, "INTERMEDIATE": 2, "ADVANCED": 1 }. */
  @IsObject()
  scores: Record<LearningLevel, number>;
}

export class QuestionInputDto {
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @IsOptional()
  @IsIn(QUESTION_TYPES as unknown as string[])
  type?: QuestionType;

  @Trim()
  @IsString()
  @MaxLength(ASSESSMENT_LIMITS.promptMax * 2)
  prompt: string;

  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.optionsMax * 2)
  @ValidateNested({ each: true })
  @Type(() => OptionInputDto)
  options: OptionInputDto[];
}

/** The complete content of the working copy (a save replaces everything), plus the version the editor saw. */
export class SaveAssessmentDto {
  @Trim()
  @IsString()
  @MaxLength(ASSESSMENT_LIMITS.titleMax * 2)
  title: string;

  /** The instructions shown before the first question. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(ASSESSMENT_LIMITS.descriptionMax * 2)
  description?: string | null;

  /** { strategy: 'LEVEL_POINTS', tieBreak: 'LOWER_LEVEL' | 'HIGHER_LEVEL', requireAllQuestions: boolean, resultMessages?: { BEGINNER?, ... } }. null/absent = not configured. */
  @IsOptional()
  @IsObject()
  scoringConfig?: unknown;

  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.questionsMax * 2)
  @ValidateNested({ each: true })
  @Type(() => QuestionInputDto)
  questions: QuestionInputDto[];

  /** The version the editor last saw; if it is stale the save is refused (409). Ignored on create. */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ListAssessmentsQueryDto {
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

  @IsOptional()
  @IsIn(CONTENT_STATUSES as unknown as string[])
  status?: ContentStatus;
}

export class ReorderQuestionsDto {
  /** Every question id, in the desired order. */
  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.questionsMax)
  @IsUUID('all', { each: true })
  questionIds: string[];

  /** The order the editor last saw; if sent and stale, 409 and nothing changes. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.questionsMax)
  @IsUUID('all', { each: true })
  previousQuestionIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ReorderOptionsDto {
  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.optionsMax)
  @IsUUID('all', { each: true })
  optionIds: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.optionsMax)
  @IsUUID('all', { each: true })
  previousOptionIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class TransitionDto {
  /** Required (and shown to the author) when requesting changes. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string | null;

  /** The assessment `version` the actor was looking at; a stale one is refused (409). */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class EventsQueryDto {
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

// ================================================================================================================================ admin: responses

export class PublicationDto {
  id: string;
  assessmentId: string;
  /** The version number clients receive and send back. */
  version: number;
  contentHash: string;
  publishedBy: string;
  publishedAt: string;
  active: boolean;
  endedAt: string | null;
  endedReason: 'SUPERSEDED' | 'UNPUBLISHED' | null;

  static from(p: Publication): PublicationDto {
    return {
      id: p.id,
      assessmentId: p.assessmentId,
      version: p.version,
      contentHash: p.contentHash,
      publishedBy: p.publishedBy,
      publishedAt: p.publishedAt.toISOString(),
      active: p.endedAt === null,
      endedAt: p.endedAt ? p.endedAt.toISOString() : null,
      endedReason: p.endedReason,
    };
  }
}

export class AssessmentSummaryDto {
  id: string;
  title: string;
  status: ContentStatus;
  /** Edit version of the working copy (the concurrency token). */
  version: number;
  questionCount: number;
  /** A scoring configuration is saved (publishing also needs it to be valid and the content complete). */
  scoringConfigured: boolean;
  /** The published version learners get now, if this assessment has one. */
  activePublishedVersion: number | null;
  latestPublishedVersion: number | null;
  createdAt: string;
  updatedAt: string;

  static from(a: AssessmentSummary): AssessmentSummaryDto {
    return {
      id: a.id,
      title: a.title,
      status: a.status,
      version: a.version,
      questionCount: a.questionCount,
      scoringConfigured: a.scoringConfig !== null,
      activePublishedVersion: a.activeVersion,
      latestPublishedVersion: a.latestVersion,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}

export class AssessmentListResponseDto {
  items: AssessmentSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export class AssessmentDetailDto {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  version: number;
  scoringConfig: ScoringConfig | null;
  questions: {
    id: string;
    position: number;
    type: QuestionType;
    prompt: string;
    options: { id: string; position: number; text: string; scores: LevelPoints }[];
  }[];
  activePublication: PublicationDto | null;
  latestPublishedVersion: number | null;
  /** What the caller may do now, by role and status. */
  allowedActions: AssessmentAction[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  static from(d: AssessmentDetail): AssessmentDetailDto {
    const a = d.assessment;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      status: a.status,
      version: a.version,
      scoringConfig: a.scoringConfig,
      questions: a.questions.map((q) => ({
        id: q.id,
        position: q.position,
        type: q.type,
        prompt: q.prompt,
        options: q.options.map((o) => ({ id: o.id, position: o.position, text: o.text, scores: o.scores })),
      })),
      activePublication: d.activePublication ? PublicationDto.from(d.activePublication) : null,
      latestPublishedVersion: d.latestVersion,
      allowedActions: d.allowedActions,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}

export class WorkflowEventDto {
  id: string;
  action: AssessmentAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  actorRole: string;
  note: string | null;
  assessmentVersion: number;
  publicationId: string | null;
  createdAt: string;

  static from(e: WorkflowEvent): WorkflowEventDto {
    return {
      id: e.id,
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorAdminId: e.actorAdminId,
      actorRole: e.actorRole,
      note: e.note,
      assessmentVersion: e.assessmentVersion,
      publicationId: e.publicationId,
      createdAt: e.createdAt.toISOString(),
    };
  }
}

export class TransitionResponseDto {
  assessmentId: string;
  fromStatus: ContentStatus;
  status: ContentStatus;
  version: number;
  event: WorkflowEventDto;
  publication: PublicationDto | null;
  supersededPublication: PublicationDto | null;

  static from(r: TransitionResult): TransitionResponseDto {
    return {
      assessmentId: r.assessmentId,
      fromStatus: r.fromStatus,
      status: r.status,
      version: r.version,
      event: WorkflowEventDto.from(r.event),
      publication: r.publication ? PublicationDto.from(r.publication) : null,
      supersededPublication: r.supersededPublication ? PublicationDto.from(r.supersededPublication) : null,
    };
  }
}

// ================================================================================================================================== public (learner)

export class AnswerDto {
  @IsUUID('all')
  questionId: string;

  @IsUUID('all')
  optionId: string;
}

export class SubmitAttemptDto {
  /** The published version the client rendered (from GET /assessments/active). */
  @IsInt()
  @Min(1)
  version: number;

  /** One entry per answered question (an empty list is refused by the rules with 422 NO_ANSWERS, like every other answer problem). */
  @IsArray()
  @ArrayMaxSize(ASSESSMENT_LIMITS.questionsMax)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

export type PublicAssessmentResponseDto = PublicAssessment;
export type AttemptResultResponseDto = SubmissionResult;
