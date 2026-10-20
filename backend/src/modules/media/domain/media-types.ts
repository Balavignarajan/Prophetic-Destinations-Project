/**
 * The file types the media module can VERIFY. A type is accepted only if (a) it is in this table and (b) it is in the
 * configured allow-list (`MEDIA_ALLOWED_TYPES`); the type of an upload is decided from the file's own first bytes,
 * never from the filename, the extension or the Content-Type the client sent.
 *
 * SVG is deliberately absent: it is markup that can carry script. Audio and video are absent until their handling is
 * decided (D4); adding a type means adding a signature check here.
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
];

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
