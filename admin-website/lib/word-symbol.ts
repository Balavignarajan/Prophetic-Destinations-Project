import { type ScriptureEntryDraft, buildScriptureList, readScriptureEntries } from './scripture-info';

/**
 * WORD_STUDY and SYMBOL_STUDY blocks (backend/src/modules/lessons/domain/blocks/word-symbol.ts). PROPOSED schemas, not approved; the fields are the
 * workbook's. Every text field is written by the author: nothing is generated or looked up. Scripture is stored as structured references only
 * (the server verifies, stamps and freezes them); the verse / primary passage are ONE reference each.
 *   WORD_STUDY:   { englishWord, originalWord, transliteration, strongNumber?, definition, verse, references? }
 *   SYMBOL_STUDY: { symbol, image?: { mediaId, altText }, primaryPassage, meaning, definitionPassage?, explanation, references? }
 */
export const WORD_LIMITS = { word: 100, transliteration: 100, strongNumber: 10, definition: 2000 } as const;
export const SYMBOL_LIMITS = { symbol: 200, meaning: 2000, explanation: 3000, altText: 500 } as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A field holding ONE reference, as the draft list used by the shared reference editor (0 or 1 entries). */
const readSingle = (value: unknown): ScriptureEntryDraft[] => (value === undefined ? [] : readScriptureEntries([value]));
/** The single reference to save, or undefined. */
const buildSingle = (entries: readonly ScriptureEntryDraft[]) => buildScriptureList(entries.slice(0, 1))?.[0];

export interface WordContent {
  englishWord: string;
  originalWord: string;
  transliteration: string;
  strongNumber: string;
  definition: string;
  verse: ScriptureEntryDraft[];
  verseRaw?: unknown;
  references: ScriptureEntryDraft[];
  referencesRaw?: unknown;
}
export const EMPTY_WORD: WordContent = { englishWord: '', originalWord: '', transliteration: '', strongNumber: '', definition: '', verse: [], references: [] };

export function readWord(content: unknown): WordContent {
  const c = isObject(content) ? content : {};
  return {
    englishWord: text(c.englishWord),
    originalWord: text(c.originalWord),
    transliteration: text(c.transliteration),
    strongNumber: text(c.strongNumber),
    definition: text(c.definition),
    verse: readSingle(c.verse),
    verseRaw: c.verse,
    references: readScriptureEntries(c.references),
    referencesRaw: c.references,
  };
}

export function buildWord(draft: WordContent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    englishWord: draft.englishWord.trim(),
    originalWord: draft.originalWord.trim(),
    transliteration: draft.transliteration.trim(),
    definition: draft.definition.trim(),
  };
  if (draft.strongNumber.trim()) out.strongNumber = draft.strongNumber.trim();
  const verse = buildSingle(draft.verse);
  if (verse) out.verse = verse;
  const references = buildScriptureList(draft.references);
  if (references) out.references = references;
  return out;
}

export function wordReadiness(c: WordContent): string[] {
  const out: string[] = [];
  if (!c.englishWord.trim()) out.push('the English word');
  if (!c.originalWord.trim()) out.push('the original-language word');
  if (!c.transliteration.trim()) out.push('the transliteration');
  if (!c.definition.trim()) out.push('a definition in your own words');
  if (c.verse.length === 0) out.push('a verse');
  return out;
}

export interface SymbolContent {
  symbol: string;
  mediaId: string;
  altText: string;
  primaryPassage: ScriptureEntryDraft[];
  primaryPassageRaw?: unknown;
  meaning: string;
  definitionPassage: ScriptureEntryDraft[];
  definitionPassageRaw?: unknown;
  explanation: string;
  references: ScriptureEntryDraft[];
  referencesRaw?: unknown;
}
export const EMPTY_SYMBOL: SymbolContent = { symbol: '', mediaId: '', altText: '', primaryPassage: [], meaning: '', definitionPassage: [], explanation: '', references: [] };

export function readSymbol(content: unknown): SymbolContent {
  const c = isObject(content) ? content : {};
  const image = isObject(c.image) ? c.image : {};
  return {
    symbol: text(c.symbol),
    mediaId: text(image.mediaId),
    altText: text(image.altText),
    primaryPassage: readSingle(c.primaryPassage),
    primaryPassageRaw: c.primaryPassage,
    meaning: text(c.meaning),
    definitionPassage: readSingle(c.definitionPassage),
    definitionPassageRaw: c.definitionPassage,
    explanation: text(c.explanation),
    references: readScriptureEntries(c.references),
    referencesRaw: c.references,
  };
}

export function buildSymbol(draft: SymbolContent): Record<string, unknown> {
  const out: Record<string, unknown> = { symbol: draft.symbol.trim(), meaning: draft.meaning.trim(), explanation: draft.explanation.trim() };
  // The picture's description is dropped with the picture (the media file stays in the library).
  if (draft.mediaId) out.image = { mediaId: draft.mediaId, altText: draft.altText.trim() };
  const primary = buildSingle(draft.primaryPassage);
  if (primary) out.primaryPassage = primary;
  const definition = buildSingle(draft.definitionPassage);
  if (definition) out.definitionPassage = definition;
  const references = buildScriptureList(draft.references);
  if (references) out.references = references;
  return out;
}

export function symbolReadiness(c: SymbolContent): string[] {
  const out: string[] = [];
  if (!c.symbol.trim()) out.push('the symbol');
  if (c.primaryPassage.length === 0) out.push('a primary passage');
  if (!c.meaning.trim()) out.push('the meaning in your own words');
  if (!c.explanation.trim()) out.push('an explanation');
  if (c.mediaId && !c.altText.trim()) out.push('a description of the illustration');
  return out;
}
