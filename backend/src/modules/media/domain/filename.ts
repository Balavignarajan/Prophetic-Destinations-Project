import { randomBytes } from 'node:crypto';

/** Longest display name kept (the database column is 255). */
export const FILENAME_MAX_LENGTH = 255;
const FALLBACK_NAME = 'upload';

/**
 * A display name for an upload. It is only ever shown to people; it is NEVER used to build a path or a storage key
 * (the server generates those). Directory parts, control characters and characters that are awkward in file
 * names are removed, and the length is limited.
 */
export function sanitizeFilename(raw: string | undefined): string {
  if (!raw) return FALLBACK_NAME;
  let name = raw.normalize('NFC');
  // keep only what follows the last path separator, whichever style the client used
  name = name.slice(
    Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1,
  );
  name = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (name === '') return FALLBACK_NAME;
  if (name.length > FILENAME_MAX_LENGTH) {
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
    name = name.slice(0, FILENAME_MAX_LENGTH - extension.length) + extension;
  }
  return name;
}

/**
 * Multer reads file names as Latin-1; browsers send UTF-8. Re-decode, and keep the original if that does not give
 * valid UTF-8.
 */
export function decodeUploadedFilename(raw: string): string {
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('�') ? raw : decoded;
}

/** `ab/abcdef0123456789abcdef0123456789`: 128 random bits in hex, sharded by the first byte. Unguessable and path-safe. */
export function newStorageKey(): string {
  const id = randomBytes(16).toString('hex');
  return `${id.slice(0, 2)}/${id}`;
}

const STORAGE_KEY = /^[0-9a-f]{2}\/[0-9a-f]{32}$/;

export function isValidStorageKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    STORAGE_KEY.test(key) &&
    key.slice(0, 2) === key.slice(3, 5)
  );
}
