import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { MEDIA_METADATA_LIMITS, cleanMetadataText, cleanTags, sameMetadata } from '../domain/metadata.js';
import { newStorageKey, sanitizeFilename } from '../domain/filename.js';
import { lottieProblem, looksLikeJsonObject } from '../domain/lottie.js';
import { detectMediaType, findSupportedType } from '../domain/media-types.js';
import type { MediaAsset, StoredMediaAsset } from '../domain/models.js';
import { MediaAssetRepository } from '../persistence/media-asset.repository.js';
import { type MediaUsageDetail, MediaUsageRepository } from '../persistence/media-usage.repository.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
  StoredObjectNotFoundError,
} from '../storage/media-storage.js';
import { MEDIA_SETTINGS, type MediaSettings } from './media-settings.js';

/** The part of an uploaded file the service needs (the HTTP layer maps its parser's object to this). */
export interface UploadedMediaFile {
  buffer: Buffer;
  /** The client's file name: display only. */
  originalname: string;
}

export interface MediaContent {
  asset: MediaAsset;
  stream: Readable;
  /** Whether a browser may show it inline. */
  inline: boolean;
}

/**
 * Media library: upload, look up, stream and delete. Bytes go to the storage adapter, metadata to the database.
 *
 * Consistency, given there is no transaction across a disk and a database:
 *  - Upload writes the file FIRST and the row second. If the row cannot be written, the file is removed again; the
 *    only way to leave a stray file is for both steps to fail, and a stray file is harmless (nothing points at it).
 *  - Delete removes the row FIRST and the file second. A row never points at a missing file because of a delete; if
 *    removing the file fails afterwards the delete still succeeds and the orphaned object is logged by id.
 *  - Content is only ever served for an existing row. If the file behind a row is gone, that is reported as 404.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly usage: MediaUsageRepository,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(MEDIA_SETTINGS) private readonly settings: MediaSettings,
  ) {}

  /** What an upload may be, as configured: shown to authors so they are told the real limits before they choose a file. */
  uploadRules(): { maxBytes: number; allowedTypes: string[] } {
    return { maxBytes: this.settings.maxBytes, allowedTypes: [...this.settings.allowedTypes] };
  }

  async upload(
    actorId: string,
    file: UploadedMediaFile | undefined,
  ): Promise<MediaAsset> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BusinessRuleError(
        'No file was uploaded. Send multipart/form-data with the file in a field named "file".',
        { code: 'NO_FILE' },
      );
    }
    const bytes = file.buffer;
    if (bytes.length === 0) {
      throw new BusinessRuleError('The uploaded file is empty', {
        code: 'EMPTY_FILE',
      });
    }
    if (bytes.length > this.settings.maxBytes) {
      throw new BusinessRuleError(
        `The file is larger than the ${this.settings.maxBytes} byte limit`,
        { code: 'FILE_TOO_LARGE', maxBytes: this.settings.maxBytes },
      );
    }
    // The type comes from the bytes. The client's Content-Type and extension are not consulted at all.
    const detected = detectMediaType(bytes);
    if (!detected && looksLikeJsonObject(bytes)) {
      // Someone meant to upload a JSON file (a Lottie animation): say what is wrong with it instead of a bare "type not accepted".
      throw new BusinessRuleError(lottieProblem(bytes) ?? 'This file type is not accepted', { code: 'LOTTIE_INVALID' });
    }
    if (!detected || !this.settings.allowedTypes.has(detected.mime)) {
      throw new BusinessRuleError('This file type is not accepted', {
        code: 'UNSUPPORTED_TYPE',
        allowedTypes: [...this.settings.allowedTypes],
      });
    }

    const storageKey = newStorageKey();
    await this.storage.put(storageKey, bytes);
    try {
      const stored = await this.assets.insert({
        storageKey,
        originalFilename: sanitizeFilename(file.originalname),
        contentType: detected.mime,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        createdBy: actorId,
      });
      return toPublic(stored);
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => {
        this.logger.error(
          'A stored object could not be removed after its database row failed to save',
        );
      });
      throw error;
    }
  }

  /**
   * Changes the descriptive metadata (title, default alt text, caption, source, rights notes, tags) and nothing else: the file, its hash, type, size and
   * identity are never touched. The editor's `expectedVersion` must be the stored one (409 otherwise, so no silent overwrite); an identical save
   * changes nothing and does not raise the version. Content that already uses the image keeps its own text: these values are only defaults offered
   * when an image is chosen, and are never read back into blocks, lessons or published snapshots.
   */
  async updateMetadata(
    id: string,
    expectedVersion: number,
    input: { title?: string | null; altText?: string | null; caption?: string | null; source?: string | null; rightsNotes?: string | null; tags?: readonly string[] },
  ): Promise<MediaAsset> {
    const L = MEDIA_METADATA_LIMITS;
    const next = {
      title: cleanMetadataText(input.title, L.title, 'The title'),
      altText: cleanMetadataText(input.altText, L.altText, 'The alternative text'),
      caption: cleanMetadataText(input.caption, L.caption, 'The caption'),
      source: cleanMetadataText(input.source, L.source, 'The source or credit'),
      rightsNotes: cleanMetadataText(input.rightsNotes, L.rightsNotes, 'The rights information', true),
      tags: cleanTags(input.tags),
    };
    const current = await this.require(id);
    if (current.metadataVersion !== expectedVersion) throw staleMetadata();
    if (sameMetadata(current, next)) return toPublic(current);
    const updated = await this.assets.updateMetadata(id, expectedVersion, next);
    if (!updated) {
      // Nothing matched: it was deleted, or someone else saved first.
      if (!(await this.assets.findById(id))) throw new NotFoundError('Media not found');
      throw staleMetadata();
    }
    return toPublic(updated);
  }

  /** Where the image is used (admin only), working and published kept apart. Lists are cut at `limit` and say so; deletion never relies on this list. */
  async usageDetail(id: string, limit = 50): Promise<MediaUsageDetail> {
    await this.require(id);
    return this.usage.detailOf(id, limit);
  }

  async get(id: string): Promise<MediaAsset> {
    return toPublic(await this.require(id));
  }

  async list(limit: number, offset: number, search?: string, contentType?: string) {
    const { items, total } = await this.assets.list(limit, offset, search, contentType);
    return { items: items.map(toPublic), total };
  }

  /** The asset and a stream of its bytes (or of the given inclusive byte range). 404 if either the row or the stored file is missing. */
  async openContent(id: string, range?: { start: number; end: number }): Promise<MediaContent> {
    const asset = await this.require(id);
    try {
      const stream = await this.storage.open(asset.storageKey, range);
      return {
        asset: toPublic(asset),
        stream,
        inline: findSupportedType(asset.contentType)?.inline ?? false,
      };
    } catch (error) {
      if (error instanceof StoredObjectNotFoundError) {
        this.logger.warn(`The stored file of media ${asset.id} is missing`);
        throw new NotFoundError('The file for this media is missing');
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.require(id);
    // An image a lesson or course still uses (content or cover) is never deleted: that would break the draft or the published item.
    const usage = await this.usage.usageOf(id);
    if (
      usage.draftLessons > 0 ||
      usage.publishedLessons > 0 ||
      usage.draftCourses > 0 ||
      usage.publishedCourses > 0
    ) {
      throw new BusinessRuleError(
        'This image is still used by one or more lessons or courses (as content or as a cover), so it cannot be deleted. Open "Where this image is used" to see them, remove the image from each (change the cover or the block), and for published use republish or unpublish the lesson or course. Nothing is removed automatically.',
        { code: 'MEDIA_IN_USE', ...usage },
      );
    }
    const removed = await this.assets.delete(id);
    if (!removed) throw new NotFoundError('Media not found');
    try {
      await this.storage.delete(removed.storageKey);
    } catch {
      this.logger.error(
        `The stored file of deleted media ${removed.id} could not be removed and is now an orphan`,
      );
    }
  }

  private async require(id: string): Promise<StoredMediaAsset> {
    const asset = await this.assets.findById(id);
    if (!asset) throw new NotFoundError('Media not found');
    return asset;
  }
}

function staleMetadata(): ConflictError {
  return new ConflictError('Someone else changed this image\u2019s details. Reload the image to see the latest details, then make your change again.');
}

function toPublic(asset: StoredMediaAsset): MediaAsset {
  const { storageKey: _storageKey, ...rest } = asset;
  return rest;
}
