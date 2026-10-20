import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { type AuthenticatedAdmin, CurrentAdmin, Roles } from '../../identity/index.js';
import { AssessmentService } from '../application/assessment.service.js';
import {
  AssessmentDetailDto,
  AssessmentListResponseDto,
  AssessmentSummaryDto,
  EventsQueryDto,
  ListAssessmentsQueryDto,
  PublicationDto,
  ReorderOptionsDto,
  ReorderQuestionsDto,
  SaveAssessmentDto,
  TransitionDto,
  TransitionResponseDto,
  WorkflowEventDto,
} from './dto/assessment.dto.js';
import { ACTION_ROLES, READ_ROLES, WRITE_ROLES } from './roles.js';

const DEFAULT_LIMIT = 50;

/**
 * Staff management of assessments. Responses include each answer's points per level (the scoring), so none of them is ever cached (no-store is set by the module middleware). The learner-facing API is
 * separate (public-assessments.controller.ts) and never exposes any of this.
 */
@Controller('admin/assessments')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentService) {}

  /** Creates a DRAFT assessment from the complete content. Everything except the title may be incomplete while drafting. */
  @Post()
  @Roles(...WRITE_ROLES)
  async create(@CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: SaveAssessmentDto): Promise<AssessmentDetailDto> {
    const id = await this.assessments.create(actor, dto);
    return AssessmentDetailDto.from(await this.assessments.get(id, actor.role));
  }

  @Get()
  @Roles(...READ_ROLES)
  async list(@Query() query: ListAssessmentsQueryDto): Promise<AssessmentListResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.assessments.list(limit, offset, query.status);
    return { items: items.map((a) => AssessmentSummaryDto.from(a)), total, limit, offset };
  }

  @Get(':assessmentId')
  @Roles(...READ_ROLES)
  async get(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin): Promise<AssessmentDetailDto> {
    return AssessmentDetailDto.from(await this.assessments.get(id, actor.role));
  }

  /** Replaces the working copy (ids that are sent are kept) and returns it to DRAFT. What learners get is unaffected until it is published again. */
  @Put(':assessmentId')
  @Roles(...WRITE_ROLES)
  async update(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: SaveAssessmentDto): Promise<AssessmentDetailDto> {
    await this.assessments.update(id, dto, dto.version);
    return AssessmentDetailDto.from(await this.assessments.get(id, actor.role));
  }

  @Put(':assessmentId/questions/order')
  @Roles(...WRITE_ROLES)
  async reorderQuestions(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: ReorderQuestionsDto): Promise<AssessmentDetailDto> {
    await this.assessments.reorderQuestions(id, dto.questionIds, dto.previousQuestionIds, dto.version);
    return AssessmentDetailDto.from(await this.assessments.get(id, actor.role));
  }

  @Put(':assessmentId/questions/:questionId/options/order')
  @Roles(...WRITE_ROLES)
  async reorderOptions(
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Body() dto: ReorderOptionsDto,
  ): Promise<AssessmentDetailDto> {
    await this.assessments.reorderOptions(id, questionId, dto.optionIds, dto.previousOptionIds, dto.version);
    return AssessmentDetailDto.from(await this.assessments.get(id, actor.role));
  }

  /** Whether the SAVED working copy could be published now: blocking `problems` and non-blocking `warnings`, each with a code, a message and a path. */
  @Get(':assessmentId/validation')
  @Roles(...READ_ROLES)
  validate(@Param('assessmentId', ParseUUIDPipe) id: string) {
    return this.assessments.validate(id);
  }

  /** Published versions, newest first (kept for good: submissions against an older version are still scored against it). */
  @Get(':assessmentId/publications')
  @Roles(...READ_ROLES)
  async publications(@Param('assessmentId', ParseUUIDPipe) id: string): Promise<{ items: PublicationDto[] }> {
    return { items: (await this.assessments.publications(id)).map((p) => PublicationDto.from(p)) };
  }

  @Get(':assessmentId/workflow/events')
  @Roles(...READ_ROLES)
  async events(@Param('assessmentId', ParseUUIDPipe) id: string, @Query() query: EventsQueryDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.assessments.events(id, limit, offset);
    return { items: items.map((e) => WorkflowEventDto.from(e)), total, limit, offset };
  }

  @Post(':assessmentId/workflow/submit')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.SUBMIT_FOR_REVIEW)
  async submit(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: TransitionDto): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(await this.assessments.perform('SUBMIT_FOR_REVIEW', id, actor, dto));
  }

  @Post(':assessmentId/workflow/request-changes')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.REQUEST_CHANGES)
  async requestChanges(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: TransitionDto): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(await this.assessments.perform('REQUEST_CHANGES', id, actor, dto));
  }

  @Post(':assessmentId/workflow/approve')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.APPROVE)
  async approve(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: TransitionDto): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(await this.assessments.perform('APPROVE', id, actor, dto));
  }

  /** ADMIN only. Validates again, freezes the saved working copy as the next published version and makes it the one learners get (replacing any active one). */
  @Post(':assessmentId/workflow/publish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.PUBLISH)
  async publish(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: TransitionDto): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(await this.assessments.perform('PUBLISH', id, actor, dto));
  }

  /** ADMIN only. Ends the active publication; its snapshot is kept. */
  @Post(':assessmentId/workflow/unpublish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.UNPUBLISH)
  async unpublish(@Param('assessmentId', ParseUUIDPipe) id: string, @CurrentAdmin() actor: AuthenticatedAdmin, @Body() dto: TransitionDto): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(await this.assessments.perform('UNPUBLISH', id, actor, dto));
  }
}
