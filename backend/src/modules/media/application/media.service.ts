import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleError,
  NotFoundError,
} from '../../../shared-kernel/index.js';
import { newStorageKey, sanitizeFilename } from '../domain/filename.js';
import { detectMediaType, findSupportedType } from '../domain/media-types.js';
import type { MediaAsset, StoredMediaAsset } from '../domain/models.js';
import { MediaAssetRepository } from '../persistence/media-asset.repository.js';
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
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(MEDIA_SETTINGS) private readonly settings: MediaSettings,
  ) {}

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

  async get(id: string): Promise<MediaAsset> {
    return toPublic(await this.require(id));
  }

  async list(limit: number, offset: number) {
    const { items, total } = await this.assets.list(limit, offset);
    return { items: items.map(toPublic), total };
  }

  /** The asset and a stream of its bytes. 404 if either the row or the stored file is missing. */
  async openContent(id: string): Promise<MediaContent> {
    const asset = await this.require(id);
    try {
      const stream = await this.storage.open(asset.storageKey);
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

function toPublic(asset: StoredMediaAsset): MediaAsset {
  const { storageKey: _storageKey, ...rest } = asset;
  return rest;
}
