import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * INTERACTIVE_IMAGE content contract (feature register BLK-007: "tappable regions open approved explanation").
 *
 * PROPOSED, NOT APPROVED. The repository has no approved schema for this component (open questions D4 per-item level flags, D9 media
 * rules, D10 image fitting rule), so this is the minimum that works and is meant to be revised:
 *
 *   {
 *     "mediaId":  "<uuid of a media asset>",
 *     "altText":  "what the image shows",
 *     "caption":  "optional", "source": "optional",
 *     "hotspots": [ { "id": "h-ab12cd", "x": 0.42, "y": 0.3, "label": "short name", "explanation": "text shown when chosen" }, ... ]
 *   }
 *
 *  - `x` and `y` are fractions (0 to 1) of the WHOLE image's width and height, measured from its top-left corner, so they do not depend
 *    on screen size. Clients must show the whole image (never crop it) and place markers on the image as actually displayed.
 *  - `hotspots` is ordered; the order is the numbering and reading order. `id` is unique within the block and stable across edits.
 *  - Plain text only. Hotspots have no level flags of their own (D4 is open) and the block has no level variants.
 * A draft may be incomplete (no image yet, an unplaced marker with no x/y, empty text); publishing requires an image with alternative
 * text and at least one hotspot, each placed, labelled and explained.
 */
export const INTERACTIVE_IMAGE_LIMITS = {
  maxAltTextLength: 500,
  maxCaptionLength: 500,
  maxSourceLength: 300,
  maxHotspots: 20,
  maxIdLength: 40,
  maxLabelLength: 100,
  maxExplanationLength: 1000,
} as const;

const ALLOWED_KEYS = ['mediaId', 'altText', 'caption', 'source', 'hotspots'] as const;
const HOTSPOT_KEYS = ['id', 'x', 'y', 'label', 'explanation', 'scripture'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(source: Record<string, unknown>, key: string, max: number, path: string, problems: ContentProblem[]): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== 'string') problems.push({ path, message: `${key} must be text` });
  else if (value.length > max) problems.push({ path, message: `${key} must be at most ${max} characters` });
  else if (value.includes('\u0000')) problems.push({ path, message: `${key} must not contain NUL characters` });
}

export function validateInteractiveImageShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Interactive image content must be an object' }];
  const L = INTERACTIVE_IMAGE_LIMITS;
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  if (content.mediaId !== undefined && (typeof content.mediaId !== 'string' || !UUID.test(content.mediaId))) {
    problems.push({ path: 'mediaId', message: 'mediaId must be a media asset id' });
  }
  checkText(content, 'altText', L.maxAltTextLength, 'altText', problems);
  checkText(content, 'caption', L.maxCaptionLength, 'caption', problems);
  checkText(content, 'source', L.maxSourceLength, 'source', problems);

  const hotspots = content.hotspots;
  if (hotspots === undefined) return problems;
  if (!Array.isArray(hotspots)) {
    problems.push({ path: 'hotspots', message: 'hotspots must be a list' });
    return problems;
  }
  if (hotspots.length > L.maxHotspots) problems.push({ path: 'hotspots', message: `At most ${L.maxHotspots} hotspots are allowed` });
  const seen = new Set<string>();
  hotspots.slice(0, L.maxHotspots).forEach((hotspot, index) => {
    const at = `hotspots[${index}]`;
    const n = `Hotspot ${index + 1}`;
    if (!isPlainObject(hotspot)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    for (const key of Object.keys(hotspot)) {
      if (isMarkupLikeKey(key)) problems.push({ path: `${at}.${key}`, message: `${n}: markup-like key "${key}" is not allowed` });
      else if (!(HOTSPOT_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.${key}`, message: `${n}: unknown key "${key}"` });
    }
    const id = hotspot.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > L.maxIdLength || !ID.test(id)) {
      problems.push({ path: `${at}.id`, message: `${n} needs an id of letters, digits, "-" or "_" (up to ${L.maxIdLength} characters)` });
    } else if (seen.has(id)) {
      problems.push({ path: `${at}.id`, message: `${n} repeats the id of another hotspot` });
    } else {
      seen.add(id);
    }
    const hasX = hotspot.x !== undefined;
    const hasY = hotspot.y !== undefined;
    if (hasX !== hasY) problems.push({ path: at, message: `${n} must have both a horizontal and a vertical position, or neither` });
    for (const axis of ['x', 'y'] as const) {
      const value = hotspot[axis];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) {
        problems.push({ path: `${at}.${axis}`, message: `${n}: the ${axis === 'x' ? 'horizontal' : 'vertical'} position must be between 0 and 1` });
      }
    }
    checkText(hotspot, 'label', L.maxLabelLength, `${at}.label`, problems);
    checkText(hotspot, 'explanation', L.maxExplanationLength, `${at}.explanation`, problems);
    validateScriptureEntries(hotspot.scripture, `${at}.scripture`, n, problems);
  });
  return problems;
}

/** What publishing needs. Assumes a valid shape. */
export function validateInteractiveImageComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  if (!isPlainObject(content) || typeof content.mediaId !== 'string') problems.push({ path: 'mediaId', message: 'An image must be chosen' });
  if (!isPlainObject(content) || typeof content.altText !== 'string' || content.altText.trim().length === 0) {
    problems.push({ path: 'altText', message: 'Alternative text is required before publishing' });
  }
  const hotspots = isPlainObject(content) && Array.isArray(content.hotspots) ? content.hotspots : [];
  if (hotspots.length === 0) problems.push({ path: 'hotspots', message: 'Add at least one hotspot before publishing' });
  hotspots.forEach((raw, index) => {
    const hotspot = isPlainObject(raw) ? raw : {};
    const n = `Hotspot ${index + 1}`;
    if (typeof hotspot.x !== 'number' || typeof hotspot.y !== 'number') {
      problems.push({ path: `hotspots[${index}]`, message: `${n} has not been placed on the image` });
    }
    if (typeof hotspot.label !== 'string' || hotspot.label.trim() === '') problems.push({ path: `hotspots[${index}].label`, message: `${n} needs a label` });
    if (typeof hotspot.explanation !== 'string' || hotspot.explanation.trim() === '') {
      problems.push({ path: `hotspots[${index}].explanation`, message: `${n} needs an explanation` });
    }
  });
  return problems;
}

/** The media asset id this content points at, if it has a well-formed one. */
export function interactiveImageMediaId(content: unknown): string | null {
  return isPlainObject(content) && typeof content.mediaId === 'string' && UUID.test(content.mediaId) ? content.mediaId : null;
}
