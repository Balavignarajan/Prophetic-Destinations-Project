import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import type { ContentStatus } from '../../../shared-kernel/index.js';
import type { Role } from '../../identity/index.js';
import type { WorkflowEvent } from '../domain/models.js';
import type { WorkflowAction } from '../domain/workflow.js';
import { LessonWorkflowEventEntity } from './lesson-workflow-event.entity.js';

export interface NewWorkflowEvent {
  lessonId: string;
  action: WorkflowAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  actorRole: Role;
  note: string | null;
  contentRevision: number;
}

/**
 * Append-only: there is no update and no delete, here or in the database.
 * Returns domain objects, never entities.
 */
@Injectable()
export class WorkflowEventRepository {
  constructor(
    @InjectRepository(LessonWorkflowEventEntity)
    private readonly events: Repository<LessonWorkflowEventEntity>,
  ) {}

  /** Records an event. Pass the transition's `manager` so it commits or rolls back with the status change. */
  async append(
    event: NewWorkflowEvent,
    manager: EntityManager,
  ): Promise<WorkflowEvent> {
    const repo = manager.getRepository(LessonWorkflowEventEntity);
    const id = randomUUID();
    await repo.insert({ id, ...event });
    return toEvent(await repo.findOneOrFail({ where: { id } }));
  }

  /** Newest first. */
  async list(
    lessonId: string,
    limit: number,
    offset: number,
    manager?: EntityManager,
  ): Promise<{ items: WorkflowEvent[]; total: number }> {
    const [rows, total] = await this.repo(manager).findAndCount({
      where: { lessonId },
      order: { seq: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(toEvent), total };
  }

  async latest(
    lessonId: string,
    manager?: EntityManager,
  ): Promise<WorkflowEvent | null> {
    const row = await this.repo(manager).findOne({
      where: { lessonId },
      order: { seq: 'DESC' },
    });
    return row ? toEvent(row) : null;
  }

  private repo(manager?: EntityManager): Repository<LessonWorkflowEventEntity> {
    return manager
      ? manager.getRepository(LessonWorkflowEventEntity)
      : this.events;
  }
}

function toEvent(row: LessonWorkflowEventEntity): WorkflowEvent {
  return {
    id: row.id,
    seq: Number(row.seq),
    lessonId: row.lessonId,
    action: row.action as WorkflowAction,
    fromStatus: row.fromStatus as ContentStatus,
    toStatus: row.toStatus as ContentStatus,
    actorAdminId: row.actorAdminId,
    actorRole: row.actorRole as Role,
    note: row.note,
    contentRevision: row.contentRevision,
    createdAt: row.createdAt,
  };
}
