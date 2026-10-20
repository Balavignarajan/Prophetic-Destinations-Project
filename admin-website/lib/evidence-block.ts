/**
 * The HISTORICAL_EVIDENCE lesson block (backend/src/modules/lessons/domain/blocks/historical-evidence.ts). PROPOSED schema, not approved:
 *   { title, dateLabel, explanation, quote?, source: { citation, url? }, image?: { mediaId, altText, caption?, credit? } }
 * The author's explanation, the quoted source text and the source attribution are three separate fields. The source link is only a link:
 * nothing is fetched from it. No imports: usable anywhere.
 */
export const EVIDENCE_LIMITS = { title: 200, dateLabel: 100, explanation: 3000, quote: 2000, citation: 500, url: 2048, altText: 500, caption: 500, credit: 300 } as const;

export interface EvidenceContent {
  title: string;
  dateLabel: string;
  explanation: string;
  quote: string;
  citation: string;
  url: string;
  mediaId: string;
  altText: string;
  caption: string;
  credit: string;
}

export const EMPTY_EVIDENCE: EvidenceContent = { title: '', dateLabel: '', explanation: '', quote: '', citation: '', url: '', mediaId: '', altText: '', caption: '', credit: '' };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function readEvidence(content: unknown): EvidenceContent & { malformed: boolean } {
  const c = isObject(content) ? content : {};
  const source = isObject(c.source) ? c.source : {};
  const image = isObject(c.image) ? c.image : {};
  return {
    title: text(c.title),
    dateLabel: text(c.dateLabel),
    explanation: text(c.explanation),
    quote: text(c.quote),
    citation: text(source.citation),
    url: text(source.url),
    mediaId: text(image.mediaId),
    altText: text(image.altText),
    caption: text(image.caption),
    credit: text(image.credit),
    malformed: (c.source !== undefined && !isObject(c.source)) || (c.image !== undefined && !isObject(c.image)),
  };
}

/** True for a full http(s) address, the only kind of source link accepted. */
export function isHttpUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** The content to save; empty optional parts are left out, and image details are dropped with the image (the media file stays). */
export function buildEvidence(draft: EvidenceContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: draft.title.trim(),
    dateLabel: draft.dateLabel.trim(),
    explanation: draft.explanation.trim(),
  };
  if (draft.quote.trim()) out.quote = draft.quote.trim();
  if (draft.citation.trim() || draft.url.trim()) {
    out.source = { citation: draft.citation.trim(), ...(draft.url.trim() ? { url: draft.url.trim() } : {}) };
  }
  if (draft.mediaId) {
    out.image = { mediaId: draft.mediaId, altText: draft.altText.trim(), ...(draft.caption.trim() ? { caption: draft.caption.trim() } : {}), ...(draft.credit.trim() ? { credit: draft.credit.trim() } : {}) };
  }
  return out;
}
