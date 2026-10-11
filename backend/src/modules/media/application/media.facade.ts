import { Injectable } from '@nestjs/common';
import type { MediaAsset } from '../domain/models.js';
import { MediaAssetRepository } from '../persistence/media-asset.repository.js';

/**
 * What other modules may ask of Media. Today that is only whether an asset exists (so a future cover or image
 * reference can be validated). It deliberately offers no way to read bytes or learn where they are stored.
 */
@Injectable()
export class MediaFacade {
  constructor(private readonly assets: MediaAssetRepository) {}

  async find(id: string): Promise<MediaAsset | null> {
    const asset = await this.assets.findById(id);
    if (!asset) return null;
    const { storageKey: _storageKey, ...rest } = asset;
    return rest;
  }
}
