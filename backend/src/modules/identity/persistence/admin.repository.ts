import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { AdminAccount, AdminStatus } from '../domain/admin-account.js';
import type { Role } from '../domain/role.js';
import { AdminEntity } from './admin.entity.js';
import { isUniqueViolation } from './pg-errors.js';

export interface NewAdmin {
  email: string;
  passwordHash: string;
  role: Role;
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

  async create(
    admin: NewAdmin,
    manager?: EntityManager,
  ): Promise<AdminAccount> {
    const repo = this.repo(manager);
    try {
      const saved = await repo.save(
        repo.create({ ...admin, status: 'ACTIVE' }),
      );
      return toAccount(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An admin with this email already exists');
      }
      throw error;
    }
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
  };
}
