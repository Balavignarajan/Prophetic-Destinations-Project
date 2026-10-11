import { GIF, HTML, JPEG, PDF, PNG, SVG, WEBP } from '../test-files.js';
import {
  FILENAME_MAX_LENGTH,
  decodeUploadedFilename,
  isValidStorageKey,
  newStorageKey,
  sanitizeFilename,
} from './filename.js';
import { detectMediaType, findSupportedType } from './media-types.js';

describe('detectMediaType', () => {
  it('recognises each supported type from its first bytes', () => {
    expect(detectMediaType(PNG)?.mime).toBe('image/png');
    expect(detectMediaType(JPEG)?.mime).toBe('image/jpeg');
    expect(detectMediaType(GIF)?.mime).toBe('image/gif');
    expect(detectMediaType(WEBP)?.mime).toBe('image/webp');
    expect(detectMediaType(PDF)?.mime).toBe('application/pdf');
  });

  it('does not recognise markup, scripts, executables, empty or truncated input', () => {
    for (const bytes of [
      SVG,
      HTML,
      Buffer.from('MZ\x90\x00'), // an executable
      Buffer.from('#!/bin/sh\necho hi'),
      Buffer.alloc(0),
      Buffer.from([0x89, 0x50]), // a truncated PNG signature
      Buffer.from('RIFF....WAVE'), // RIFF, but not WEBP
    ]) {
      expect(detectMediaType(bytes)).toBeNull();
    }
  });

  it('looks at the bytes only: a name or declared type cannot change the answer', () => {
    expect(detectMediaType(HTML)).toBeNull(); // would still be null if it were called "photo.png"
    expect(findSupportedType('image/svg+xml')).toBeNull();
    expect(findSupportedType('image/png')?.extension).toBe('png');
    expect(findSupportedType('application/pdf')?.inline).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeFilename('Holy Land map.png')).toBe('Holy Land map.png');
  });

  it('drops directory parts, whichever separator is used', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32\\evil.png')).toBe(
      'evil.png',
    );
    expect(sanitizeFilename('/absolute/path/photo.jpg')).toBe('photo.jpg');
    expect(sanitizeFilename('C:\\Users\\x\\photo.jpg')).toBe('photo.jpg');
  });

  it('removes control characters, awkward characters and leading or trailing dots', () => {
    expect(sanitizeFilename('a\u0000b\nc\u007f.png')).toBe('abc.png');
    expect(sanitizeFilename('we<ir>d:"na|me?*.png')).toBe('weirdname.png');
    expect(sanitizeFilename('...hidden.png...')).toBe('hidden.png');
    expect(sanitizeFilename('  spaced   out  .png ')).toBe('spaced out .png');
  });

  it('falls back when nothing is left, and limits the length while keeping the extension', () => {
    for (const raw of [undefined, '', '   ', '...', '../', '<>:|?*']) {
      expect(sanitizeFilename(raw)).toBe('upload');
    }
    const long = sanitizeFilename(`${'a'.repeat(400)}.png`);
    expect(long).toHaveLength(FILENAME_MAX_LENGTH);
    expect(long.endsWith('.png')).toBe(true);
  });

  it('re-reads the Latin-1 file names multer produces as UTF-8', () => {
    const sent = 'caf\u00e9 \u2013 map.png';
    const asLatin1 = Buffer.from(sent, 'utf8').toString('latin1');
    expect(decodeUploadedFilename(asLatin1)).toBe(sent);
    expect(decodeUploadedFilename('plain.png')).toBe('plain.png');
  });
});

describe('storage keys', () => {
  it('generates unique, path-safe keys', () => {
    const keys = new Set(Array.from({ length: 200 }, newStorageKey));
    expect(keys.size).toBe(200);
    for (const key of keys) {
      expect(isValidStorageKey(key)).toBe(true);
      expect(key).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{32}$/);
    }
  });

  it('rejects everything that is not a generated key', () => {
    const id = 'a'.repeat(32);
    for (const key of [
      '',
      '../etc/passwd',
      `aa/../${id}`,
      `/${id}`,
      `aa/${id}/extra`,
      `ab/${id}`, // the prefix must match the id
      `AA/${'A'.repeat(32)}`,
      `aa/${id}\u0000`,
      `aa\\${id}`,
      `aa/${'a'.repeat(31)}`,
      `aa/${'g'.repeat(32)}`,
      undefined,
      null,
      42,
    ]) {
      expect(isValidStorageKey(key), String(key)).toBe(false);
    }
  });
});
