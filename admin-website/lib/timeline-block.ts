import { levelsField, readItemLevels } from './item-levels';
import { type ScriptureEntryDraft, buildScriptureEntries, readScriptureEntries } from './scripture-info';

/**
 * The TIMELINE lesson block (backend/src/modules/lessons/domain/blocks/timeline.ts). PROPOSED schema, not approved:
 *   { heading?: string, events: [{ id, dateLabel, title, explanation, levels? }] }
 * `levels` (optional) reserves an event for some levels (CMS-017); none = every level the block is shown at.
 * `dateLabel` is display text only ("605 BC", "c. 538 BC", "the seventy weeks"): never parsed, converted or sorted. Events keep the
 * author's order. An event may also carry an image: { mediaId, altText, caption?, source? } as in the IMAGE block. Scripture references per
 * event: `scripture` is a list of structured references (see scripture-info.ts); the server verifies and stamps them.
 */
export const TIMELINE_LIMITS = { heading: 200, maxEvents: 40, dateLabel: 100, title: 200, explanation: 2000, altText: 500, caption: 500, source: 300 } as const;

export interface TimelineEventDraft {
  id: string;
  dateLabel: string;
  title: string;
  explanation: string;
  /** Optional media-library image (empty = none). */
  mediaId: string;
  altText: string;
  caption: string;
  source: string;
  /** Scripture references of the event (references only; text and stamps belong to the server). */
  scripture: ScriptureEntryDraft[];
  /** The stored/previewed `scripture` value as it came (for display only; never sent back). */
  scriptureRaw?: unknown;
  /** The levels this event is reserved for; null/absent = every level the block is shown at. */
  levels?: string[] | null;
}

export interface TimelineContent {
  heading: string;
  events: TimelineEventDraft[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Like TimelineContent, plus how many entries of the stored events list were not usable objects (so the author can be told). */
export function readTimelineContent(content: unknown): TimelineContent & { malformed: number } {
  const c = isObject(content) ? content : {};
  const seen = new Set<string>();
  const events: TimelineEventDraft[] = [];
  let malformed = 0;
  if (c.events !== undefined && !Array.isArray(c.events)) malformed += 1;
  if (Array.isArray(c.events)) {
    malformed += c.events.filter((e) => !isObject(e)).length;
    c.events.filter(isObject).forEach((e, index) => {
      let id = text(e.id) || `e-${index + 1}`;
      while (seen.has(id)) id = `${id}-x`;
      seen.add(id);
      events.push({
        id,
        dateLabel: text(e.dateLabel),
        title: text(e.title),
        explanation: text(e.explanation),
        mediaId: text(e.mediaId),
        altText: text(e.altText),
        caption: text(e.caption),
        source: text(e.source),
        scripture: readScriptureEntries(e.scripture),
        scriptureRaw: e.scripture,
        levels: readItemLevels(e.levels),
      });
    });
  }
  return { heading: text(c.heading), events, malformed };
}

export function buildTimelineContent(draft: TimelineContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    events: draft.events.map((e) => ({
      id: e.id,
      dateLabel: e.dateLabel.trim(),
      title: e.title.trim(),
      explanation: e.explanation.trim(),
      // The image fields are saved only when an image is chosen; removing the image drops its description too (the media file stays).
      ...(e.mediaId ? { mediaId: e.mediaId, altText: e.altText.trim(), ...(e.caption.trim() ? { caption: e.caption.trim() } : {}), ...(e.source.trim() ? { source: e.source.trim() } : {}) } : {}),
      ...buildScriptureEntries(e.scripture),
      ...levelsField(e.levels),
    })),
  };
  if (draft.heading.trim()) out.heading = draft.heading.trim();
  return out;
}

export function newEventId(existing: readonly TimelineEventDraft[]): string {
  const used = new Set(existing.map((e) => e.id));
  for (;;) {
    const id = `e-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}
