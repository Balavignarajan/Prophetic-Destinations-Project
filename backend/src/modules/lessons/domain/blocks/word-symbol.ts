import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { itemReferenceOf, validateScriptureEntries } from './scripture-refs.js';

/**
 * WORD_STUDY and SYMBOL_STUDY content contracts. Both identifiers already exist (block-types.ts, the database CHECK): no migration. Both
 * schemas are PROPOSED, NOT APPROVED; the documented FIELDS are the workbook's (CMS Components sheet, BLK-008/BLK-009, CMS-022/CMS-023).
 * D6 (do verse fields show text or only a reference?) is open: the reference is stored, and the verified text is frozen into the snapshot
 * beside it, so a client can show either; mobile shows the frozen passage behind a tappable reference.
 *
 * WORD_STUDY ("English word; original word; transliteration; optional Strong number; curated definition; verse; references"; no concordance engine):
 *
 *   { "englishWord": "…", "originalWord": "…", "transliteration": "…", "strongNumber": "optional, e.g. G3056",
 *     "definition": "curated, written by the author",
 *     "verse": { reference, dataset?, refresh? },          // ONE Scripture reference
 *     "references": [ { reference, dataset?, refresh? }, ... ] }   // optional, up to 5
 *
 * SYMBOL_STUDY ("Symbol; image/icon; primary verse; meaning; definition verse; explanation; references"):
 *
 *   { "symbol": "…", "image": { "mediaId": "<media image>", "altText": "…" },     // image optional
 *     "primaryPassage": { … },  "meaning": "the biblical definition/meaning, written by the author",
 *     "definitionPassage": { … } /* optional *\/,  "explanation": "…",  "references": [ … ] /* optional, up to 5 *\/ }
 *
 *  - Everything in a text field is AUTHOR-WRITTEN. Nothing is generated or looked up: no definition, translation, pronunciation, etymology,
 *    symbolic meaning or link between symbols, and no dictionary, concordance or interlinear service. The original-language text, transliteration
 *    and Strong number are exactly what the author typed (the Strong number is a documented optional identifier; it is not resolved to anything).
 *  - Scripture fields use the shared structured reference (scripture-refs.ts): server-stamped, verified, fingerprint-checked and frozen at
 *    publication (ScriptureEmbedService). They are never stored as text. Canonical Scripture and author text are separate fields.
 *  - Publishing requires (proposal from the field lists; only the Strong number is marked optional in the Word Study requirement): Word Study
 *    - English word, original word, transliteration, definition and a verse. Symbol Study - symbol, primary passage, meaning and explanation; the
 *    image, definition passage and related references are optional. Because the verse / primary passage are required, these blocks cannot be
 *    published while the Scripture text is missing; references are never weakened for that reason.
 *  - Original-language text is Unicode (Greek, Hebrew): stored as typed, only trimmed; clients display it with automatic text direction.
 *  - No level variants (D3). The image follows the IMAGE conventions (media-library image, alternative text required before publishing).
 */
export const WORD_STUDY_LIMITS = { word: 100, transliteration: 100, strongNumber: 10, definition: 2000 } as const;
export const SYMBOL_STUDY_LIMITS = { symbol: 200, meaning: 2000, explanation: 3000, altText: 500 } as const;

const WORD_KEYS = ['englishWord', 'originalWord', 'transliteration', 'strongNumber', 'definition', 'verse', 'references'] as const;
const SYMBOL_KEYS = ['symbol', 'image', 'primaryPassage', 'meaning', 'definitionPassage', 'explanation', 'references'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STRONG = /^[A-Za-z0-9]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(source: Record<string, unknown>, key: string, max: number, path: string, label: string, problems: ContentProblem[]): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== 'string') problems.push({ path, message: `${label} must be text` });
  else if (value.length > max) problems.push({ path, message: `${label} must be at most ${max} characters` });
  else if (value.includes('\u0000')) problems.push({ path, message: `${label} must not contain NUL characters` });
}

function checkKeys(content: Record<string, unknown>, allowed: readonly string[], problems: ContentProblem[]): void {
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!allowed.includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
}

/** Shape check of a field that holds ONE Scripture entry, with the field's own path and name in the messages. */
function checkSingleEntry(content: Record<string, unknown>, key: string, label: string, problems: ContentProblem[]): void {
  const value = content[key];
  if (value === undefined) return;
  const found: ContentProblem[] = [];
  validateScriptureEntries([value], key, label, found);
  for (const p of found) problems.push({ path: p.path.replace(`${key}[0]`, key), message: p.message.replace(`${label}, passage 1`, label) });
}

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const hasReference = (value: unknown) => itemReferenceOf(value) !== null;

