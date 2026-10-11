import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsModule } from '../lessons/index.js';
import { ConsistencyController } from './api/consistency.controller.js';
import { PublicationsController } from './api/publications.controller.js';
import { ReadinessController } from './api/readiness.controller.js';
import { WorkflowController } from './api/workflow.controller.js';
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
  ],
  controllers: [
    WorkflowController,
    ConsistencyController,
    PublicationsController,
    ReadinessController,
  ],
  providers: [
    WorkflowEventRepository,
    PublicationRepository,
    PublishingFacade,
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
