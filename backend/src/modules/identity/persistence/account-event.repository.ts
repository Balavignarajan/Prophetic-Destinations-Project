import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type {
  AccountEvent,
  AccountEventAction,
} from '../domain/account-management.js';

export interface NewAccountEvent {
  subjectAdminId: string;
  actorAdminId: string;
  action: AccountEventAction;
  fromValue?: string | null;
  toValue?: string | null;
}

interface Row {
  id: string;
  seq: string;
  subject_admin_id: string;
  actor_admin_id: string;
  action: AccountEventAction;
  from_value: string | null;
  to_value: string | null;
  created_at: Date;
}

/** The append-only audit trail of account management (the database rejects updates and deletes). */
@Injectable()
export class AccountEventRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async append(
    event: NewAccountEvent,
    manager: EntityManager,
  ): Promise<AccountEvent> {
    const [row]: Row[] = await manager.query(
      `INSERT INTO "admin_account_events" ("subject_admin_id", "actor_admin_id", "action", "from_value", "to_value")
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        event.subjectAdminId,
        event.actorAdminId,
        event.action,
        event.fromValue ?? null,
        event.toValue ?? null,
      ],
    );
    return toEvent(row);
  }

  /** The history of one account, newest first. */
  async list(
    subjectAdminId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: AccountEvent[]; total: number }> {
    const rows: Row[] = await this.dataSource.query(
      `SELECT * FROM "admin_account_events" WHERE "subject_admin_id" = $1
        ORDER BY "seq" DESC LIMIT $2 OFFSET $3`,
      [subjectAdminId, limit, offset],
    );
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS "total" FROM "admin_account_events" WHERE "subject_admin_id" = $1`,
      [subjectAdminId],
    );
    return { items: rows.map(toEvent), total };
  }
}

function toEvent(row: Row): AccountEvent {
  return {
    id: row.id,
    seq: Number(row.seq),
    subjectAdminId: row.subject_admin_id,
    actorAdminId: row.actor_admin_id,
    action: row.action,
    fromValue: row.from_value,
    toValue: row.to_value,
    createdAt: row.created_at,
  };
}
