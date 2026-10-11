import type { AppConfig } from '../../../config/index.js';
import { findSupportedType } from '../domain/media-types.js';

/** The upload rules, validated once at start-up. */
export interface MediaSettings {
  readonly maxBytes: number;
  /** MIME types that may be uploaded; every one of them is a type the module can verify. */
  readonly allowedTypes: ReadonlySet<string>;
}

export const MEDIA_SETTINGS = Symbol('MEDIA_SETTINGS');

/**
 * Turns the configured limits into settings. A type the module cannot verify from a file's bytes cannot be allowed:
 * the application refuses to start rather than accept files it cannot check.
 */
export function buildMediaSettings(
  config: Pick<AppConfig, 'mediaMaxBytes' | 'mediaAllowedTypes'>,
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
    allowedTypes: new Set(config.mediaAllowedTypes),
  };
}
