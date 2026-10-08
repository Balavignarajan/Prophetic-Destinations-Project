import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { isForeignKeyViolation } from '../../../database/pg-errors.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { ContentStatus } from '../domain/content-status.js';
import type { Course } from '../domain/models.js';
import { CourseEntity } from './course.entity.js';

export interface NewCourse {
  title: string;
  description: string | null;
}

export interface CourseChanges {
  title?: string;
  description?: string | null;
  status?: ContentStatus;
}

/** Returns domain objects, never entities. Pass `manager` to take part in a transaction. */
@Injectable()
export class CourseRepository {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
  ) {}

  async create(course: NewCourse, manager?: EntityManager): Promise<Course> {
    const repo = this.repo(manager);
    const saved = await repo.save(repo.create({ ...course, status: 'DRAFT' }));
    return toCourse(saved);
  }

  async findById(id: string, manager?: EntityManager): Promise<Course | null> {
    const row = await this.repo(manager).findOne({ where: { id } });
    return row ? toCourse(row) : null;
  }

  /** Locks the course row until the transaction ends. Serializes changes to a course and its modules. */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Course | null> {
    const row = await manager
      .getRepository(CourseEntity)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    return row ? toCourse(row) : null;
  }

  /** Oldest first, with id as the tie-breaker, so the order is always deterministic. */
  async list(
    limit: number,
    offset: number,
    manager?: EntityManager,
  ): Promise<{ items: Course[]; total: number }> {
    const [rows, total] = await this.repo(manager).findAndCount({
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(toCourse), total };
  }

  async update(
    id: string,
    changes: CourseChanges,
    manager: EntityManager,
  ): Promise<Course> {
    const repo = manager.getRepository(CourseEntity);
    await repo.update({ id }, changes);
    return toCourse(await repo.findOneOrFail({ where: { id } }));
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    try {
      await this.repo(manager).delete({ id });
    } catch (error) {
      // Backstop for the foreign key (ON DELETE RESTRICT) if modules appeared concurrently.
      if (isForeignKeyViolation(error)) {
        throw new ConflictError('Course still has modules');
      }
      throw error;
    }
  }

  private repo(manager?: EntityManager): Repository<CourseEntity> {
    return manager ? manager.getRepository(CourseEntity) : this.courses;
  }
}

function toCourse(row: CourseEntity): Course {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as ContentStatus,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
