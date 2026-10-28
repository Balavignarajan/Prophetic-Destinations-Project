import type { AppConfig } from '../../../config/index.js';
import { findSupportedType, isGlbMime } from '../domain/media-types.js';

/** The upload rules, validated once at start-up. */
export interface MediaSettings {
  /** The largest file of every type except a GLB model. */
  readonly maxBytes: number;
  /** The largest GLB 3D model. Separate on purpose: allowing models never raises the limit for pictures, video or animations. */
  readonly glbMaxBytes: number;
  /** MIME types that may be uploaded; every one of them is a type the module can verify. */
  readonly allowedTypes: ReadonlySet<string>;
}

export const MEDIA_SETTINGS = Symbol('MEDIA_SETTINGS');

/**
 * Turns the configured limits into settings. A type the module cannot verify from a file's bytes cannot be allowed:
 * the application refuses to start rather than accept files it cannot check.
 */
export function buildMediaSettings(
  config: Pick<AppConfig, 'mediaMaxBytes' | 'mediaGlbMaxBytes' | 'mediaAllowedTypes'>,
): MediaSettings {
  const unsupported = config.mediaAllowedTypes.filter(
    (type) => findSupportedType(type) === null,
  );
  if (unsupported.length > 0) {
    throw new Error(
      `MEDIA_ALLOWED_TYPES lists types the media module cannot verify: ${unsupported.join(', ')}`,
    );
  }
  return {
    maxBytes: config.mediaMaxBytes,
    glbMaxBytes: config.mediaGlbMaxBytes,
    allowedTypes: new Set(config.mediaAllowedTypes),
  };
}

/** The largest file of this (detected) type: the GLB limit for a 3D model, the general limit for everything else. */
export function maxBytesFor(settings: MediaSettings, mime: string): number {
  return isGlbMime(mime) ? settings.glbMaxBytes : settings.maxBytes;
}

/**
 * The largest body the upload parser reads before the file's type is known: the general limit, or the GLB limit when models are allowed and its limit is the larger.
 * The exact limit of the detected type is then applied by `maxBytesFor`, so a larger model ceiling never lets another kind of file through.
 */
export function uploadCeiling(settings: MediaSettings): number {
  return [...settings.allowedTypes].some(isGlbMime) ? Math.max(settings.maxBytes, settings.glbMaxBytes) : settings.maxBytes;
}
