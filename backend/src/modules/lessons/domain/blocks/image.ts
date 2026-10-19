import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';

/**
 * IMAGE content contract (feature register BLK-006: "image with caption, alt text and source/rights metadata").
 *
 *   { "mediaId": "<uuid of a media asset>", "altText": "...", "caption": "...", "source": "..." }
 *
 * The block holds a REFERENCE to a stored media asset, never file bytes or a URL. Only `mediaId` is required to be a UUID;
 * whether the asset exists is checked by the block service on save (it needs the Media module). Plain text only, never markup.
 * A draft may be incomplete (no image yet, no alt text yet); publishing requires an image and its alt text.
 */
export const IMAGE_LIMITS = {
  maxAltTextLength: 500,
  maxCaptionLength: 500,
  maxSourceLength: 300,
} as const;

const ALLOWED_KEYS = ['mediaId', 'altText', 'caption', 'source'] as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(
  content: Record<string, unknown>,
  key: 'altText' | 'caption' | 'source',
  max: number,
  problems: ContentProblem[],
): void {
  const value = content[key];
  if (value === undefined) return;
  if (typeof value !== 'string') {
    problems.push({ path: key, message: `${key} must be a string` });
  } else if (value.length > max) {
    problems.push({
      path: key,
      message: `${key} must be at most ${max} characters`,
    });
  } else if (value.includes('\u0000')) {
    problems.push({
      path: key,
      message: `${key} must not contain NUL characters`,
    });
  }
}

export function validateImageShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) {
    return [{ path: '', message: 'Image content must be an object' }];
  }
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) {
      problems.push({
        path: key,
        message: `Markup-like key "${key}" is not allowed`,
      });
    } else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      problems.push({ path: key, message: `Unknown key "${key}"` });
    }
  }
  const mediaId = content.mediaId;
  if (mediaId !== undefined && (typeof mediaId !== 'string' || !UUID.test(mediaId))) {
    problems.push({ path: 'mediaId', message: 'mediaId must be a media asset id' });
  }
  checkText(content, 'altText', IMAGE_LIMITS.maxAltTextLength, problems);
  checkText(content, 'caption', IMAGE_LIMITS.maxCaptionLength, problems);
  checkText(content, 'source', IMAGE_LIMITS.maxSourceLength, problems);
  return problems;
}

/** What publishing needs: an image, and text that describes it for people who cannot see it. */
export function validateImageComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  if (!isPlainObject(content) || typeof content.mediaId !== 'string') {
    problems.push({ path: 'mediaId', message: 'An image must be chosen' });
  }
  if (
    !isPlainObject(content) ||
    typeof content.altText !== 'string' ||
    content.altText.trim().length === 0
  ) {
    problems.push({
      path: 'altText',
      message: 'Alternative text is required before publishing',
    });
  }
  return problems;
}

/** The media asset id this content points at, if it has a well-formed one. */
export function imageMediaId(content: unknown): string | null {
  return isPlainObject(content) &&
    typeof content.mediaId === 'string' &&
    UUID.test(content.mediaId)
    ? content.mediaId
    : null;
}
