import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import type { LearningLevel } from '../../../shared-kernel/index.js';
import type { BlockType } from '../domain/blocks/block-types.js';
import { type ReusableBlock, type TemplateLevel, readTemplateLevels } from '../domain/reusable-blocks.js';
import { ReusableBlockEntity } from './reusable-block.entity.js';

export interface NewReusableBlock {
  name: string;
  description: string | null;
  type: BlockType;
  sharedContent: Record<string, unknown> | null;
  levels: readonly TemplateLevel[];
  createdBy: string;
}

/** What the library list shows: no content, only which levels there are and whether each has its own version. */
export interface ReusableBlockSummary {
  id: string;
  name: string;
  description: string | null;
  type: BlockType;
  levels: { level: LearningLevel; hasVariant: boolean }[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReusableBlockFilters {
  /** Part of the name (case-insensitive). Blank = every name. */
  text: string;
  /** Only this block type. */
  type?: string;
}

interface Row {
  id: string;
  name: string;
  description: string | null;
  type: string;
  shared_content: Record<string, unknown> | null;
  levels: unknown;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `"id", "name", "description", "type", "shared_content", "levels", "version", "created_by", "created_at", "updated_at"`;

/**
 * Persistence of reusable blocks. Plain SQL (the json columns are written as explicit jsonb), returning domain objects, never entities. Nothing here touches a lesson,
 * a lesson block or any published data.
 */
@Injectable()
export class ReusableBlockRepository {
  constructor(
    @InjectRepository(ReusableBlockEntity)
    private readonly rows: Repository<ReusableBlockEntity>,
  ) {}

  async insert(input: NewReusableBlock, manager?: EntityManager): Promise<ReusableBlock> {
    const [row]: Row[] = await this.db(manager).query(
      `INSERT INTO "reusable_blocks" ("name", "description", "type", "shared_content", "levels", "created_by")
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.description,
        input.type,
        input.sharedContent === null ? null : JSON.stringify(input.sharedContent),
        JSON.stringify(input.levels.map(({ level, content }) => ({ level, content }))),
        input.createdBy,
      ],
    );
    return toReusableBlock(row);
  }

  async findById(id: string, manager?: EntityManager): Promise<ReusableBlock | null> {
    const [row]: Row[] = await this.db(manager).query(`SELECT ${COLUMNS} FROM "reusable_blocks" WHERE "id" = $1`, [id]);
    return row ? toReusableBlock(row) : null;
  }

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<ReusableBlock | null> {
    const [row]: Row[] = await manager.query(`SELECT ${COLUMNS} FROM "reusable_blocks" WHERE "id" = $1 FOR UPDATE`, [id]);
    return row ? toReusableBlock(row) : null;
  }

  /** Most recently changed first. */
  async list(filters: ReusableBlockFilters, limit: number, offset: number): Promise<{ items: ReusableBlockSummary[]; total: number }> {
    const pattern = `%${filters.text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const type = filters.type ?? null;
    const where = `"name" ILIKE $1 AND ($2::varchar IS NULL OR "type" = $2::varchar)`;
    const [{ total }]: { total: number }[] = await this.db().query(`SELECT count(*)::int AS "total" FROM "reusable_blocks" WHERE ${where}`, [pattern, type]);
    const found: (Omit<Row, 'shared_content' | 'created_by'> & { levels: { level: LearningLevel; hasVariant: boolean }[] })[] = await this.db().query(
      `SELECT "id", "name", "description", "type", "version", "created_at", "updated_at",
              COALESCE((SELECT jsonb_agg(jsonb_build_object('level', e->>'level', 'hasVariant', jsonb_typeof(e->'content') = 'object'))
                          FROM jsonb_array_elements("levels") AS e), '[]'::jsonb) AS "levels"
         FROM "reusable_blocks" WHERE ${where}
        ORDER BY "updated_at" DESC, "id" LIMIT $3 OFFSET $4`,
      [pattern, type, limit, offset],
    );
    return {
      total,
      items: found.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        type: row.type as BlockType,
        levels: Array.isArray(row.levels) ? row.levels : [],
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  /** Changes only what is given (undefined = leave alone). Bumps the version and updated_at. The row is already locked by the caller. */
  async update(
    id: string,
    changes: { name?: string; description?: string | null; sharedContent?: Record<string, unknown> | null },
    manager: EntityManager,
  ): Promise<ReusableBlock> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const add = (column: string, value: unknown, cast = '') => {
      values.push(value);
      sets.push(`"${column}" = $${values.length}${cast}`);
    };
    if (changes.name !== undefined) add('name', changes.name);
    if (changes.description !== undefined) add('description', changes.description);
    if (changes.sharedContent !== undefined) add('shared_content', changes.sharedContent === null ? null : JSON.stringify(changes.sharedContent), '::jsonb');
    // No RETURNING: TypeORM answers an UPDATE through query() as [rows, count], so the row is read back instead.
    await manager.query(`UPDATE "reusable_blocks" SET ${[...sets, `"version" = "version" + 1`, `"updated_at" = now()`].join(', ')} WHERE "id" = $1`, values);
    const updated = await this.findById(id, manager);
    if (!updated) throw new Error('The reusable block disappeared while it was being updated');
    return updated;
  }

  /** Removes the template only. Lessons, lesson blocks and media are not touched (nothing refers to a template). The caller has checked that it exists. */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await this.db(manager).query(`DELETE FROM "reusable_blocks" WHERE "id" = $1`, [id]);
  }

  private db(manager?: EntityManager): EntityManager {
    return manager ?? this.rows.manager;
  }
}

function toReusableBlock(row: Row): ReusableBlock {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as BlockType,
    sharedContent: row.shared_content,
    levels: readTemplateLevels(row.levels),
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
