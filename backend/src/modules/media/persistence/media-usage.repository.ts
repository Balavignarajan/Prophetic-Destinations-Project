import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaAssetEntity } from './media-asset.entity.js';

export interface MediaUsage {
  /** Lessons whose DRAFT content (a block or a level variant) points at the asset. */
  draftLessons: number;
  /** Lessons whose currently ACTIVE published snapshot points at the asset. */
  publishedLessons: number;
}

/**
 * Where an asset is referenced from, so deleting it can be refused instead of breaking lessons.
 *
 * Media is the one module that must know whether anything points at its rows, but it must not depend on Lessons or
 * Publishing (they depend on it). References are plain asset ids inside block content (`mediaId`), so this reads the two
 * authoring tables and the immutable snapshot table with read-only queries. It never writes to them.
 */
@Injectable()
export class MediaUsageRepository {
  constructor(
    @InjectRepository(MediaAssetEntity)
    private readonly assets: Repository<MediaAssetEntity>,
  ) {}

  async usageOf(id: string): Promise<MediaUsage> {
    const [draft]: { n: number }[] = await this.assets.query(
      `SELECT count(DISTINCT lesson_id)::int AS n FROM (
         SELECT "lesson_id" FROM "lesson_blocks"
           WHERE "type" = 'IMAGE' AND "shared_content"->>'mediaId' = $1
         UNION ALL
         SELECT "lesson_id" FROM "lesson_block_levels"
           WHERE "content"->>'mediaId' = $1
       ) AS refs`,
      [id],
    );
    // Snapshots are immutable JSON; the id is a UUID, so a text search for it cannot match anything else.
    const [published]: { n: number }[] = await this.assets.query(
      `SELECT count(DISTINCT p."lesson_id")::int AS n
         FROM "lesson_publication_levels" l
         JOIN "lesson_publications" p ON p."id" = l."publication_id"
        WHERE p."ended_at" IS NULL AND l."content"::text LIKE '%' || $1 || '%'`,
      [id],
    );
    return {
      draftLessons: draft?.n ?? 0,
      publishedLessons: published?.n ?? 0,
    };
  }
}
