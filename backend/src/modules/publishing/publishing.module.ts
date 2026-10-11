import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurriculumModule } from '../curriculum/index.js';
import { LessonsModule } from '../lessons/index.js';
import { CatalogPublicationsController } from './api/catalog-publications.controller.js';
import {
  CourseWorkflowController,
  ModuleWorkflowController,
} from './api/catalog-workflow.controller.js';
import { ConsistencyController } from './api/consistency.controller.js';
import { PublicationsController } from './api/publications.controller.js';
import { ReadinessController } from './api/readiness.controller.js';
import { WorkflowController } from './api/workflow.controller.js';
import { CatalogHistoryService } from './application/catalog-history.service.js';
import { CatalogPublicationService } from './application/catalog-publication.service.js';
import { CatalogWorkflowService } from './application/catalog-workflow.service.js';
import { PublishedCatalogService } from './application/published-catalog.service.js';
import { ConsistencyService } from './application/consistency.service.js';
import { PublishingFacade } from './application/publishing.facade.js';
import { PublicationService } from './application/publication.service.js';
import { ReadinessService } from './application/readiness.service.js';
import {
  DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS,
  WORKFLOW_LOCK_TIMEOUT_MS,
  WorkflowService,
} from './application/workflow.service.js';
import {
  NO_SEPARATION_OF_DUTIES,
  SEPARATION_OF_DUTIES_POLICY,
} from './domain/separation-of-duties.js';
import { LessonWorkflowEventEntity } from './persistence/lesson-workflow-event.entity.js';
import { CatalogEventRepository } from './persistence/catalog-event.repository.js';
import { CatalogPublicationRepository } from './persistence/catalog-publication.repository.js';
import { PublishedCatalogRepository } from './persistence/published-catalog.repository.js';
import { ConsistencyRepository } from './persistence/consistency.repository.js';
import { PublicationRepository } from './persistence/publication.repository.js';
import { WorkflowEventRepository } from './persistence/workflow-event.repository.js';

/**
 * The editorial workflow of lessons: review transitions with an append-only audit
 * trail, publishing and unpublishing (immutable per-level snapshots, versioned
 * publications), and an advisory readiness check.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LessonWorkflowEventEntity]),
    LessonsModule,
    CurriculumModule,
  ],
  controllers: [
    WorkflowController,
    CourseWorkflowController,
    ModuleWorkflowController,
    CatalogPublicationsController,
    ConsistencyController,
    PublicationsController,
    ReadinessController,
  ],
  providers: [
    WorkflowEventRepository,
    PublicationRepository,
    PublishingFacade,
    CatalogPublicationRepository,
    CatalogEventRepository,
    PublishedCatalogRepository,
    CatalogPublicationService,
    CatalogWorkflowService,
    CatalogHistoryService,
    PublishedCatalogService,
    ConsistencyRepository,
    ConsistencyService,
    PublicationService,
    WorkflowService,
    ReadinessService,
    // Workflow transitions give up waiting for a lock after 10 s (a retryable 409).
    {
      provide: WORKFLOW_LOCK_TIMEOUT_MS,
      useValue: DEFAULT_WORKFLOW_LOCK_TIMEOUT_MS,
    },
    // Policy S0: nothing is enforced; actors are recorded. A stricter policy replaces this provider.
    { provide: SEPARATION_OF_DUTIES_POLICY, useValue: NO_SEPARATION_OF_DUTIES },
  ],
  // The only thing other modules (Delivery) may use from here: see publishing.facade.ts.
  exports: [PublishingFacade],
})
export class PublishingModule {}
