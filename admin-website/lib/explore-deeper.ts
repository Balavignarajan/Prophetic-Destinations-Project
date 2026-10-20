import { type ScriptureEntryDraft, buildScriptureList, readScriptureEntries } from './scripture-info';

/**
 * The EXPLORE_DEEPER lesson block (backend/src/modules/lessons/domain/blocks/map-explore.ts). PROPOSED schema, not approved:
 *   { title, intro, scripture?: [{ reference }] }
 * `title` and `intro` are the documented fields. `scripture` (cross-references, up to 5) is a proposal read from the guide ("detailed
 * cross-references"). Nested or linked study content is NOT part of the block: open decision D11.
 */
export const EXPLORE_LIMITS = { title: 200, intro: 4000, maxScripture: 5 } as const;

export interface ExploreContent {
  title: string;
  intro: string;
  scripture: ScriptureEntryDraft[];
  /** The stored/previewed `scripture` value as it came (for display only; never sent back). */
  scriptureRaw?: unknown;
}

export const EMPTY_EXPLORE: ExploreContent = { title: '', intro: '', scripture: [] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function readExplore(content: unknown): ExploreContent {
  const c = isObject(content) ? content : {};
  return { title: text(c.title), intro: text(c.intro), scripture: readScriptureEntries(c.scripture), scriptureRaw: c.scripture };
}

/** The content to save; the optional cross-references are left out when there are none. */
export function buildExplore(draft: ExploreContent): Record<string, unknown> {
  const out: Record<string, unknown> = { title: draft.title.trim(), intro: draft.intro.trim() };
  const scripture = buildScriptureList(draft.scripture);
  if (scripture) out.scripture = scripture;
  return out;
}

/** What is still missing before publication, in the author's words. */
export function exploreReadiness(content: ExploreContent): string[] {
  const out: string[] = [];
  if (!content.title.trim()) out.push('a title');
  if (!content.intro.trim()) out.push('an introduction');
  return out;
}
