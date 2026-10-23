import { isLottieJson } from './lottie.js';

/**
 * The file types the media module can VERIFY. A type is accepted only if (a) it is in this table and (b) it is in the
 * configured allow-list (`MEDIA_ALLOWED_TYPES`); the type of an upload is decided from the file's own first bytes,
 * never from the filename, the extension or the Content-Type the client sent.
 *
 * SVG is deliberately absent: it is markup that can carry script. Audio is absent. MP4 video and Lottie JSON (BLK-016) can be verified here, but they are
 * NOT in the default allow-list: an operator turns them on with MEDIA_ALLOWED_TYPES (and sets MEDIA_MAX_BYTES for the size of video that is acceptable),
 * because their hosting and size policy is not decided. Adding a type means adding a signature check here.
 */
export interface SupportedMediaType {
  readonly mime: string;
  /** Used for the stored object's name only; chosen by the server from the detected type. */
  readonly extension: string;
  /** Whether a browser may show it inline in the admin tool (otherwise it is offered as a download). */
  readonly inline: boolean;
  readonly matches: (bytes: Buffer) => boolean;
}

const startsWith = (bytes: Buffer, signature: readonly number[], at = 0) =>
  bytes.length >= at + signature.length &&
  signature.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

export const SUPPORTED_MEDIA_TYPES: readonly SupportedMediaType[] = [
  {
    mime: 'image/png',
    extension: 'png',
    inline: true,
    matches: (b) =>
      startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    inline: true,
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    mime: 'image/gif',
    extension: 'gif',
    inline: true,
    matches: (b) =>
      startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')),
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    inline: true,
    matches: (b) =>
      startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8),
  },
  {
    mime: 'application/pdf',
    extension: 'pdf',
    inline: false,
    matches: (b) => startsWith(b, ascii('%PDF-')),
  },
  {
    // MP4 (ISO base media file): a `ftyp` box first, with a major brand that is plain MP4/H.264-family. QuickTime (`qt  `), 3GPP, audio-only (`M4A `)
    // and image (`heic`...) brands are different files and are not accepted as video.
    mime: 'video/mp4',
    extension: 'mp4',
    inline: true,
    matches: isMp4,
  },
  {
    // Lottie animation, JSON form only. Accepted only when the whole document passes the Lottie rules (lottie.ts): no expressions, no external resources.
    mime: 'application/json',
    extension: 'json',
    inline: false,
    matches: isLottieJson,
  },
];

const MP4_BRANDS = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash'];

/** Whether the bytes start with an MP4 `ftyp` box whose major brand is one of the plain MP4 brands. */
export function isMp4(bytes: Buffer): boolean {
  if (bytes.length < 16 || !startsWith(bytes, ascii('ftyp'), 4)) return false;
  const boxSize = bytes.readUInt32BE(0);
  if (boxSize < 16 || boxSize > 4096) return false;
  return MP4_BRANDS.includes(bytes.subarray(8, 12).toString('latin1'));
}

export const isVideoMime = (mime: string): boolean => mime === 'video/mp4';
export const isLottieMime = (mime: string): boolean => mime === 'application/json';

/**
 * Whether the bytes (at least the first few KB) are an ANIMATED WebP: a RIFF/WEBP container whose first chunk is VP8X with the animation flag set and which
 * carries an ANIM chunk. A still WebP, a GIF or anything else is not. Used to validate Media / Animation blocks (separately from the strict image types above).
 */
export function isAnimatedWebp(bytes: Buffer): boolean {
  if (!(startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8) && startsWith(bytes, ascii('VP8X'), 12))) return false;
  if (bytes.length < 21 || (bytes[20] & 0x02) === 0) return false;
  return bytes.subarray(0, 4096).includes(Buffer.from('ANIM'));
}

/** The supported type whose signature the bytes carry, or null if none does. */
export function detectMediaType(bytes: Buffer): SupportedMediaType | null {
  return SUPPORTED_MEDIA_TYPES.find((type) => type.matches(bytes)) ?? null;
}

export function findSupportedType(mime: string): SupportedMediaType | null {
  return SUPPORTED_MEDIA_TYPES.find((type) => type.mime === mime) ?? null;
}
