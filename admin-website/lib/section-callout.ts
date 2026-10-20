/**
 * SECTION_INTRO and CALLOUT blocks (backend/src/modules/lessons/domain/blocks/section-callout.ts). PROPOSED schemas, not approved:
 *   SECTION_INTRO { title, subtitle?, image?: { mediaId, altText } }
 *   CALLOUT       { calloutType: 'REMEMBER' | 'KEY_IDEA' | 'PROPHECY_PRINCIPLE', title?, body }
 * The three callout types are the ones NAMED in the requirement; the closed list is open decision D7. No imports: usable anywhere.
 */
export const SECTION_LIMITS = { title: 200, subtitle: 300, altText: 500 } as const;
export const CALLOUT_LIMITS = { title: 200, body: 1500 } as const;

export const CALLOUT_TYPES = [
  { value: 'REMEMBER', label: 'Remember' },
  { value: 'KEY_IDEA', label: 'Key idea' },
  { value: 'PROPHECY_PRINCIPLE', label: 'Prophecy principle' },
] as const;

export const calloutLabel = (value: string) => CALLOUT_TYPES.find((t) => t.value === value)?.label ?? '';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export interface SectionContent {
  title: string;
  subtitle: string;
  mediaId: string;
  altText: string;
}
export const EMPTY_SECTION: SectionContent = { title: '', subtitle: '', mediaId: '', altText: '' };

export function readSection(content: unknown): SectionContent {
  const c = isObject(content) ? content : {};
  const image = isObject(c.image) ? c.image : {};
  return { title: text(c.title), subtitle: text(c.subtitle), mediaId: text(image.mediaId), altText: text(image.altText) };
}

/** The content to save; empty optional parts are left out, and the picture's description is dropped with the picture (the file stays). */
export function buildSection(draft: SectionContent): Record<string, unknown> {
  const out: Record<string, unknown> = { title: draft.title.trim() };
  if (draft.subtitle.trim()) out.subtitle = draft.subtitle.trim();
  if (draft.mediaId) out.image = { mediaId: draft.mediaId, altText: draft.altText.trim() };
  return out;
}

export interface CalloutContent {
  calloutType: string;
  title: string;
  body: string;
}
export const EMPTY_CALLOUT: CalloutContent = { calloutType: '', title: '', body: '' };

export function readCallout(content: unknown): CalloutContent {
  const c = isObject(content) ? content : {};
  return { calloutType: text(c.calloutType), title: text(c.title), body: text(c.body) };
}

export function buildCallout(draft: CalloutContent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (draft.calloutType) out.calloutType = draft.calloutType;
  if (draft.title.trim()) out.title = draft.title.trim();
  if (draft.body.trim()) out.body = draft.body.trim();
  return out;
}
