import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsModule } from '../lessons/index.js';
import { ReadinessController } from './api/readiness.controller.js';
import { WorkflowController } from './api/workflow.controller.js';
import { ReadinessService } from './application/readiness.service.js';
import { WorkflowService } from './application/workflow.service.js';
import {
  NO_SEPARATION_OF_DUTIES,
  SEPARATION_OF_DUTIES_POLICY,
} from './domain/separation-of-duties.js';
import { LessonWorkflowEventEntity } from './persistence/lesson-workflow-event.entity.js';
import { WorkflowEventRepository } from './persistence/workflow-event.repository.js';

/**
 * The editorial workflow of lessons: review transitions with an append-only audit
 * trail, and an advisory readiness check. Publishing itself (snapshots,
 * publications) is not part of this slice.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LessonWorkflowEventEntity]),
    LessonsModule,
  ],
  controllers: [WorkflowController, ReadinessController],
  providers: [
    WorkflowEventRepository,
    WorkflowService,
    ReadinessService,
    // Policy S0: nothing is enforced; actors are recorded. A stricter policy replaces this provider.
    { provide: SEPARATION_OF_DUTIES_POLICY, useValue: NO_SEPARATION_OF_DUTIES },
  ],
})
export class PublishingModule {}
