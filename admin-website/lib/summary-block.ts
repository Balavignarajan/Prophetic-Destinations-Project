import { type ScriptureEntryDraft, buildScriptureList, readScriptureEntries } from './scripture-info';

/**
 * The SUMMARY lesson block (backend/src/modules/lessons/domain/blocks/summary.ts). PROPOSED schema, not approved:
 *   { heading?, takeaways: string[], keyScripture?: [{ reference }], prophecyTakeaways?: string[], applicationTakeaways?: string[] }
 * COMPATIBILITY: `takeaways` IS the "key ideas" list (an older summary has only heading and takeaways and is read, edited and saved exactly as
 * before; the new lists are simply empty and are left out of the saved content when empty). Plain text, every list in display order.
 * Key Scripture is structured references only; the server verifies, stamps and (at publication) freezes them. "Next study" is open decision D2
 * and is not part of the block.
 */
export const SUMMARY_HEADING_MAX = 200;
export const SUMMARY_TAKEAWAY_MAX = 600;
export const SUMMARY_MAX_TAKEAWAYS = 20;

export interface SummaryContent {
  heading: string;
  /** The key ideas. */
  takeaways: string[];
  prophecyTakeaways: string[];
  applicationTakeaways: string[];
  /** Key Scripture references (references only; text and stamps belong to the server). */
  keyScripture: ScriptureEntryDraft[];
  /** The stored/previewed `keyScripture` value as it came (for display only; never sent back). */
  keyScriptureRaw?: unknown;
}

export const EMPTY_SUMMARY: SummaryContent = { heading: '', takeaways: [], prophecyTakeaways: [], applicationTakeaways: [], keyScripture: [] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** The fields of a stored SUMMARY block's content (missing fields become empty). */
export function readSummaryContent(content: unknown): SummaryContent {
  const c = isObject(content) ? content : {};
  return {
    heading: typeof c.heading === 'string' ? c.heading : '',
    takeaways: strings(c.takeaways),
    prophecyTakeaways: strings(c.prophecyTakeaways),
    applicationTakeaways: strings(c.applicationTakeaways),
    keyScripture: readScriptureEntries(c.keyScripture),
    keyScriptureRaw: c.keyScripture,
  };
}

/** The content to save: trimmed, blank takeaways dropped, an empty heading left out. */
export function buildSummaryContent(draft: SummaryContent): Record<string, unknown> {
  const clean = (list: string[]) => list.map((t) => t.trim()).filter(Boolean);
  const out: Record<string, unknown> = { takeaways: clean(draft.takeaways) };
  if (draft.heading.trim()) out.heading = draft.heading.trim();
  const keyScripture = buildScriptureList(draft.keyScripture);
  if (keyScripture) out.keyScripture = keyScripture;
  if (clean(draft.prophecyTakeaways).length > 0) out.prophecyTakeaways = clean(draft.prophecyTakeaways);
  if (clean(draft.applicationTakeaways).length > 0) out.applicationTakeaways = clean(draft.applicationTakeaways);
  return out;
}

/** What the server said about the summary, in its own words, falling back to the generic message. */
export function summaryErrorMessage(error: unknown, fallback: string): string {
  const e = error as { status?: number; message?: string; payload?: { message?: string; details?: { problems?: { message?: string }[] } } } | null;
  if (e?.status === 409) {
    return 'Someone saved a newer version of this block. Your changes are still here; close this form, reload the page to review the latest version, and try again.';
  }
  const problems = e?.payload?.details?.problems?.map((p) => p.message).filter(Boolean);
  if (problems && problems.length > 0) return problems.join(' ');
  return e?.payload?.message || e?.message || fallback;
}
