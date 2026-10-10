import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentAdmin,
  Roles,
  type AuthenticatedAdmin,
} from '../../identity/index.js';
import { WorkflowService } from '../application/workflow.service.js';
import { ACTION_ROLES, READ_ROLES } from '../domain/roles.js';
import {
  ListEventsQueryDto,
  RequestChangesDto,
  TransitionDto,
  TransitionResponseDto,
  WorkflowEventDto,
  WorkflowEventListDto,
  WorkflowStateDto,
} from './dto/workflow.dto.js';

const DEFAULT_LIMIT = 50;

/** The review workflow of one lesson. Thin HTTP layer: parse, call WorkflowService, shape the response. */
@Controller('admin/lessons/:lessonId/workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  /** The lesson's workflow state, and what the caller may do with it right now. */
  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async state(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<WorkflowStateDto> {
    return WorkflowStateDto.from(
      await this.workflow.getState(lessonId, admin.role),
    );
  }

  /** Workflow history, newest first. */
  @Get('events')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  async events(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<WorkflowEventListDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.workflow.listEvents(
      lessonId,
      limit,
      offset,
    );
    return {
      items: items.map((event) => WorkflowEventDto.from(event)),
      total,
      limit,
      offset,
    };
  }

  @Post('submit')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.SUBMIT_FOR_REVIEW)
  async submit(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: TransitionDto,
  ): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(
      await this.workflow.perform('SUBMIT_FOR_REVIEW', lessonId, admin, dto),
    );
  }

  @Post('request-changes')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.REQUEST_CHANGES)
  async requestChanges(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: RequestChangesDto,
  ): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(
      await this.workflow.perform('REQUEST_CHANGES', lessonId, admin, dto),
    );
  }

  @Post('approve')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.APPROVE)
  async approve(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: TransitionDto,
  ): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(
      await this.workflow.perform('APPROVE', lessonId, admin, dto),
    );
  }

  /** ADMIN only: snapshots every available level of an APPROVED lesson as the next version. */
  @Post('publish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.PUBLISH)
  async publish(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: TransitionDto,
  ): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(
      await this.workflow.perform('PUBLISH', lessonId, admin, dto),
    );
  }

  /** ADMIN only: ends the active publication; its snapshots are kept. */
  @Post('unpublish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.UNPUBLISH)
  async unpublish(
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: TransitionDto,
  ): Promise<TransitionResponseDto> {
    return TransitionResponseDto.from(
      await this.workflow.perform('UNPUBLISH', lessonId, admin, dto),
    );
  }
}
