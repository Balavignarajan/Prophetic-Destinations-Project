import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * TIMELINE content contract (feature register BLK-013: "ordered prophecy/history events; supports dates and prophetic periods").
 * A timeline INSIDE a lesson; there is no global master timeline (out of scope per the workbook).
 *
 * PROPOSED, NOT APPROVED. The repository has no approved schema (open question D4: do events carry their own level flags), so this
 * is the minimum that works and is meant to be revised:
 *
 *   {
 *     "heading": "optional",
 *     "events": [ { "id": "e-ab12cd", "dateLabel": "c. 538 BC", "title": "…", "explanation": "…",
 *                   "mediaId": "<uuid, optional>", "altText": "…", "caption": "optional", "source": "optional" }, ... ]
 *   }
 *
 *  - `dateLabel` is DISPLAY TEXT (the data model says date_or_period is not always Gregorian): "605 BC", "AD 70", "c. 538 BC", "the
 *    seventy weeks". Nothing parses, converts, sorts or calculates it.
 *  - `events` keep the AUTHOR'S order; clients show them in exactly that order. Nothing is sorted or inferred.
 *  - `id` is unique within the block and stable across edits.
 *  - An event MAY have an image: `mediaId` references a media-library image (same conventions as the IMAGE block: alt text, optional
 *    caption and source). Timelines without images stay valid. An image needs alternative text before publishing.
 *  - Plain text only. No level variants and no per-event level flags (D4 open).
 *  - An event MAY list up to 5 Scripture references in `scripture` (shape and rules: scripture-refs.ts). They are verified against the
 *    installed Scripture text when the lesson is published and frozen into the snapshot; the text is never stored in the block.
 * The timeline requirement stays NOT complete while the approved Scripture text is missing (references cannot be verified or published).
 * A draft may be incomplete; publishing requires at least one event and, for every event, a date label, a title and an explanation,
 * plus alternative text for every event image.
 */
export const TIMELINE_LIMITS = {
  maxHeadingLength: 200,
  maxEvents: 40,
  maxIdLength: 40,
  maxDateLabelLength: 100,
  maxTitleLength: 200,
  maxExplanationLength: 2000,
  maxAltTextLength: 500,
  maxCaptionLength: 500,
  maxSourceLength: 300,
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_KEYS = ['heading', 'events'] as const;
const EVENT_KEYS = ['id', 'dateLabel', 'title', 'explanation', 'mediaId', 'altText', 'caption', 'source', 'scripture'] as const;
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

export function validateTimelineShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Timeline content must be an object' }];
  const L = TIMELINE_LIMITS;
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  checkText(content, 'heading', L.maxHeadingLength, 'heading', 'The heading', problems);

  const events = content.events;
  if (events === undefined) return problems;
  if (!Array.isArray(events)) {
    problems.push({ path: 'events', message: 'events must be a list' });
    return problems;
  }
  if (events.length > L.maxEvents) problems.push({ path: 'events', message: `A timeline can have at most ${L.maxEvents} events` });
  const seen = new Set<string>();
  events.slice(0, L.maxEvents).forEach((event, index) => {
    const at = `events[${index}]`;
    const n = `Event ${index + 1}`;
    if (!isPlainObject(event)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    for (const key of Object.keys(event)) {
      if (isMarkupLikeKey(key)) problems.push({ path: `${at}.${key}`, message: `${n}: markup-like key "${key}" is not allowed` });
      else if (!(EVENT_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.${key}`, message: `${n}: unknown key "${key}"` });
    }
    const id = event.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > L.maxIdLength || !ID.test(id)) {
      problems.push({ path: `${at}.id`, message: `${n} needs an id of letters, digits, "-" or "_" (up to ${L.maxIdLength} characters)` });
    } else if (seen.has(id)) {
      problems.push({ path: `${at}.id`, message: `${n} repeats the id of another event` });
    } else {
      seen.add(id);
    }
    checkText(event, 'dateLabel', L.maxDateLabelLength, `${at}.dateLabel`, `${n}: the date or period`, problems);
    checkText(event, 'title', L.maxTitleLength, `${at}.title`, `${n}: the title`, problems);
    checkText(event, 'explanation', L.maxExplanationLength, `${at}.explanation`, `${n}: the explanation`, problems);
    if (event.mediaId !== undefined && (typeof event.mediaId !== 'string' || !UUID.test(event.mediaId))) {
      problems.push({ path: `${at}.mediaId`, message: `${n}: the image must be a media asset id` });
    }
    checkText(event, 'altText', L.maxAltTextLength, `${at}.altText`, `${n}: the image description`, problems);
    checkText(event, 'caption', L.maxCaptionLength, `${at}.caption`, `${n}: the image caption`, problems);
    checkText(event, 'source', L.maxSourceLength, `${at}.source`, `${n}: the image source`, problems);
    validateScriptureEntries(event.scripture, `${at}.scripture`, n, problems);
  });
  return problems;
}

/** What publishing needs. Assumes a valid shape. */
export function validateTimelineComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const events = isPlainObject(content) && Array.isArray(content.events) ? content.events : [];
  if (events.length === 0) problems.push({ path: 'events', message: 'Add at least one event before publishing' });
  events.forEach((raw, index) => {
    const event = isPlainObject(raw) ? raw : {};
    const n = `Event ${index + 1}`;
    const blank = (key: string) => typeof event[key] !== 'string' || (event[key] as string).trim() === '';
    if (blank('dateLabel')) problems.push({ path: `events[${index}].dateLabel`, message: `${n} needs a date or period` });
    if (blank('title')) problems.push({ path: `events[${index}].title`, message: `${n} needs a title` });
    if (blank('explanation')) problems.push({ path: `events[${index}].explanation`, message: `${n} needs an explanation` });
    if (event.mediaId !== undefined && blank('altText')) {
      problems.push({ path: `events[${index}].altText`, message: `${n} has an image but no description of it (alternative text is required before publishing)` });
    }
  });
  return problems;
}

/** Every media asset id the timeline's events point at (well-formed ids only). */
export function timelineMediaIds(content: unknown): string[] {
  const events = isPlainObject(content) && Array.isArray(content.events) ? content.events : [];
  const ids = new Set<string>();
  for (const event of events) {
    if (isPlainObject(event) && typeof event.mediaId === 'string' && UUID.test(event.mediaId)) ids.add(event.mediaId);
  }
  return [...ids];
}
