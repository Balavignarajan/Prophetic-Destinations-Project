import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, Repository } from 'typeorm';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { ManagedAccount } from '../domain/account-management.js';
import type {
  AdminAccount,
  AdminStatus,
  ManagedStatus,
} from '../domain/admin-account.js';
import type { Role } from '../domain/role.js';
import { AdminEntity } from './admin.entity.js';
import { isUniqueViolation } from '../../../database/pg-errors.js';

export interface NewAdmin {
  email: string;
  passwordHash: string;
  role: Role;
  /** True when an ADMIN set a temporary password; the account must change it before doing anything else. */
  mustChangePassword?: boolean;
}

/** Callers pass an already-normalized email. Returns domain objects, never entities. */
@Injectable()
export class AdminRepository {
  constructor(
    @InjectRepository(AdminEntity)
    private readonly admins: Repository<AdminEntity>,
  ) {}

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<AdminAccount | null> {
    const row = await this.repo(manager).findOne({ where: { email } });
    return row ? toAccount(row) : null;
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<AdminAccount | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    return row ? toAccount(row) : null;
  }

  /**
   * Reads the account and holds a SHARE lock on its row until the transaction ends. Revocations hold the row FOR UPDATE,
   * so a session opened with this lock is serialized with them: it either commits before the revocation (and is
   * revoked by it) or sees the account as the revocation left it.
   */
  async findByIdForShare(
    id: string,
    manager: EntityManager,
  ): Promise<AdminAccount | null> {
    const rows: {
      id: string;
      email: string;
      passwordHash: string;
      role: Role;
      status: AdminStatus;
      mustChangePassword: boolean;
    }[] = await manager.query(
      `SELECT "id", "email", "password_hash" AS "passwordHash", "role", "status",
              "must_change_password" AS "mustChangePassword"
         FROM "admins" WHERE "id" = $1 FOR SHARE`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    admin: NewAdmin,
    manager?: EntityManager,
  ): Promise<AdminAccount> {
    const repo = this.repo(manager);
    try {
      const saved = await repo.save(
        repo.create({
          ...admin,
          mustChangePassword: admin.mustChangePassword ?? false,
          status: 'ACTIVE',
        }),
      );
      return toAccount(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An admin with this email already exists');
      }
      throw error;
    }
  }

  /**
   * A page of staff accounts for the management API, oldest first. Never selects the password hash. Permanently deleted
   * accounts are not staff accounts any more: they are neither listed nor counted.
   */
  async list(
    limit: number,
    offset: number,
    manager?: EntityManager,
  ): Promise<{ items: ManagedAccount[]; total: number }> {
    const [rows, total] = await this.repo(manager).findAndCount({
      where: { status: In([...MANAGED_STATUSES]) },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
      skip: offset,
      select: MANAGED_COLUMNS,
    });
    return { items: rows.map(toManaged), total };
  }

  async findManaged(
    id: string,
    manager?: EntityManager,
  ): Promise<ManagedAccount | null> {
    // A permanently deleted account is "not found" to the management API, exactly as if it never existed.
    const row = await this.repo(manager).findOne({
      where: { id, status: In([...MANAGED_STATUSES]) },
      select: MANAGED_COLUMNS,
    });
    return row ? toManaged(row) : null;
  }

  /**
   * Locks, in one statement and in a fixed (id) order, the given accounts AND every active ADMIN, and returns
   * them. Every operation that could remove an active ADMIN takes this same lock set in this same order, so two
   * of them can never both pass the "not the last ADMIN" check: the second waits, then sees the first's result.
   * Must be called inside a transaction.
   */
  async lockForManagement(
    ids: readonly string[],
    manager: EntityManager,
  ): Promise<AdminAccount[]> {
    const rows: {
      id: string;
      email: string;
      passwordHash: string;
      role: Role;
      status: AdminStatus;
      mustChangePassword: boolean;
    }[] = await manager.query(
      `SELECT "id", "email", "password_hash" AS "passwordHash", "role", "status",
              "must_change_password" AS "mustChangePassword"
         FROM "admins"
        WHERE "id" = ANY($1::uuid[]) OR ("role" = 'ADMIN' AND "status" = 'ACTIVE')
        ORDER BY "id"
          FOR UPDATE`,
      [ids],
    );
    return rows;
  }

  async setRole(id: string, role: Role, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE "admins" SET "role" = $2, "version" = "version" + 1, "updated_at" = now() WHERE "id" = $1`,
      [id, role],
    );
  }

  async setStatus(
    id: string,
    status: ManagedStatus,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "admins" SET "status" = $2, "version" = "version" + 1, "updated_at" = now() WHERE "id" = $1`,
      [id, status],
    );
  }

  /**
   * Permanently erases an account's identity, in place: the e-mail address becomes `erasedEmail` (derived from the id,
   * identifying nobody), the password hash becomes `unusableHash` (a hash of a secret nobody ever saw), the status
   * becomes DELETED and `deletedAt` is set. The row itself stays, with its id, because history in other tables points at
   * that id (see AccountService.deletePermanently). Must be called inside a transaction that holds the row's lock.
   */
  async erase(
    id: string,
    erasedEmail: string,
    unusableHash: string,
    deletedAt: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "admins"
          SET "email" = $2, "password_hash" = $3, "status" = 'DELETED', "must_change_password" = false,
              "deleted_at" = $4, "version" = "version" + 1, "updated_at" = $4
        WHERE "id" = $1`,
      [id, erasedEmail, unusableHash, deletedAt],
    );
  }

  /** Replaces the password hash and sets the must-change flag. */
  async setPassword(
    id: string,
    passwordHash: string,
    mustChangePassword: boolean,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "admins"
          SET "password_hash" = $2, "must_change_password" = $3,
              "version" = "version" + 1, "updated_at" = now()
        WHERE "id" = $1`,
      [id, passwordHash, mustChangePassword],
    );
  }

  private repo(manager?: EntityManager): Repository<AdminEntity> {
    return manager ? manager.getRepository(AdminEntity) : this.admins;
  }
}

function toAccount(row: AdminEntity): AdminAccount {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role as Role,
    status: row.status as AdminStatus,
    mustChangePassword: row.mustChangePassword,
  };
}

/** The statuses of an account that is still a staff account. */
const MANAGED_STATUSES: readonly ManagedStatus[] = ['ACTIVE', 'DISABLED'];

/** Every column except the password hash. */
const MANAGED_COLUMNS = {
  id: true,
  email: true,
  role: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

function toManaged(row: AdminEntity): ManagedAccount {
  return {
    id: row.id,
    email: row.email,
    role: row.role as Role,
    // list() and findManaged() only ever return ACTIVE and DISABLED rows.
    status: row.status as ManagedStatus,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
