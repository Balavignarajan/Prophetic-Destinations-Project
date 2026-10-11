import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { ContentStatus } from '../../../shared-kernel/index.js';
import type { Role } from '../../identity/index.js';
import type { CatalogWorkflowEvent } from '../domain/models.js';
import type { WorkflowAction } from '../domain/workflow.js';

export interface NewCatalogEvent {
  courseId: string;
  /** Set for a module's transition; null for the course's own. */
  moduleId: string | null;
  action: WorkflowAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  actorRole: Role;
  note: string | null;
  subjectVersion: number;
  publicationId: string | null;
}

interface EventRow {
  id: string;
  seq: string;
  course_id: string;
  module_id: string | null;
  action: WorkflowAction;
  from_status: ContentStatus;
  to_status: ContentStatus;
  actor_admin_id: string;
  actor_role: Role;
  note: string | null;
  subject_version: number;
  publication_id: string | null;
  created_at: Date;
}

const COLUMNS = `"id", "seq", "course_id", "module_id", "action", "from_status", "to_status", "actor_admin_id",
  "actor_role", "note", "subject_version", "publication_id", "created_at"`;

/**
 * Append-only history of course and module transitions: no update and no delete, here or in the
 * database. A course's own events have `module_id` null; a module's name the module.
 */
@Injectable()
export class CatalogEventRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Records an event. Pass the transition's `manager` so it commits or rolls back with the status change. */
  async append(
    event: NewCatalogEvent,
    manager: EntityManager,
  ): Promise<CatalogWorkflowEvent> {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO "catalog_workflow_events"
         ("id", "course_id", "module_id", "action", "from_status", "to_status", "actor_admin_id",
          "actor_role", "note", "subject_version", "publication_id")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        event.courseId,
        event.moduleId,
        event.action,
        event.fromStatus,
        event.toStatus,
        event.actorAdminId,
        event.actorRole,
        event.note,
        event.subjectVersion,
        event.publicationId,
      ],
    );
    const [row]: EventRow[] = await manager.query(
      `SELECT ${COLUMNS} FROM "catalog_workflow_events" WHERE "id" = $1`,
      [id],
    );
    return toEvent(row);
  }

  /** Newest first. `moduleId` null means the course's own events. */
  async list(
    courseId: string,
    moduleId: string | null,
    limit: number,
    offset: number,
    manager?: EntityManager,
  ): Promise<{ items: CatalogWorkflowEvent[]; total: number }> {
    const db = manager ?? this.dataSource.manager;
    const where = `"course_id" = $1 AND "module_id" IS NOT DISTINCT FROM $2`;
    const rows: EventRow[] = await db.query(
      `SELECT ${COLUMNS} FROM "catalog_workflow_events" WHERE ${where}
        ORDER BY "seq" DESC LIMIT $3 OFFSET $4`,
      [courseId, moduleId, limit, offset],
    );
    const [{ total }]: { total: number }[] = await db.query(
      `SELECT count(*)::int AS "total" FROM "catalog_workflow_events" WHERE ${where}`,
      [courseId, moduleId],
    );
    return { items: rows.map(toEvent), total };
  }

  async latest(
    courseId: string,
    moduleId: string | null,
    manager?: EntityManager,
  ): Promise<CatalogWorkflowEvent | null> {
    const { items } = await this.list(courseId, moduleId, 1, 0, manager);
    return items[0] ?? null;
  }
}

function toEvent(row: EventRow): CatalogWorkflowEvent {
  return {
    id: row.id,
    seq: Number(row.seq),
    courseId: row.course_id,
    moduleId: row.module_id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorAdminId: row.actor_admin_id,
    actorRole: row.actor_role,
    note: row.note,
    subjectVersion: row.subject_version,
    publicationId: row.publication_id,
    createdAt: row.created_at,
  };
}
