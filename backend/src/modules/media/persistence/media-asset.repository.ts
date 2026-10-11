import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { StoredMediaAsset } from '../domain/models.js';
import { MediaAssetEntity } from './media-asset.entity.js';

export interface NewMediaAsset {
  storageKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
}

/** Returns domain objects, never entities. */
@Injectable()
export class MediaAssetRepository {
  constructor(
    @InjectRepository(MediaAssetEntity)
    private readonly assets: Repository<MediaAssetEntity>,
  ) {}

  async insert(asset: NewMediaAsset): Promise<StoredMediaAsset> {
    const saved = await this.assets.save(
      this.assets.create({ ...asset, sizeBytes: String(asset.sizeBytes) }),
    );
    return toAsset(saved);
  }

  async findById(id: string): Promise<StoredMediaAsset | null> {
    const row = await this.assets.findOne({ where: { id } });
    return row ? toAsset(row) : null;
  }

  async list(
    limit: number,
    offset: number,
  ): Promise<{ items: StoredMediaAsset[]; total: number }> {
    const [rows, total] = await this.assets.findAndCount({
      order: { createdAt: 'DESC', id: 'ASC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(toAsset), total };
  }

  /** Deletes the row and returns what it was (so the caller can remove the file), or null if there was none. */
  async delete(id: string): Promise<StoredMediaAsset | null> {
    const rows: MediaRow[] = await this.assets.query(
      `WITH deleted AS (DELETE FROM "media_assets" WHERE "id" = $1 RETURNING *)
       SELECT * FROM deleted`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }
}

interface MediaRow {
  id: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: string;
  sha256: string;
  created_by: string;
  created_at: Date;
}

function toAsset(row: MediaAssetEntity): StoredMediaAsset {
  return {
    id: row.id,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    sha256: row.sha256,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function fromRow(row: MediaRow): StoredMediaAsset {
  return {
    id: row.id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256.trim(),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
