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
import {
  CatalogWorkflowService,
  type CatalogSubject,
} from '../application/catalog-workflow.service.js';
import { ACTION_ROLES, READ_ROLES } from '../domain/roles.js';
import type { WorkflowAction } from '../domain/workflow.js';
import {
  CatalogEventDto,
  CatalogEventListDto,
  CatalogRequestChangesDto,
  CatalogStateDto,
  CatalogTransitionDto,
  CatalogTransitionResponseDto,
} from './dto/catalog.dto.js';
import { ListEventsQueryDto } from './dto/workflow.dto.js';

const DEFAULT_LIMIT = 50;

/** The shared HTTP shape of the course and module workflow routes (the subject differs, nothing else). */
abstract class CatalogWorkflowRoutes {
  constructor(protected readonly workflow: CatalogWorkflowService) {}

  protected state(subject: CatalogSubject, admin: AuthenticatedAdmin) {
    return this.workflow
      .getState(subject, admin.role)
      .then((state) => CatalogStateDto.from(state));
  }

  protected async events(
    subject: CatalogSubject,
    query: ListEventsQueryDto,
  ): Promise<CatalogEventListDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const { items, total } = await this.workflow.listEvents(
      subject,
      limit,
      offset,
    );
    return {
      items: items.map((event) => CatalogEventDto.from(event)),
      total,
      limit,
      offset,
    };
  }

  protected async transition(
    action: WorkflowAction,
    subject: CatalogSubject,
    admin: AuthenticatedAdmin,
    dto: CatalogTransitionDto,
  ): Promise<CatalogTransitionResponseDto> {
    return CatalogTransitionResponseDto.from(
      await this.workflow.perform(subject, action, admin, dto),
    );
  }
}

/** Workflow of a course. Publishing a course publishes it together with its approved modules. */
@Controller('admin/courses/:courseId/workflow')
export class CourseWorkflowController extends CatalogWorkflowRoutes {
  // Declared here so Nest can see the dependency (it reads constructor types from decorated classes only).
  constructor(workflow: CatalogWorkflowService) {
    super(workflow);
  }

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  getState(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.state({ courseId }, admin);
  }

  @Get('events')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  getEvents(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: ListEventsQueryDto,
  ) {
    return this.events({ courseId }, query);
  }

  @Post('submit')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.SUBMIT_FOR_REVIEW)
  submit(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('SUBMIT_FOR_REVIEW', { courseId }, admin, dto);
  }

  @Post('request-changes')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.REQUEST_CHANGES)
  requestChanges(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogRequestChangesDto,
  ) {
    return this.transition('REQUEST_CHANGES', { courseId }, admin, dto);
  }

  @Post('approve')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.APPROVE)
  approve(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('APPROVE', { courseId }, admin, dto);
  }

  @Post('publish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.PUBLISH)
  publish(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('PUBLISH', { courseId }, admin, dto);
  }

  @Post('unpublish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.UNPUBLISH)
  unpublish(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('UNPUBLISH', { courseId }, admin, dto);
  }
}

/** Workflow of one module of a course. Publishing needs the course to be published already. */
@Controller('admin/courses/:courseId/modules/:moduleId/workflow')
export class ModuleWorkflowController extends CatalogWorkflowRoutes {
  constructor(workflow: CatalogWorkflowService) {
    super(workflow);
  }

  @Get()
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  getState(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.state({ courseId, moduleId }, admin);
  }

  @Get('events')
  @Roles(...READ_ROLES)
  @Header('Cache-Control', 'no-store')
  getEvents(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Query() query: ListEventsQueryDto,
  ) {
    return this.events({ courseId, moduleId }, query);
  }

  @Post('submit')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.SUBMIT_FOR_REVIEW)
  submit(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition(
      'SUBMIT_FOR_REVIEW',
      { courseId, moduleId },
      admin,
      dto,
    );
  }

  @Post('request-changes')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.REQUEST_CHANGES)
  requestChanges(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogRequestChangesDto,
  ) {
    return this.transition(
      'REQUEST_CHANGES',
      { courseId, moduleId },
      admin,
      dto,
    );
  }

  @Post('approve')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.APPROVE)
  approve(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('APPROVE', { courseId, moduleId }, admin, dto);
  }

  @Post('publish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.PUBLISH)
  publish(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('PUBLISH', { courseId, moduleId }, admin, dto);
  }

  @Post('unpublish')
  @HttpCode(200)
  @Roles(...ACTION_ROLES.UNPUBLISH)
  unpublish(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CatalogTransitionDto,
  ) {
    return this.transition('UNPUBLISH', { courseId, moduleId }, admin, dto);
  }
}
