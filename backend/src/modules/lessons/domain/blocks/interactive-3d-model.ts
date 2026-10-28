import { checkItemLevels } from './item-levels.js';
import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * INTERACTIVE_3D_MODEL content contract: a 3D model (a GLB file from the Media Library) that learners rotate and zoom, with numbered HOTSPOTS attached to points of the model. PROPOSED, NOT
 * APPROVED (no document lists this component; open decision D1), the same standing as MEDIA_ANIMATION and INTERACTIVE_IMAGE, whose hotspot contract this one follows.
 *
 *   { "title": "optional", "mediaId": "<the GLB file in the media library>", "posterMediaId": "<still image, optional>", "description": "optional",
 *     "hotspots": [ { "id": "h-ab12cd", "position": { "x": 0.1, "y": 2.4, "z": 0.3 }, "label": "short name", "explanation": "text shown when chosen",
 *                     "scripture": [ { reference, dataset?, refresh? }, ... ], "levels": ["INTERMEDIATE", "ADVANCED"] }, ... ] }
 *
 *  - `mediaId` must be a stored GLB model (`model/gltf-binary`, detected from the file's own bytes at upload). It is checked AGAIN when the block is saved (block.service.ts).
 *    `posterMediaId` is an ordinary image shown before the model is opened and saved with the lesson for offline reading; the model is online-only.
 *  - `position` is a point of the MODEL, never of the screen: its coordinates are in the model's own space (the glTF scene space after the nodes' transforms, in the model's units), so
 *    a hotspot stays on the same spot of the model whatever the camera, device or screen size. The numbers belong to the SPECIFIC model file they were placed on; if the model is
 *    replaced they may no longer fit (the Admin warns and lets the author clear them). A hotspot without a position is "not placed yet" (allowed in a draft, not for publishing).
 *  - `hotspots` is ordered; the order is the numbering and reading order. `id` is unique within the block and stable across edits (Scripture stamps are matched by it).
 *  - `scripture` is exactly the item Scripture contract of timeline events and image hotspots (scripture-refs.ts): references only; the server verifies and freezes the text.
 *  - `levels` is the shared item level visibility (item-levels.ts): absent = every level the block is shown at. The published snapshot of a level holds only that level's hotspots,
 *    without `levels`; the app does no filtering of its own.
 *  - Plain text only. The block has no level variants. Unknown keys are refused. Existing blocks without `hotspots` stay valid, and an empty list is allowed: the model is usable without hotspots.
 * A draft may be incomplete (no model yet; an unplaced or empty hotspot). Publishing requires the model; every hotspot SHOWN AT THE LEVEL being published must be placed, labelled and explained.
 */
export const MODEL_3D_LIMITS = {
  title: 200,
  description: 2_000,
  maxHotspots: 30,
  maxIdLength: 40,
  maxLabelLength: 100,
  maxExplanationLength: 1_000,
  /** The largest absolute value of a coordinate, in model units (metres for most models): far beyond any real model, small enough to refuse nonsense. */
  coordinateLimit: 100_000,
} as const;

const ALLOWED_KEYS = ['title', 'mediaId', 'posterMediaId', 'description', 'hotspots'] as const;
const HOTSPOT_KEYS = ['id', 'position', 'label', 'explanation', 'scripture', 'levels'] as const;
const POSITION_KEYS = ['x', 'y', 'z'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(source: Record<string, unknown>, key: string, max: number, path: string, label: string, problems: ContentProblem[]): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== 'string') problems.push({ path, message: `${label} must be text` });
  else if (value.length > max) problems.push({ path, message: `${label} must be at most ${max} characters` });
  else if (value.includes('\u0000')) problems.push({ path, message: `${label} must not contain NUL characters` });
}

const finiteWithin = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MODEL_3D_LIMITS.coordinateLimit;

export function validateModel3DShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: '3D model content must be an object' }];
  const L = MODEL_3D_LIMITS;
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  checkText(content, 'title', L.title, 'title', 'The title', problems);
  checkText(content, 'description', L.description, 'description', 'The description', problems);
  for (const key of ['mediaId', 'posterMediaId'] as const) {
    const value = content[key];
    if (value !== undefined && (typeof value !== 'string' || !UUID.test(value))) {
      problems.push({ path: key, message: `${key === 'mediaId' ? 'The 3D model' : 'The poster'} must be a media asset id` });
    }
  }

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
    const position = hotspot.position;
    if (position !== undefined) {
      if (!isPlainObject(position)) {
        problems.push({ path: `${at}.position`, message: `${n}: the position must be { x, y, z }` });
      } else {
        for (const key of Object.keys(position)) {
          if (!(POSITION_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.position.${key}`, message: `${n}: unknown position key "${key}"` });
        }
        for (const axis of POSITION_KEYS) {
          if (!finiteWithin(position[axis])) problems.push({ path: `${at}.position.${axis}`, message: `${n}: ${axis} must be a number between -${L.coordinateLimit} and ${L.coordinateLimit}` });
        }
      }
    }
    checkText(hotspot, 'label', L.maxLabelLength, `${at}.label`, `${n}: the label`, problems);
    checkText(hotspot, 'explanation', L.maxExplanationLength, `${at}.explanation`, `${n}: the explanation`, problems);
    validateScriptureEntries(hotspot.scripture, `${at}.scripture`, n, problems);
    checkItemLevels(hotspot, `${at}.levels`, n, problems);
  });
  return problems;
}

/** What publishing needs. Assumes a valid shape. Hotspots are optional; the ones present (at the level being published) must be complete. */
export function validateModel3DComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (typeof c.mediaId !== 'string') problems.push({ path: 'mediaId', message: 'Choose the 3D model (a GLB file from the Media Library)' });
  const hotspots = Array.isArray(c.hotspots) ? c.hotspots : [];
  hotspots.forEach((raw, index) => {
    const hotspot = isPlainObject(raw) ? raw : {};
    const n = `Hotspot ${index + 1}`;
    if (!isPlainObject(hotspot.position)) problems.push({ path: `hotspots[${index}].position`, message: `${n} has not been placed on the model` });
    if (typeof hotspot.label !== 'string' || hotspot.label.trim() === '') problems.push({ path: `hotspots[${index}].label`, message: `${n} needs a label` });
    if (typeof hotspot.explanation !== 'string' || hotspot.explanation.trim() === '') {
      problems.push({ path: `hotspots[${index}].explanation`, message: `${n} needs an explanation` });
    }
  });
  return problems;
}

/** The model and its optional poster (well-formed ids only). */
export function model3DMedia(content: unknown): { mediaId: string | null; posterMediaId: string | null } {
  if (!isPlainObject(content)) return { mediaId: null, posterMediaId: null };
  const ok = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
  return { mediaId: ok(content.mediaId), posterMediaId: ok(content.posterMediaId) };
}
