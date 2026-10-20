import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import {
  interactiveImageMediaId,
  validateInteractiveImageComplete,
  validateInteractiveImageShape,
} from './interactive-image.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * MAP and EXPLORE_DEEPER content contracts. Both identifiers already exist (block-types.ts, the database CHECK): no migration is needed.
 * Both schemas are PROPOSED, NOT APPROVED; the documented FIELDS are named below, everything else is a proposal.
 *
 * MAP (feature register BLK-014 "Map / Diagram"; workbook fields "map/diagram asset; optional markers/hotspots; labels; explanations"; guide:
 * "map/image with optional markers/hotspots. Do not build a GIS/map editor"):
 *
 *   { "title": "optional", "mediaId": "<media image>", "altText": "…", "caption": "optional", "source": "optional",
 *     "hotspots": [ { "id", "x", "y", "label", "explanation", "scripture": [ … ] }, ... ] }     // markers are OPTIONAL
 *
 *  - It is a static image (a map or a diagram from the media library). No live map, provider, geolocation or geographic calculation exists.
 *  - Markers reuse the INTERACTIVE_IMAGE hotspot contract exactly (interactive-image.ts: fractional x/y of the whole image, ordered, ids, optional
 *    Scripture references per marker, D10 fitting rule open, D4 per-marker level flags open). The stored key stays `hotspots`
 *    (the workbook says "markers/hotspots"); authors see "markers". Differences from INTERACTIVE_IMAGE: an optional `title`, and publishing does
 *    NOT require any marker (a map may simply be an image), but each marker that exists must be placed, labelled and explained.
 *  - The image needs alternative text before publishing (it is meaningful content).
 *
 * EXPLORE_DEEPER (BLK-017; workbook fields "title; intro; supported nested/linked study content"; guide: "optional deeper-study container,
 * often I/A; may contain supported child content"; guide §3 mentions "Explore Deeper sections for detailed cross-references"):
 *
 *   { "title": "…", "intro": "plain text, paragraphs separated by blank lines", "scripture": [ { reference, dataset?, refresh? }, ... ] }
 *
 *  - `title` and `intro` are the documented fields. `scripture` (up to 5 cross-references, shared contract: scripture-refs.ts) is a PROPOSAL read
 *    from "detailed cross-references"; it is optional and the block needs no Scripture text without it.
 *  - NESTED / LINKED STUDY CONTENT IS NOT IMPLEMENTED: open decision D11 (what it may contain and how levels apply to children) is unanswered, so
 *    no child-block model is invented. Unknown keys are rejected so nothing is silently stored.
 *  - It is NOT Advanced-only: which levels see it is the block's ordinary level visibility. No level variants.
 *  - Published, the content is part of the lesson snapshot (offline with the lesson); nothing is downloaded when it is opened.
 */
export const MAP_LIMITS = { maxTitleLength: 200 } as const;
export const EXPLORE_DEEPER_LIMITS = { maxTitleLength: 200, maxIntroLength: 4000 } as const;

const EXPLORE_KEYS = ['title', 'intro', 'scripture'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The interactive-image messages talk about hotspots; a map calls them markers. */
const asMarkers = (problems: ContentProblem[]): ContentProblem[] =>
  problems.map((p) => ({
    ...p,
    message: p.message.replace('Interactive image content', 'Map content').replace(/Hotspots/g, 'Markers').replace(/hotspots/g, 'markers').replace(/Hotspot/g, 'Marker').replace(/hotspot/g, 'marker'),
  }));

// ------------------------------------------------------------------------------------------------------------------------------ MAP

export function validateMapShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Map content must be an object' }];
  const { title, ...rest } = content;
  const problems: ContentProblem[] = [];
  if (title !== undefined) {
    if (typeof title !== 'string') problems.push({ path: 'title', message: 'title must be text' });
    else if (title.length > MAP_LIMITS.maxTitleLength) problems.push({ path: 'title', message: `title must be at most ${MAP_LIMITS.maxTitleLength} characters` });
    else if (title.includes('\u0000')) problems.push({ path: 'title', message: 'title must not contain NUL characters' });
  }
  return [...problems, ...asMarkers(validateInteractiveImageShape(rest))];
}

/** What publishing needs: an image with alternative text; markers are optional, but each existing marker must be complete. */
export function validateMapComplete(content: unknown): ContentProblem[] {
  const { title: _title, ...rest } = isPlainObject(content) ? content : ({} as Record<string, unknown>);
  void _title;
  return asMarkers(validateInteractiveImageComplete(rest)).filter((p) => p.path !== 'hotspots' || !p.message.startsWith('Add at least one'));
}

export const mapMediaId = interactiveImageMediaId;

// ------------------------------------------------------------------------------------------------------------------------ EXPLORE_DEEPER

export function validateExploreDeeperShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Explore Deeper content must be an object' }];
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(EXPLORE_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  for (const [key, max, label] of [['title', EXPLORE_DEEPER_LIMITS.maxTitleLength, 'The title'], ['intro', EXPLORE_DEEPER_LIMITS.maxIntroLength, 'The introduction']] as const) {
    const value = content[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') problems.push({ path: key, message: `${label} must be text` });
    else if (value.length > max) problems.push({ path: key, message: `${label} must be at most ${max} characters` });
    else if (value.includes('\u0000')) problems.push({ path: key, message: `${label} must not contain NUL characters` });
  }
  validateScriptureEntries(content.scripture, 'scripture', 'Cross-references', problems);
  return problems;
}

/** What publishing needs: a title and an introduction. Assumes a valid shape. */
export function validateExploreDeeperComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const source = isPlainObject(content) ? content : {};
  if (typeof source.title !== 'string' || source.title.trim() === '') problems.push({ path: 'title', message: 'Explore Deeper needs a title before publishing' });
  if (typeof source.intro !== 'string' || source.intro.trim() === '') problems.push({ path: 'intro', message: 'Explore Deeper needs an introduction before publishing' });
  return problems;
}
