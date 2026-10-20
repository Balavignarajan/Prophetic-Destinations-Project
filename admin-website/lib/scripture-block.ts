/**
 * The SCRIPTURE_PASSAGE lesson block (backend/src/modules/lessons/domain/blocks/scripture-passage.ts). PROPOSED schema, not approved:
 *   { reference?: { bookId, chapter, startVerse, endVerse }, commentary?: string, dataset?: { id, version } }
 * The block stores only the structured reference (and the author's commentary); the Scripture text is looked up from the server's data set
 * when the lesson is published, and `dataset` is recorded by the server (the admin never sends it). No imports: usable anywhere.
 */
export const SCRIPTURE_COMMENTARY_MAX = 2000;

export interface ScriptureRef {
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

export interface ScriptureBlockContent {
  reference: ScriptureRef | null;
  commentary: string;
}

/** The passage as frozen into a published snapshot, which the learner preview also returns. */
export interface FrozenPassage {
  display: string;
  source: { translation: string; edition: string; version: string };
  verses: { verse: number; text: string }[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

export function readScriptureBlock(content: unknown): ScriptureBlockContent {
  const c = isObject(content) ? content : {};
  const r = isObject(c.reference) ? c.reference : null;
  const reference =
    r && typeof r.bookId === 'string' && whole(r.chapter) && whole(r.startVerse) && whole(r.endVerse)
      ? { bookId: r.bookId, chapter: r.chapter, startVerse: r.startVerse, endVerse: r.endVerse }
      : null;
  return { reference, commentary: typeof c.commentary === 'string' ? c.commentary : '' };
}

/** The content to save. The text and the data set stamp are never sent: the server supplies them. */
export function buildScriptureBlock(draft: ScriptureBlockContent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (draft.reference) out.reference = draft.reference;
  if (draft.commentary.trim()) out.commentary = draft.commentary.trim();
  return out;
}

export function readFrozenPassage(content: unknown): FrozenPassage | null {
  if (!isObject(content) || typeof content.display !== 'string' || !isObject(content.source) || !Array.isArray(content.verses)) return null;
  const s = content.source;
  return {
    display: content.display,
    source: { translation: String(s.translation ?? ''), edition: String(s.edition ?? ''), version: String(s.version ?? '') },
    verses: (content.verses as unknown[]).filter(isObject).map((v) => ({ verse: Number(v.verse), text: String(v.text ?? '') })),
  };
}
