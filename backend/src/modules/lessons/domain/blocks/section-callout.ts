import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';

/**
 * SECTION_INTRO and CALLOUT content contracts (feature register BLK-002 P0 and BLK-003 P1; CMS Components sheet).
 *
 * Documented fields:
 *   Section Intro / Heading: "Title; subtitle; optional visual" - a major lesson transition.
 *   Callout / Key Idea:      "Callout type; title; body"        - short emphasis ("Remember, Key Idea, Prophecy Principle or similar").
 * The workbook gives no field-level schema, limits or closed list of callout types (open decision D7), so everything below is PROPOSED, NOT
 * APPROVED, and meant to be revised:
 *
 *   SECTION_INTRO: { "title": "…", "subtitle": "optional", "image": { "mediaId": "<uuid>", "altText": "…" } }   // image optional ("visual")
 *   CALLOUT:       { "calloutType": "REMEMBER" | "KEY_IDEA" | "PROPHECY_PRINCIPLE", "title": "optional", "body": "…" }
 *
 *  - The callout types are exactly the three NAMED in the requirement. "Or similar" leaves the closed list open (D7), so no other type exists
 *    yet; adding one is a one-line change here, in the admin catalog and in the mobile renderer. The type is shown to learners as a TEXT label,
 *    never by colour alone.
 *  - "Visual treatment" of a section intro is not defined anywhere; only the optional image is. Its media follows the IMAGE block conventions
 *    (media-library asset, alternative text required before publishing).
 *  - Plain text only (a callout is author-written emphasis: it is not Scripture and not a quotation). A CALLOUT may have level variants (enabled
 *    PROVISIONALLY, variant-types.ts); a SECTION_INTRO may not.
 * Limits (proposed): section title 200, subtitle 300, alt text 500; callout title 200, body 1500.
 * Drafts may be incomplete. Publishing requires: section title (and alt text if there is an image); callout type and body.
 */
export const SECTION_LIMITS = { title: 200, subtitle: 300, altText: 500 } as const;
export const CALLOUT_LIMITS = { title: 200, body: 1500 } as const;
export const CALLOUT_TYPES = ['REMEMBER', 'KEY_IDEA', 'PROPHECY_PRINCIPLE'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function checkKeys(content: Record<string, unknown>, allowed: readonly string[], problems: ContentProblem[]): void {
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!allowed.includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
}

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

// ------------------------------------------------------------------------------------------------------------- SECTION_INTRO

export function validateSectionIntroShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Section introduction content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['title', 'subtitle', 'image'], problems);
  checkText(content, 'title', SECTION_LIMITS.title, 'title', 'The title', problems);
  checkText(content, 'subtitle', SECTION_LIMITS.subtitle, 'subtitle', 'The subtitle', problems);
  if (content.image !== undefined) {
    const image = content.image;
    if (!isPlainObject(image)) {
      problems.push({ path: 'image', message: 'The image must be an object' });
    } else {
      for (const key of Object.keys(image)) if (key !== 'mediaId' && key !== 'altText') problems.push({ path: `image.${key}`, message: `Unknown key "image.${key}"` });
      if (image.mediaId !== undefined && (typeof image.mediaId !== 'string' || !UUID.test(image.mediaId))) {
        problems.push({ path: 'image.mediaId', message: 'The image must be a media asset id' });
      }
      checkText(image, 'altText', SECTION_LIMITS.altText, 'image.altText', 'The image description', problems);
    }
  }
  return problems;
}

export function validateSectionIntroComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (blank(c.title)) problems.push({ path: 'title', message: 'The section needs a title' });
  const image = isPlainObject(c.image) ? c.image : null;
  if (image) {
    if (typeof image.mediaId !== 'string') problems.push({ path: 'image.mediaId', message: 'The image details have no image chosen: choose an image or remove them' });
    else if (blank(image.altText)) problems.push({ path: 'image.altText', message: 'The image needs a description (alternative text) before publishing' });
  }
  return problems;
}

/** The media asset id of the optional image, if it has a well-formed one. */
export function sectionIntroMediaId(content: unknown): string | null {
  if (!isPlainObject(content) || !isPlainObject(content.image)) return null;
  const id = content.image.mediaId;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

// ------------------------------------------------------------------------------------------------------------------ CALLOUT

export function validateCalloutShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Callout content must be an object' }];
  const problems: ContentProblem[] = [];
  checkKeys(content, ['calloutType', 'title', 'body'], problems);
  if (content.calloutType !== undefined && !(CALLOUT_TYPES as readonly unknown[]).includes(content.calloutType)) {
    problems.push({ path: 'calloutType', message: 'The callout type must be Remember, Key idea or Prophecy principle' });
  }
  checkText(content, 'title', CALLOUT_LIMITS.title, 'title', 'The title', problems);
  checkText(content, 'body', CALLOUT_LIMITS.body, 'body', 'The text', problems);
  return problems;
}

export function validateCalloutComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (typeof c.calloutType !== 'string') problems.push({ path: 'calloutType', message: 'Choose a type for the callout (Remember, Key idea or Prophecy principle)' });
  if (blank(c.body)) problems.push({ path: 'body', message: 'The callout needs its text' });
  return problems;
}
