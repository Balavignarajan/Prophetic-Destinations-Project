/**
 * HTTP byte ranges (RFC 9110 section 14) for the learner media route, so a video can be played and sought without being downloaded whole. Pure rules.
 *
 * Only a single range of the `bytes` unit is served. A header that is malformed, names another unit or asks for several ranges is ignored (the whole file is
 * sent, which is always a valid answer); a single well-formed range that lies wholly outside the file is unsatisfiable (416).
 */
export interface ByteRange {
  /** First byte, inclusive. */
  start: number;
  /** Last byte, inclusive. */
  end: number;
}

export type ParsedRange = { kind: 'NONE' } | { kind: 'RANGE'; range: ByteRange } | { kind: 'UNSATISFIABLE' };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export function parseByteRange(header: string | undefined, size: number): ParsedRange {
  if (!header || !Number.isSafeInteger(size) || size <= 0) return { kind: 'NONE' };
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return { kind: 'NONE' };
  const [, first, last] = match;
  if (first === '' && last === '') return { kind: 'NONE' };

  if (first === '') {
    // "bytes=-N": the last N bytes.
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { kind: 'UNSATISFIABLE' };
    return { kind: 'RANGE', range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }
  const start = Number(first);
  if (!Number.isSafeInteger(start)) return { kind: 'NONE' };
  if (start >= size) return { kind: 'UNSATISFIABLE' };
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (!Number.isSafeInteger(end) || end < start) return { kind: 'NONE' }; // "bytes=5-2" is not a range at all
  return { kind: 'RANGE', range: { start, end } };
}
