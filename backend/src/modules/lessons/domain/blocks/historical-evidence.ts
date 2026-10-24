import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';

/**
 * HISTORICAL_EVIDENCE content contract (feature register BLK-020 / CMS-018: "Title; date/period; explanation; source/reference; optional
 * media"). The identifier is NEW: no historical-evidence type existed (the type list is the guide's 19; BLK-020 is workbook-only, open
 * decision D1), so it is added with its own migration. D1 (which component list governs) and D3 (per-level variants, "depth can vary by
 * level") remain OPEN. Level variants are enabled PROVISIONALLY (variant-types.ts): a level's version is another complete object of this same contract.
 *
 * PROPOSED, NOT APPROVED. Minimum schema covering the requirement, meant to be revised:
 *
 *   { "title": "…", "dateLabel": "c. 538 BC",
 *     "explanation": "the AUTHOR's own explanation",
 *     "quote":  "optional QUOTED text from the source, exactly as quoted (never the author's words)",
 *     "source": { "citation": "who/what/where it comes from", "url": "https://… (optional, http or https only)" },
 *     "image":  { "mediaId": "<uuid>", "altText": "…", "caption": "optional", "credit": "optional" }   // optional media
 *   }
 *
 *  - Three kinds of text are kept apart: the author's `explanation`, the optional `quote` from the source, and the `source` attribution.
 *    Clients show them distinctly. Nothing is fetched from `source.url`; it is only a labelled external link (not available offline).
 *  - `dateLabel` is display text ("605 BC", "AD 70", a named period): never parsed or sorted.
 *  - `image` follows the IMAGE block conventions (media-library asset; alternative text required before publishing).
 *  - Plain text only. Scripture references are NOT part of this schema (not documented as required for this component).
 * Limits (proposed): title 200, dateLabel 100, explanation 3000, quote 2000, citation 500, url 2048, altText 500, caption 500, credit 300.
 * Draft: anything may be missing. Publishing requires title, date/period, explanation and a source citation, and alternative text if there is
 * an image.
 */
export const EVIDENCE_LIMITS = {
  title: 200,
  dateLabel: 100,
  explanation: 3000,
  quote: 2000,
  citation: 500,
  url: 2048,
  altText: 500,
  caption: 500,
  credit: 300,
} as const;

const KEYS = ['title', 'dateLabel', 'explanation', 'quote', 'source', 'image'] as const;
const SOURCE_KEYS = ['citation', 'url'] as const;
const IMAGE_KEYS = ['mediaId', 'altText', 'caption', 'credit'] as const;
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

/** An external source link: an absolute http or https address with a host and no embedded credentials. Never fetched. */
export function isSafeSourceUrl(value: string): boolean {
  if (value.length > EVIDENCE_LIMITS.url || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function validateHistoricalEvidenceShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Historical evidence content must be an object' }];
  const L = EVIDENCE_LIMITS;
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  checkText(content, 'title', L.title, 'title', 'The title', problems);
  checkText(content, 'dateLabel', L.dateLabel, 'dateLabel', 'The date or period', problems);
  checkText(content, 'explanation', L.explanation, 'explanation', 'The explanation', problems);
  checkText(content, 'quote', L.quote, 'quote', 'The quoted text', problems);

  if (content.source !== undefined) {
    const s = content.source;
    if (!isPlainObject(s)) {
      problems.push({ path: 'source', message: 'The source must be an object' });
    } else {
      for (const key of Object.keys(s)) if (!(SOURCE_KEYS as readonly string[]).includes(key)) problems.push({ path: `source.${key}`, message: `Unknown key "source.${key}"` });
      checkText(s, 'citation', L.citation, 'source.citation', 'The source citation', problems);
      if (s.url !== undefined && s.url !== '') {
        if (typeof s.url !== 'string') problems.push({ path: 'source.url', message: 'The source link must be text' });
        else if (!isSafeSourceUrl(s.url)) problems.push({ path: 'source.url', message: 'The source link must be a full http:// or https:// web address' });
      }
    }
  }
  if (content.image !== undefined) {
    const i = content.image;
    if (!isPlainObject(i)) {
      problems.push({ path: 'image', message: 'The image must be an object' });
    } else {
      for (const key of Object.keys(i)) if (!(IMAGE_KEYS as readonly string[]).includes(key)) problems.push({ path: `image.${key}`, message: `Unknown key "image.${key}"` });
      if (i.mediaId !== undefined && (typeof i.mediaId !== 'string' || !UUID.test(i.mediaId))) problems.push({ path: 'image.mediaId', message: 'The image must be a media asset id' });
      checkText(i, 'altText', L.altText, 'image.altText', 'The image description', problems);
      checkText(i, 'caption', L.caption, 'image.caption', 'The image caption', problems);
      checkText(i, 'credit', L.credit, 'image.credit', 'The image credit', problems);
    }
  }
  return problems;
}

/** What publishing needs. Assumes a valid shape. */
export function validateHistoricalEvidenceComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const c = isPlainObject(content) ? content : {};
  const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
  if (blank(c.title)) problems.push({ path: 'title', message: 'The evidence needs a title' });
  if (blank(c.dateLabel)) problems.push({ path: 'dateLabel', message: 'The evidence needs a date or period' });
  if (blank(c.explanation)) problems.push({ path: 'explanation', message: 'The evidence needs an explanation' });
  const source = isPlainObject(c.source) ? c.source : {};
  if (blank(source.citation)) problems.push({ path: 'source.citation', message: 'The evidence needs a source (who or what it comes from)' });
  const image = isPlainObject(c.image) ? c.image : null;
  if (image && typeof image.mediaId === 'string' && blank(image.altText)) {
    problems.push({ path: 'image.altText', message: 'The image needs a description (alternative text) before publishing' });
  }
  if (image && image.mediaId === undefined && Object.keys(image).length > 0) {
    problems.push({ path: 'image.mediaId', message: 'The image details have no image chosen: choose an image or remove them' });
  }
  return problems;
}

/** The media asset id of the optional image, if it has a well-formed one. */
export function evidenceMediaId(content: unknown): string | null {
  if (!isPlainObject(content) || !isPlainObject(content.image)) return null;
  const id = content.image.mediaId;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}
