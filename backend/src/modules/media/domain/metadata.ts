import { BusinessRuleError } from '../../../shared-kernel/index.js';

/**
 * Descriptive metadata of a media asset. The workbook Data Model lists title, alt_text, caption, source, rights_notes and tags (CMS-015 asks for title, alt
 * text, source/rights, tags); the limits below are PROPOSED, not documented. All fields are optional. `altText` and `source` are DEFAULTS offered
 * when the image is chosen for content: they are copied into the content field only where that is empty, and the content field is the one that counts.
 * `rightsNotes` is an internal note for staff and is never proof of permission or shown to learners.
 */
export const MEDIA_METADATA_LIMITS = { title: 200, altText: 500, caption: 500, source: 300, rightsNotes: 1000, maxTags: 20, tag: 40 } as const;

export interface MediaMetadata {
  title: string | null;
  altText: string | null;
  /** Default caption (proposed limit 500). */
  caption: string | null;
  source: string | null;
  rightsNotes: string | null;
  tags: string[];
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Plain text, trimmed; blank means "none". Line breaks are allowed only where `multiline` is set. */
export function cleanMetadataText(value: string | null | undefined, max: number, label: string, multiline = false): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (text === '') return null;
  if (text.length > max) throw new BusinessRuleError(`${label} can be at most ${max} characters`, { code: 'MEDIA_METADATA_TOO_LONG', field: label, max });
  const bad = multiline ? CONTROL : /[\u0000-\u001f\u007f]/;
  if (bad.test(text)) throw new BusinessRuleError(`${label} must be plain text`, { code: 'MEDIA_METADATA_INVALID', field: label });
  return text;
}

/** Tags: trimmed, single-spaced, no blanks, no repeats (case-insensitive, first spelling kept), order kept. */
export function cleanTags(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = cleanMetadataText(raw.replace(/\s+/g, ' '), MEDIA_METADATA_LIMITS.tag, 'A tag');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  if (out.length > MEDIA_METADATA_LIMITS.maxTags) {
    throw new BusinessRuleError(`An image can have at most ${MEDIA_METADATA_LIMITS.maxTags} tags`, { code: 'MEDIA_TAGS_TOO_MANY', max: MEDIA_METADATA_LIMITS.maxTags });
  }
  return out;
}

export function sameMetadata(a: MediaMetadata, b: MediaMetadata): boolean {
  return a.title === b.title && a.altText === b.altText && a.caption === b.caption && a.source === b.source && a.rightsNotes === b.rightsNotes && JSON.stringify(a.tags) === JSON.stringify(b.tags);
}
