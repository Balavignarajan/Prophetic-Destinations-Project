import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared-kernel/index.js';
import { MediaService, type MediaContent } from './media.service.js';
import type { MediaAsset } from '../domain/models.js';
import { isAnimatedWebp } from '../domain/media-types.js';
import { MediaAssetRepository } from '../persistence/media-asset.repository.js';

/**
 * What other modules may ask of Media. Today that is only whether an asset exists (so a future cover or image
 * reference can be validated). It deliberately offers no way to read bytes or learn where they are stored.
 */
@Injectable()
export class MediaFacade {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly service: MediaService,
  ) {}

  async find(id: string): Promise<MediaAsset | null> {
    const asset = await this.assets.findById(id);
    if (!asset) return null;
    const { storageKey: _storageKey, ...rest } = asset;
    return rest;
  }

  /** Checks that `id` is an existing image of the media library (used for course and lesson covers). */
  async requireImage(id: string): Promise<void> {
    const asset = await this.find(id);
    if (!asset) {
      throw new BusinessRuleError('The selected cover image no longer exists. Choose another image.', {
        code: 'MEDIA_NOT_FOUND',
        field: 'coverMediaId',
        mediaId: id,
      });
    }
    if (!asset.contentType.startsWith('image/')) {
      throw new BusinessRuleError('The selected cover is not an image', {
        code: 'MEDIA_NOT_AN_IMAGE',
        field: 'coverMediaId',
        mediaId: id,
      });
    }
  }

  /**
   * Checks that `id` is a real ANIMATED WebP, from the stored file's own first bytes (never from its name or recorded type). A still image is refused:
   * a Media / Animation block must not promise motion the file does not have.
   */
  async requireAnimatedWebp(id: string): Promise<void> {
    const content = await this.service.openContent(id);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of content.stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        chunks.push(buffer);
        size += buffer.length;
        if (size >= 4096) break;
      }
    } finally {
      content.stream.destroy();
    }
    if (!isAnimatedWebp(Buffer.concat(chunks))) {
      throw new BusinessRuleError('This file is not an animated WebP. Choose an animated WebP image, or use an Image block for a still picture.', {
        code: 'MEDIA_NOT_ANIMATED',
        mediaId: id,
      });
    }
  }

  /**
   * The bytes of an asset, for a caller that has ALREADY decided the reader may see it (the learner image route, which only
   * asks after finding the asset inside the active published snapshot). It performs no permission check of its own.
   */
  openContent(id: string): Promise<MediaContent> {
    return this.service.openContent(id);
  }
}
