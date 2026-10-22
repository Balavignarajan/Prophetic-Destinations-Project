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
 *   { "title": "…", "intro": "plain text, paragraphs separated by blank lines", "scripture": [ { reference, dataset?, refresh? }, ... ],
 *     "blocks": [ { "id": "…", "type": "RICH_TEXT", "content": { …that type's own content… } }, ... ] }
 *
 *  - `title` and `intro` are the documented fields. `scripture` (up to 5 cross-references, shared contract: scripture-refs.ts) is a PROPOSAL read
 *    from "detailed cross-references"; it is optional and the block needs no Scripture text without it.
 *  - `blocks` is the optional NESTED study content ("may contain supported child content"): a short ordered list of ordinary lesson blocks, each with
 *    its own stable `id`, its `type` and that type's OWN content, validated and completed by the SAME definitions the lesson uses for that type (no second
 *    schema; the registry passes them in). Only a conservative set of informational, non-recursive types may be nested (EXPLORE_DEEPER_NESTED_TYPES):
 *    never a QUIZ (it scores and saves progress), never another EXPLORE_DEEPER (no recursion), and nothing that needs the lesson's own layout or
 *    interaction (section intros, continue exploring, hotspot images, timelines, ...). One level of nesting only, at most maxBlocks children.
 *  - Children have no level rows or variants of their own: they appear at exactly the levels the Explore Deeper block appears at (D11 stays open for any
 *    finer rule). Published, the children are part of the lesson snapshot with the block, so they work offline with the lesson; nothing is fetched when
 *    the section is opened. Their images follow the ordinary lesson media route (publishedImageIds, media usage).
 *  - Unknown keys are rejected so nothing is silently stored.
 *  - It is NOT Advanced-only: which levels see it is the block's ordinary level visibility. No level variants.
 *  - Published, the content is part of the lesson snapshot (offline with the lesson); nothing is downloaded when it is opened.
 */
export const MAP_LIMITS = { maxTitleLength: 200 } as const;
export const EXPLORE_DEEPER_LIMITS = { maxTitleLength: 200, maxIntroLength: 4000, maxBlocks: 10, maxBlocksBytes: 150_000 } as const;

/**
 * The block types that may be nested inside an Explore Deeper section: informational, non-recursive, and with nothing that scores or saves progress.
 * A conservative choice: the specification does not list the allowed set (open decision D11), so adding a type later is a one-line change here plus its
 * renderer, and nothing is ever nested that the lesson itself could not already show.
 */
export const EXPLORE_DEEPER_NESTED_TYPES = [
  'RICH_TEXT',
  'CALLOUT',
  'SCRIPTURE_PASSAGE',
  'SCRIPTURE_CONNECTION',
  'IMAGE',
  'WORD_STUDY',
  'SYMBOL_STUDY',
  'HISTORICAL_EVIDENCE',
] as const;

const NESTED_LABELS: Record<string, string> = {
  RICH_TEXT: 'text',
  CALLOUT: 'callout',
  SCRIPTURE_PASSAGE: 'Scripture passage',
  SCRIPTURE_CONNECTION: 'Scripture connection',
  IMAGE: 'image',
  WORD_STUDY: 'word study',
  SYMBOL_STUDY: 'symbol study',
  HISTORICAL_EVIDENCE: 'historical evidence',
};

/** What the Explore Deeper rules need to know of a nested block's type: the same checks the lesson applies to a block of that type. */
export interface NestedBlockRules {
  validateShape(content: unknown): ContentProblem[];
  validateComplete(content: unknown): ContentProblem[];
  extractReferences(content: unknown): { kind: 'MEDIA' | 'QUIZ'; targetId: string; animated?: boolean }[];
}
/** Gives the rules of an allowed nested type (the registry supplies its own definitions). Without one, only the structure of `blocks` is checked. */
export type NestedLookup = (type: string) => NestedBlockRules | undefined;

const EXPLORE_KEYS = ['title', 'intro', 'scripture', 'blocks'] as const;
const NESTED_KEYS = ['id', 'type', 'content'] as const;
const NESTED_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

/** The well-formed nested entries; none when `blocks` is absent or not a list (the shape check reports those problems). */
function nestedEntries(content: unknown): { id: string; type: string; content: unknown }[] {
  const blocks = isPlainObject(content) ? content.blocks : undefined;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((entry) =>
    isPlainObject(entry) && typeof entry.id === 'string' && typeof entry.type === 'string' ? [{ id: entry.id, type: entry.type, content: entry.content }] : [],
  );
}

/** The structure of the nested `blocks` list and, with a lookup, each nested block's content against its own type's shape rules. */
function validateNestedBlocks(value: unknown, lookup: NestedLookup | undefined, problems: ContentProblem[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    problems.push({ path: 'blocks', message: 'blocks must be a list' });
    return;
  }
  if (value.length > EXPLORE_DEEPER_LIMITS.maxBlocks) {
    problems.push({ path: 'blocks', message: `An Explore Deeper section can hold at most ${EXPLORE_DEEPER_LIMITS.maxBlocks} blocks` });
  }
  const seen = new Set<string>();
  value.slice(0, EXPLORE_DEEPER_LIMITS.maxBlocks).forEach((entry, index) => {
    const at = `blocks[${index}]`;
    const n = `Nested block ${index + 1}`;
    if (!isPlainObject(entry)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    for (const key of Object.keys(entry)) {
      if (isMarkupLikeKey(key)) problems.push({ path: `${at}.${key}`, message: `${n}: markup-like key "${key}" is not allowed` });
      else if (!(NESTED_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.${key}`, message: `${n}: unknown key "${key}"` });
    }
    if (typeof entry.id !== 'string' || !NESTED_ID.test(entry.id)) problems.push({ path: `${at}.id`, message: `${n} needs an id of letters, digits, "-" or "_"` });
    else if (seen.has(entry.id)) problems.push({ path: `${at}.id`, message: `${n}: the id "${entry.id}" is used twice` });
    else seen.add(entry.id);
    const type = entry.type;
    if (typeof type !== 'string' || !(EXPLORE_DEEPER_NESTED_TYPES as readonly string[]).includes(type)) {
      problems.push({
        path: `${at}.type`,
        message: `${n}: a block of type ${String(type)} cannot be placed inside Explore Deeper (allowed: ${EXPLORE_DEEPER_NESTED_TYPES.join(', ')})`,
      });
      return;
    }
    if (!isPlainObject(entry.content)) {
      problems.push({ path: `${at}.content`, message: `${n} (${NESTED_LABELS[type]}) needs content` });
      return;
    }
    for (const problem of lookup?.(type)?.validateShape(entry.content) ?? []) {
      problems.push({ path: `${at}.content${problem.path ? `.${problem.path}` : ''}`, message: `${n} (${NESTED_LABELS[type]}): ${problem.message}` });
    }
  });
  // The whole document must stay within what a block may store (the database CHECK is 200,000 bytes); a clear message beats a failed save.
  if (problems.length === 0 && Buffer.byteLength(JSON.stringify(value)) > EXPLORE_DEEPER_LIMITS.maxBlocksBytes) {
    problems.push({ path: 'blocks', message: `The nested blocks are too large together (limit ${EXPLORE_DEEPER_LIMITS.maxBlocksBytes} bytes). Shorten them or move some into the lesson.` });
  }
}

export function validateExploreDeeperShape(content: unknown, lookup?: NestedLookup): ContentProblem[] {
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
  validateNestedBlocks(content.blocks, lookup, problems);
  return problems;
}

/** What publishing needs: a title and an introduction, and each nested block complete by its own type's rules. Assumes a valid shape. */
export function validateExploreDeeperComplete(content: unknown, lookup?: NestedLookup): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const source = isPlainObject(content) ? content : {};
  if (typeof source.title !== 'string' || source.title.trim() === '') problems.push({ path: 'title', message: 'Explore Deeper needs a title before publishing' });
  if (typeof source.intro !== 'string' || source.intro.trim() === '') problems.push({ path: 'intro', message: 'Explore Deeper needs an introduction before publishing' });
  nestedEntries(source).forEach((entry, index) => {
    for (const problem of lookup?.(entry.type)?.validateComplete(entry.content) ?? []) {
      problems.push({
        path: `blocks[${index}].content${problem.path ? `.${problem.path}` : ''}`,
        message: `Nested block ${index + 1} (${NESTED_LABELS[entry.type] ?? entry.type}): ${problem.message}`,
      });
    }
  });
  return problems;
}

/** The media (and quiz) ids the nested blocks point at, by each nested type's own rules, so they are checked, protected and delivered like any other. */
export function exploreDeeperReferences(content: unknown, lookup?: NestedLookup): { kind: 'MEDIA' | 'QUIZ'; targetId: string; animated?: boolean }[] {
  return nestedEntries(content).flatMap((entry) => lookup?.(entry.type)?.extractReferences(entry.content) ?? []);
}
