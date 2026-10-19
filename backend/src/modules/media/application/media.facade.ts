import { Injectable } from '@nestjs/common';
import { MediaService, type MediaContent } from './media.service.js';
import type { MediaAsset } from '../domain/models.js';
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

  /**
   * The bytes of an asset, for a caller that has ALREADY decided the reader may see it (the learner image route, which only
   * asks after finding the asset inside the active published snapshot). It performs no permission check of its own.
   */
  openContent(id: string): Promise<MediaContent> {
    return this.service.openContent(id);
  }
}
