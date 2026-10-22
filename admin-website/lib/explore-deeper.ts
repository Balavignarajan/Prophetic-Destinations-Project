import { richTextToEditorText } from './rich-text';
import { type ScriptureEntryDraft, buildScriptureList, readScriptureEntries } from './scripture-info';

/**
 * The EXPLORE_DEEPER lesson block (backend/src/modules/lessons/domain/blocks/map-explore.ts). PROPOSED schema, not approved:
 *   { title, intro, scripture?: [{ reference }], blocks?: [{ id, type, content }] }
 * `title` and `intro` are the documented fields. `scripture` (cross-references, up to 5) is a proposal read from the guide ("detailed cross-references").
 * `blocks` is the optional NESTED study content: a short ordered list of ordinary lesson blocks, each with a stable `id`, its `type` and that type's own
 * content, edited with the same dialogs the lesson uses for that type. Only the informational types in NESTED_TYPES can be nested (never a quiz, never
 * another Explore Deeper); the server enforces the same list. Nested blocks have no level settings of their own: they appear wherever the section does.
 */
export const EXPLORE_LIMITS = { title: 200, intro: 4000, maxScripture: 5, maxBlocks: 10 } as const;

/** The block types that may be nested, in the order the "Add" list offers them (the server's EXPLORE_DEEPER_NESTED_TYPES). */
export const NESTED_TYPES = [
  { type: 'RICH_TEXT', label: 'Text' },
  { type: 'CALLOUT', label: 'Callout' },
  { type: 'SCRIPTURE_PASSAGE', label: 'Scripture passage' },
  { type: 'SCRIPTURE_CONNECTION', label: 'Scripture connection' },
  { type: 'IMAGE', label: 'Image' },
  { type: 'WORD_STUDY', label: 'Word study' },
  { type: 'SYMBOL_STUDY', label: 'Symbol study' },
  { type: 'HISTORICAL_EVIDENCE', label: 'Historical evidence' },
] as const;

export type NestedType = (typeof NESTED_TYPES)[number]['type'];

export const nestedLabel = (type: string): string => NESTED_TYPES.find((t) => t.type === type)?.label ?? type;

/** One nested block as the editor keeps it: the stored entry, with its content exactly as the server last returned or the nested dialog last built it. */
export interface NestedBlockDraft {
  id: string;
  type: string;
  content: Record<string, unknown>;
}

export interface ExploreContent {
  title: string;
  intro: string;
  scripture: ScriptureEntryDraft[];
  /** The nested blocks, in order. */
  blocks: NestedBlockDraft[];
  /** The stored/previewed `scripture` value as it came (for display only; never sent back). */
  scriptureRaw?: unknown;
}

export const EMPTY_EXPLORE: ExploreContent = { title: '', intro: '', scripture: [], blocks: [] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A fresh id for a nested block (letters, digits, "-" and "_", as the server requires). Kept for the life of the block, across edits and reorders. */
export function newNestedId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** The stored nested entries. An entry that is not usable is kept out of the editor (the server never stores such an entry). */
export function readNestedBlocks(value: unknown): NestedBlockDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (isObject(entry) && typeof entry.id === 'string' && typeof entry.type === 'string' && isObject(entry.content) ? [{ id: entry.id, type: entry.type, content: entry.content }] : []));
}

export function readExplore(content: unknown): ExploreContent {
  const c = isObject(content) ? content : {};
  return { title: text(c.title), intro: text(c.intro), scripture: readScriptureEntries(c.scripture), blocks: readNestedBlocks(c.blocks), scriptureRaw: c.scripture };
}

/** The content to save; the optional cross-references and nested blocks are left out when there are none. */
export function buildExplore(draft: ExploreContent): Record<string, unknown> {
  const out: Record<string, unknown> = { title: draft.title.trim(), intro: draft.intro.trim() };
  const scripture = buildScriptureList(draft.scripture);
  if (scripture) out.scripture = scripture;
  if (draft.blocks.length > 0) out.blocks = draft.blocks.map((b) => ({ id: b.id, type: b.type, content: b.content }));
  return out;
}

/** What is still missing before publication, in the author's words. */
export function exploreReadiness(content: ExploreContent): string[] {
  const out: string[] = [];
  if (!content.title.trim()) out.push('a title');
  if (!content.intro.trim()) out.push('an introduction');
  return out;
}

const first = (...values: unknown[]): string => values.map((v) => text(v).trim()).find((v) => v.length > 0) ?? '';
const clip = (value: string, max = 90) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** One short line that says what a nested block holds, for the editor's list. Reads the stored content defensively; says so when nothing is set yet. */
export function nestedSummary(type: string, content: Record<string, unknown>): string {
  switch (type) {
    case 'RICH_TEXT':
      return clip(richTextToEditorText(content).replace(/\s+/g, ' ').trim()) || 'No text yet';
    case 'CALLOUT':
      return clip(first(content.title, content.body)) || 'No text yet';
    case 'SCRIPTURE_PASSAGE': {
      const r = isObject(content.reference) ? content.reference : null;
      if (!r) return 'No passage chosen yet';
      return `${String(r.bookId)} ${String(r.chapter)}:${String(r.startVerse)}${r.endVerse !== r.startVerse ? `-${String(r.endVerse)}` : ''}`;
    }
    case 'SCRIPTURE_CONNECTION':
      return clip(first(content.title)) || `${Array.isArray(content.connections) ? content.connections.length : 0} connection(s)`;
    case 'IMAGE':
      return clip(first(content.altText, content.caption)) || 'No description yet';
    case 'WORD_STUDY':
      return clip(first(content.englishWord)) || 'No word yet';
    case 'SYMBOL_STUDY':
      return clip(first(content.symbol)) || 'No symbol yet';
    case 'HISTORICAL_EVIDENCE':
      return clip(first(content.title)) || 'No title yet';
    default:
      return '';
  }
}
