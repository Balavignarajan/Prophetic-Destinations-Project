import { type ScriptureEntryDraft, buildScriptureEntries, readScriptureEntries } from './scripture-info';

/**
 * The INTERACTIVE_IMAGE lesson block (backend/src/modules/lessons/domain/blocks/interactive-image.ts). PROPOSED schema, not approved:
 *   { mediaId, altText, caption?, source?, hotspots: [{ id, x?, y?, label, explanation }] }
 * `x` and `y` are fractions (0 to 1) of the whole image's width and height from its top-left corner. A hotspot without x/y is
 * "not placed yet" (allowed in a draft, not for publishing).
 * The MAP block (backend map-explore.ts) reuses this exact content, adding an optional `title` and not requiring any marker: its markers are
 * these hotspots under the same stored key. `title` is empty (and never saved) for an interactive image.
 */
export const HOTSPOT_LIMITS = { altText: 500, caption: 500, source: 300, maxHotspots: 20, label: 100, explanation: 1000 } as const;

export interface HotspotDraft {
  id: string;
  /** Fraction 0..1 of the image width, or null when not placed. */
  x: number | null;
  y: number | null;
  label: string;
  explanation: string;
  /** Scripture references of the hotspot (references only; text and stamps belong to the server). */
  scripture: ScriptureEntryDraft[];
  /** The stored/previewed `scripture` value as it came (for display only; never sent back). */
  scriptureRaw?: unknown;
}

export interface HotspotContent {
  /** MAP only. */
  title: string;
  mediaId: string;
  altText: string;
  caption: string;
  source: string;
  hotspots: HotspotDraft[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const fraction = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null);

export function readHotspotContent(content: unknown): HotspotContent {
  const c = isObject(content) ? content : {};
  return {
    title: text(c.title),
    mediaId: text(c.mediaId),
    altText: text(c.altText),
    caption: text(c.caption),
    source: text(c.source),
    hotspots: Array.isArray(c.hotspots)
      ? c.hotspots.filter(isObject).map((h, index) => {
          const x = fraction(h.x);
          const y = fraction(h.y);
          return { id: text(h.id) || `h-${index + 1}`, x: x !== null && y !== null ? x : null, y: x !== null && y !== null ? y : null, label: text(h.label), explanation: text(h.explanation), scripture: readScriptureEntries(h.scripture), scriptureRaw: h.scripture };
        })
      : [],
  };
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/** The content to save. Unplaced hotspots are saved without x/y; empty optional fields are left out. */
export function buildHotspotContent(draft: HotspotContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    mediaId: draft.mediaId,
    altText: draft.altText.trim(),
    hotspots: draft.hotspots.map((h) => ({
      id: h.id,
      ...(h.x !== null && h.y !== null ? { x: round(h.x), y: round(h.y) } : {}),
      label: h.label.trim(),
      explanation: h.explanation.trim(),
      ...buildScriptureEntries(h.scripture),
    })),
  };
  if (draft.title.trim()) out.title = draft.title.trim();
  if (draft.caption.trim()) out.caption = draft.caption.trim();
  if (draft.source.trim()) out.source = draft.source.trim();
  return out;
}

/** A new id that no other hotspot of the block uses. */
export function newHotspotId(existing: readonly HotspotDraft[]): string {
  const used = new Set(existing.map((h) => h.id));
  for (;;) {
    const id = `h-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

export const clampFraction = (value: number) => Math.min(1, Math.max(0, value));
