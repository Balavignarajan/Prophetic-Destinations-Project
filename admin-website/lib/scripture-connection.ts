import { type ScriptureEntryDraft, buildScriptureEntries, readScriptureEntries } from './scripture-info';

/**
 * The SCRIPTURE_CONNECTION lesson block (backend/src/modules/lessons/domain/blocks/scripture-connection.ts). PROPOSED schema, not approved:
 *   { title?, connections: [{ id, label?, scripture: [{ reference }], explanation }] }
 * Connections keep the author's order. Each lists up to 5 structured Scripture references (the server verifies and stamps them; the text is never
 * stored in the block) and the author's own explanation, which is commentary and is kept apart from Scripture. Nothing suggests or infers how
 * passages relate. The workbook's "display style" has no approved values (open decision D8), so it is not part of the block.
 */
export const CONNECTION_LIMITS = { title: 200, maxConnections: 12, label: 200, explanation: 2000, minToPublish: 2 } as const;

export interface ConnectionDraft {
  id: string;
  label: string;
  explanation: string;
  /** Scripture references of the connection (references only; text and stamps belong to the server). */
  scripture: ScriptureEntryDraft[];
  /** The stored/previewed `scripture` value as it came (for display only; never sent back). */
  scriptureRaw?: unknown;
}

export interface ScriptureConnectionContent {
  title: string;
  connections: ConnectionDraft[];
}

export const EMPTY_CONNECTION_BLOCK: ScriptureConnectionContent = { title: '', connections: [] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Like ScriptureConnectionContent, plus how many stored entries were not usable objects (so the author can be told). */
export function readConnectionContent(content: unknown): ScriptureConnectionContent & { malformed: number } {
  const c = isObject(content) ? content : {};
  const seen = new Set<string>();
  const connections: ConnectionDraft[] = [];
  let malformed = 0;
  if (c.connections !== undefined && !Array.isArray(c.connections)) malformed += 1;
  if (Array.isArray(c.connections)) {
    malformed += c.connections.filter((e) => !isObject(e)).length;
    c.connections.filter(isObject).forEach((e, index) => {
      let id = text(e.id) || `c-${index + 1}`;
      while (seen.has(id)) id = `${id}-x`;
      seen.add(id);
      connections.push({ id, label: text(e.label), explanation: text(e.explanation), scripture: readScriptureEntries(e.scripture), scriptureRaw: e.scripture });
    });
  }
  return { title: text(c.title), connections, malformed };
}

/** The content to save: trimmed, the optional title and labels left out when empty. Scripture goes as references only (and refresh requests). */
export function buildConnectionContent(draft: ScriptureConnectionContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    connections: draft.connections.map((c) => ({
      id: c.id,
      ...(c.label.trim() ? { label: c.label.trim() } : {}),
      explanation: c.explanation.trim(),
      // an empty list is still sent as [] so a removed passage is really removed
      scripture: (buildScriptureEntries(c.scripture) as { scripture?: unknown[] }).scripture ?? [],
    })),
  };
  if (draft.title.trim()) out.title = draft.title.trim();
  return out;
}

export function newConnectionId(existing: readonly ConnectionDraft[]): string {
  const used = new Set(existing.map((e) => e.id));
  for (;;) {
    const id = `c-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

/** What is still missing before the block can be published, in the author's words (one entry per problem). */
export function connectionReadiness(content: ScriptureConnectionContent): string[] {
  const out: string[] = [];
  if (content.connections.length < CONNECTION_LIMITS.minToPublish) out.push(`Add at least ${CONNECTION_LIMITS.minToPublish} connections (a sequence or comparison needs two).`);
  content.connections.forEach((c, index) => {
    if (c.scripture.length === 0) out.push(`Connection ${index + 1} needs at least one Scripture passage.`);
    if (!c.explanation.trim()) out.push(`Connection ${index + 1} needs an explanation in your own words.`);
  });
  return out;
}