// ------------------------------------------------------------------------------------------------------------------------ WORD_STUDY

export function validateWordStudyShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Word study content must be an object' }];
  const L = WORD_STUDY_LIMITS;
  const problems: ContentProblem[] = [];
  checkKeys(content, WORD_KEYS, problems);
  checkText(content, 'englishWord', L.word, 'englishWord', 'The English word', problems);
  checkText(content, 'originalWord', L.word, 'originalWord', 'The original-language word', problems);
  checkText(content, 'transliteration', L.transliteration, 'transliteration', 'The transliteration', problems);
  checkText(content, 'strongNumber', L.strongNumber, 'strongNumber', 'The Strong number', problems);
  if (typeof content.strongNumber === 'string' && content.strongNumber.trim() !== '' && !STRONG.test(content.strongNumber.trim())) {
    problems.push({ path: 'strongNumber', message: 'The Strong number may contain only letters and digits, such as G3056' });
  }
  checkText(content, 'definition', L.definition, 'definition', 'The definition', problems);
  checkSingleEntry(content, 'verse', 'The verse', problems);
  validateScriptureEntries(content.references, 'references', 'References', problems);
  return problems;
}

/** What publishing needs. Assumes a valid shape. */
export function validateWordStudyComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (blank(c.englishWord)) problems.push({ path: 'englishWord', message: 'The word study needs the English word' });
  if (blank(c.originalWord)) problems.push({ path: 'originalWord', message: 'The word study needs the original-language word' });
  if (blank(c.transliteration)) problems.push({ path: 'transliteration', message: 'The word study needs the transliteration' });
  if (blank(c.definition)) problems.push({ path: 'definition', message: 'The word study needs a definition in your own words' });
  if (!hasReference(c.verse)) problems.push({ path: 'verse', message: 'The word study needs a verse' });
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------- SYMBOL_STUDY

export function validateSymbolStudyShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Symbol study content must be an object' }];
  const L = SYMBOL_STUDY_LIMITS;
  const problems: ContentProblem[] = [];
  checkKeys(content, SYMBOL_KEYS, problems);
  checkText(content, 'symbol', L.symbol, 'symbol', 'The symbol', problems);
  checkText(content, 'meaning', L.meaning, 'meaning', 'The meaning', problems);
  checkText(content, 'explanation', L.explanation, 'explanation', 'The explanation', problems);
  if (content.image !== undefined) {
    const image = content.image;
    if (!isPlainObject(image)) {
      problems.push({ path: 'image', message: 'The image must be an object' });
    } else {
      for (const key of Object.keys(image)) if (key !== 'mediaId' && key !== 'altText') problems.push({ path: `image.${key}`, message: `Unknown key "image.${key}"` });
      if (image.mediaId !== undefined && (typeof image.mediaId !== 'string' || !UUID.test(image.mediaId))) {
        problems.push({ path: 'image.mediaId', message: 'The image must be a media asset id' });
      }
      checkText(image, 'altText', L.altText, 'image.altText', 'The image description', problems);
    }
  }
  checkSingleEntry(content, 'primaryPassage', 'The primary passage', problems);
  checkSingleEntry(content, 'definitionPassage', 'The definition passage', problems);
  validateScriptureEntries(content.references, 'references', 'References', problems);
  return problems;
}

/** What publishing needs. Assumes a valid shape. */
export function validateSymbolStudyComplete(content: unknown): ContentProblem[] {
  const c = isPlainObject(content) ? content : {};
  const problems: ContentProblem[] = [];
  if (blank(c.symbol)) problems.push({ path: 'symbol', message: 'The symbol study needs the symbol' });
  if (!hasReference(c.primaryPassage)) problems.push({ path: 'primaryPassage', message: 'The symbol study needs a primary passage' });
  if (blank(c.meaning)) problems.push({ path: 'meaning', message: 'The symbol study needs the meaning in your own words' });
  if (blank(c.explanation)) problems.push({ path: 'explanation', message: 'The symbol study needs an explanation' });
  const image = isPlainObject(c.image) ? c.image : null;
  if (image) {
    if (typeof image.mediaId !== 'string') problems.push({ path: 'image.mediaId', message: 'The image details have no image chosen: choose an image or remove them' });
    else if (blank(image.altText)) problems.push({ path: 'image.altText', message: 'The image needs a description (alternative text) before publishing' });
  }
  return problems;
}

/** The media asset id of the optional illustration, if it has a well-formed one. */
export function symbolStudyMediaId(content: unknown): string | null {
  if (!isPlainObject(content) || !isPlainObject(content.image)) return null;
  const id = content.image.mediaId;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}
