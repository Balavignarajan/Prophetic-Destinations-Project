import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MediaMetadata } from '../domain/metadata.js';
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

  /**
   * Replaces the descriptive metadata when the stored version is still `expectedVersion` and raises the version. Returns null if no row matched
   * (missing, or changed by someone else; the caller tells which). The file columns are never touched.
   */
  async updateMetadata(id: string, expectedVersion: number, metadata: MediaMetadata): Promise<StoredMediaAsset | null> {
    const rows: MediaRow[] = await this.assets.query(
      `UPDATE "media_assets"
          SET "title" = $3, "alt_text" = $4, "caption" = $8, "source" = $5, "rights_notes" = $6, "tags" = $7::text[], "metadata_version" = "metadata_version" + 1
        WHERE "id" = $1 AND "metadata_version" = $2
        RETURNING *`,
      [id, expectedVersion, metadata.title, metadata.altText, metadata.source, metadata.rightsNotes, metadata.tags, metadata.caption],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findById(id: string): Promise<StoredMediaAsset | null> {
    const row = await this.assets.findOne({ where: { id } });
    return row ? toAsset(row) : null;
  }

  /**
   * One page of the library, newest first (ties by id, so pages are stable and no asset appears twice). A search term is applied in the DATABASE,
   * before paging, to the file name, the title and the tags (case-insensitive substring; `%`, `_` and `\\` typed by the user are literal). Alt text, caption,
   * source and the internal rights notes are deliberately NOT searched. The term is always a bound parameter.
   */
  async list(
    limit: number,
    offset: number,
    search?: string,
    contentType?: string,
  ): Promise<{ items: StoredMediaAsset[]; total: number }> {
    const term = search?.trim();
    const pattern = term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const where = `WHERE ($2::text IS NULL OR "content_type" = $2) AND ($1::text IS NULL
                   OR "original_filename" ILIKE $1
                   OR "title" ILIKE $1
                   OR EXISTS (SELECT 1 FROM unnest("tags") AS tag WHERE tag ILIKE $1))`;
    const [{ n }]: { n: string }[] = await this.assets.query(`SELECT count(*) AS n FROM "media_assets" ${where}`, [pattern, contentType ?? null]);
    const rows: MediaRow[] = await this.assets.query(
      `SELECT * FROM "media_assets" ${where} ORDER BY "created_at" DESC, "id" ASC LIMIT $3 OFFSET $4`,
      [pattern, contentType ?? null, limit, offset],
    );
    return { items: rows.map(fromRow), total: Number(n) };
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
  title: string | null;
  alt_text: string | null;
  caption: string | null;
  source: string | null;
  rights_notes: string | null;
  tags: string[] | null;
  metadata_version: number;
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
    title: row.title ?? null,
    altText: row.altText ?? null,
    caption: row.caption ?? null,
    source: row.source ?? null,
    rightsNotes: row.rightsNotes ?? null,
    tags: row.tags ?? [],
    metadataVersion: row.metadataVersion ?? 1,
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
    title: row.title ?? null,
    altText: row.alt_text ?? null,
    caption: row.caption ?? null,
    source: row.source ?? null,
    rightsNotes: row.rights_notes ?? null,
    tags: row.tags ?? [],
    metadataVersion: row.metadata_version ?? 1,
  };
}
