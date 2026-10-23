/**
 * Which files count as a Lottie animation (BLK-016 "Lottie-type asset"). Pure rules; no database, no storage.
 *
 * A Lottie file is JSON DATA that a player draws: it holds no program. Two features of the format can still reach outside the file or run text as code, and
 * they are refused rather than relied on to be ignored by every player:
 *  - EXPRESSIONS (a property whose `x` is a text): After Effects expressions are JavaScript that some players evaluate;
 *  - EXTERNAL RESOURCES: an image asset or font that is a web address (`u`, `p`, `fPath` naming http(s)://, // or any other scheme) would make the app fetch
 *    from a third party. Images and fonts embedded in the file as data are allowed.
 * Only the plain JSON form is accepted (the `.lottie` zip form and anything else are not): the file must be UTF-8 JSON, an object that has the fields every
 * Lottie file has (version, frame rate, in/out points, size and layers), within the limits below, which keep a file from being a decompression-style bomb
 * (a deeply nested or enormous document) for the players that read it.
 */
export const LOTTIE_LIMITS = {
  /** The largest accepted file. Animations are small vector data; a larger file is almost certainly something else. */
  maxBytes: 2 * 1024 * 1024,
  maxDepth: 48,
  maxNodes: 400_000,
  maxLayers: 2000,
  /** Pixel size of the composition. */
  maxDimension: 8192,
  maxFrameRate: 240,
} as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A reference to something outside the file: any scheme (`http:`, `file:`, `javascript:` ...) or a protocol-relative address. Embedded data is not one. */
function isExternal(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  if (text === '') return false;
  if (text.startsWith('data:')) return false;
  return text.startsWith('//') || /^[a-z][a-z0-9+.-]*:/.test(text);
}

/**
 * Why these bytes are not an acceptable Lottie file, in a sentence an author can act on, or null when they are. Looks at the whole document, so call it on the
 * complete upload.
 */
export function lottieProblem(bytes: Buffer): string | null {
  if (bytes.length === 0 || bytes.length > LOTTIE_LIMITS.maxBytes) return `A Lottie file must be at most ${Math.round(LOTTIE_LIMITS.maxBytes / (1024 * 1024))} MB.`;
  let text = bytes.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // a byte-order mark is harmless
  if (!text.trimStart().startsWith('{')) return 'This is not a Lottie JSON file.';
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return 'This is not valid JSON, so it cannot be a Lottie file.';
  }
  if (!isObject(document)) return 'This is not a Lottie file.';
  const { v, fr, ip, op, w, h, layers } = document;
  if (typeof v !== 'string' || !finite(fr) || !finite(ip) || !finite(op) || !finite(w) || !finite(h) || !Array.isArray(layers)) {
    return 'This JSON file is missing the fields every Lottie animation has (version, frame rate, start and end frame, size and layers).';
  }
  if (fr <= 0 || fr > LOTTIE_LIMITS.maxFrameRate || op <= ip) return 'The frame rate or the start and end frames of this animation are not valid.';
  if (w <= 0 || h <= 0 || w > LOTTIE_LIMITS.maxDimension || h > LOTTIE_LIMITS.maxDimension) return 'The size of this animation is not valid.';
  if (layers.length === 0 || layers.length > LOTTIE_LIMITS.maxLayers) return 'This animation has no layers, or too many.';

  // One walk over the whole document: depth and size limits, expressions and external references.
  let nodes = 0;
  let problem: string | null = null;
  const stack: { value: unknown; depth: number }[] = [{ value: document, depth: 0 }];
  while (stack.length > 0 && problem === null) {
    const { value, depth } = stack.pop()!;
    nodes += 1;
    if (nodes > LOTTIE_LIMITS.maxNodes) return 'This animation is too complex.';
    if (depth > LOTTIE_LIMITS.maxDepth) return 'This animation is nested too deeply.';
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'object' && item !== null) stack.push({ value: item, depth: depth + 1 });
    } else if (isObject(value)) {
      // An expression is a text stored under `x` (bezier handles use numbers or lists under `x`); text under `x` is never part of a plain animation.
      if (typeof value.x === 'string') problem = 'This animation uses expressions (code inside the file), which are not allowed. Export it without expressions.';
      else if (isExternal(value.u) || isExternal(value.fPath)) problem = 'This animation loads images or fonts from the internet, which is not allowed. Embed them in the file.';
      else if (typeof value.p === 'string' && value.p.trim() !== '' && !value.p.trim().toLowerCase().startsWith('data:') && ('w' in value || 'h' in value)) {
        // An image asset that is a file name or address instead of embedded data would need a second file (or the internet) that an upload cannot carry.
        problem = 'This animation refers to separate image files or addresses, which are not allowed. Embed its images in the file.';
      }
      if (problem === null) for (const child of Object.values(value)) if (typeof child === 'object' && child !== null) stack.push({ value: child, depth: depth + 1 });
    }
  }
  return problem;
}

/** True when these bytes are an acceptable Lottie file. */
export const isLottieJson = (bytes: Buffer): boolean => lottieProblem(bytes) === null;

/** True when the bytes start like a JSON object, i.e. someone meant to upload JSON (used to say WHY a rejected file was rejected). */
export function looksLikeJsonObject(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 64).toString('utf8').replace(/^﻿/, '').trimStart();
  return head.startsWith('{');
}
