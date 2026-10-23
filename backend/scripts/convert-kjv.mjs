#!/usr/bin/env node
/**
 * Bible-kjv-master -> the project's Scripture data contract. A repeatable, deterministic DATA tool (not an application test).
 *
 *   npm run scripture:convert              writes the files below
 *   npm run scripture:convert -- --check   writes nothing; exits 1 if a file on disk differs from what the source would produce
 *   --source <dir>                         the Bible-kjv-master folder (default: <repo>/Bible-kjv-master)
 *
 * Needs Node 22.18 or newer (it imports two small TypeScript files directly). It reads the source folder and NEVER changes it.
 *
 * INPUT  Bible-kjv-master/: Books.json (canonical order), one JSON file per book ({ book, chapters:[{ chapter:"1", verses:[{ verse:"1", text }] }] }), LICENSE.
 * OUTPUT (from that one source, so they cannot disagree)
 *   backend/data/kjv.json                                  the backend's data contract (src/modules/scripture/domain/dataset.ts): { metadata, books:{ Gen:[[verses of ch.1],...] } }
 *   mobile-app/src/features/scripture/data/books/<Id>.json one file per book: exactly JSON.stringify(books[Id]), the text the fingerprint is computed from
 *   mobile-app/src/features/scripture/data/kjv.generated.ts  metadata, chapter counts and the lazy per-book loaders for the app
 *
 * SAFETY RULES
 *   - Verse text is stored EXACTLY as the source has it. Nothing is trimmed, corrected, completed or taken from any other dataset (the KJV folder is never read).
 *     Odd spacing in the source is preserved and listed in the metadata and on screen below.
 *   - It refuses to write anything unless the source is structurally exact: 66 books named and ordered as Books.json and the app's canon, chapters and verses
 *     numbered 1..n without gaps or repeats, no empty or control-character text, and exactly 66 books / 1,189 chapters / 31,102 verses (39 + 27 books).
 *   - The text fingerprint is computed three independent ways and all must agree: Node's crypto, the backend's own `parseDataset` (when the backend has been built),
 *     and the app's plain-JavaScript SHA-256, the one a phone uses. A match means the apps use the same text; it does not prove the transcription is correct.
 *   - The output is labelled a community-maintained transcription pending text verification, and is NOT marked release-approved.
 *   - No timestamps: the same source always yields byte-identical output. `version` is derived from the source files' content.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');
const repoRoot = resolve(backendRoot, '..');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const sourceFlag = args.indexOf('--source');
const sourceDir = resolve(sourceFlag >= 0 ? args[sourceFlag + 1] : join(repoRoot, 'Bible-kjv-master'));

const OUT_BACKEND = join(backendRoot, 'data', 'kjv.json');
const OUT_MOBILE = join(repoRoot, 'mobile-app', 'src', 'features', 'scripture', 'data');

const EXPECTED = { books: 66, chapters: 1189, verses: 31102, otBooks: 39, ntBooks: 27 };
const FINGERPRINT_PREFIX = 'SCRIPTURE-TEXT-v1\0'; // the contract's canonical text (dataset.ts computeFingerprint)

const fail = (message) => {
  console.error(`\nREFUSED: ${message}\nNothing was written.`);
  process.exit(1);
};
const sha256Of = (data) => createHash('sha256').update(data).digest('hex');
/** A C0/C1 control character or a Unicode line/paragraph separator (checked by code point, so no special character appears in this file). */
const hasControlCharacter = (text) => {
  for (const character of text) {
    const point = character.codePointAt(0);
    if (point < 0x20 || (point >= 0x7f && point <= 0x9f) || point === 0x2028 || point === 0x2029) return true;
  }
  return false;
};
const isCount = (value) => typeof value === 'string' && /^[1-9]\d*$/.test(value);

// ------------------------------------------------------------------------------------------------------------------ the project's canon
const { BOOKS, BOOK_IDS } = await import(pathToFileURL(join(backendRoot, 'src', 'modules', 'scripture', 'domain', 'books.ts')).href);
if (BOOK_IDS.length !== EXPECTED.books || BOOKS.length !== EXPECTED.books) fail('the backend book table is not the 66-book canon');

// ------------------------------------------------------------------------------------------------------------------ the source
if (!existsSync(sourceDir)) fail(`source folder not found: ${sourceDir}`);
const sourceFiles = readdirSync(sourceDir, { withFileTypes: true });
if (sourceFiles.some((entry) => !entry.isFile())) fail('the source folder contains a sub-folder; expected only the Bible-kjv-master files');
const fileNames = sourceFiles.map((entry) => entry.name).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
for (const required of ['Books.json', 'LICENSE']) if (!fileNames.includes(required)) fail(`${required} is missing from the source folder`);

const bytesOf = (name) => readFileSync(join(sourceDir, name));
const utf8 = new TextDecoder('utf-8', { fatal: true });
const textOf = (name) => {
  const bytes = bytesOf(name);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail(`${name} starts with a byte-order mark`);
  try {
    return utf8.decode(bytes);
  } catch {
    return fail(`${name} is not valid UTF-8`);
  }
};
const jsonOf = (name) => {
  try {
    return JSON.parse(textOf(name));
  } catch (error) {
    return fail(`${name} is not valid JSON (${error.message})`);
  }
};

const order = jsonOf('Books.json');
if (!Array.isArray(order) || order.length !== EXPECTED.books || order.some((name) => typeof name !== 'string') || new Set(order).size !== EXPECTED.books) {
  fail('Books.json must list 66 distinct book names');
}
order.forEach((name, index) => {
  if (name !== BOOKS[index].name) fail(`Books.json position ${index + 1} is "${name}" but the canon has "${BOOKS[index].name}" there`);
});

const licenseText = textOf('LICENSE');
const copyright = licenseText.split(/\r?\n/).find((line) => /^Copyright \(c\) \d{4} \S/.test(line.trim()));
if (!/MIT License/i.test(licenseText) || !copyright) fail('LICENSE is not the expected MIT notice with a copyright line');

// ------------------------------------------------------------------------------------------------------------------ the books
const books = {};
const chapterCounts = {};
const totals = { books: 0, chapters: 0, verses: 0, otBooks: 0, ntBooks: 0 };
const preservedWhitespace = [];
const unusualCharacters = new Map();
order.forEach((name, index) => {
  const id = BOOK_IDS[index];
  const file = `${name.replace(/\s+/g, '')}.json`;
  if (!fileNames.includes(file)) fail(`${file} (for ${name}) is missing from the source folder`);
  const raw = jsonOf(file);
  const where = (c, v) => `${name} ${c}:${v}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || Object.keys(raw).sort().join() !== 'book,chapters') fail(`${file}: expected exactly { book, chapters }`);
  if (raw.book !== name) fail(`${file}: the book is "${raw.book}", expected "${name}"`);
  if (!Array.isArray(raw.chapters) || raw.chapters.length === 0) fail(`${file}: no chapters`);
  const chapters = raw.chapters.map((chapter, chapterIndex) => {
    const number = chapterIndex + 1;
    if (typeof chapter !== 'object' || chapter === null || Object.keys(chapter).sort().join() !== 'chapter,verses') fail(`${name} chapter ${number}: expected exactly { chapter, verses }`);
    if (!isCount(chapter.chapter) || Number(chapter.chapter) !== number) fail(`${name}: chapter ${number} is labelled "${chapter.chapter}" (a missing, repeated or out-of-order chapter)`);
    if (!Array.isArray(chapter.verses) || chapter.verses.length === 0) fail(`${name} ${number}: no verses`);
    return chapter.verses.map((verse, verseIndex) => {
      const at = where(number, verseIndex + 1);
      if (typeof verse !== 'object' || verse === null || Object.keys(verse).sort().join() !== 'text,verse') fail(`${at}: expected exactly { verse, text }`);
      if (!isCount(verse.verse) || Number(verse.verse) !== verseIndex + 1) fail(`${at}: the verse is labelled "${verse.verse}" (a missing, repeated or out-of-order verse)`);
      if (typeof verse.text !== 'string' || verse.text.trim() === '') fail(`${at}: empty verse text`);
      if (hasControlCharacter(verse.text)) fail(`${at}: the text contains a control character`);
      if (/[\ud800-\udfff]/.test(verse.text.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''))) fail(`${at}: the text contains an unpaired surrogate`);
      if (verse.text !== verse.text.trim() || / {2,}/.test(verse.text)) preservedWhitespace.push(`${id} ${number}:${verseIndex + 1}`);
      for (const character of verse.text) if (character.charCodeAt(0) > 126) unusualCharacters.set(character, (unusualCharacters.get(character) ?? 0) + 1);
      return verse.text; // exactly as supplied
    });
  });
  books[id] = chapters;
  chapterCounts[id] = chapters.length;
  totals.books += 1;
  totals.chapters += chapters.length;
  totals.verses += chapters.reduce((sum, verses) => sum + verses.length, 0);
  if (index < 39) totals.otBooks += 1;
  else totals.ntBooks += 1;
});
for (const key of Object.keys(EXPECTED)) {
  if (totals[key] !== EXPECTED[key]) fail(`structure check failed: ${key} is ${totals[key]}, expected ${EXPECTED[key]}`);
}

// ------------------------------------------------------------------------------------------------------------------ identity
const canonicalParts = function* () {
  yield FINGERPRINT_PREFIX;
  for (const id of BOOK_IDS) {
    yield `${id}\0`;
    yield JSON.stringify(books[id]);
    yield '\0';
  }
};
const nodeHash = createHash('sha256');
for (const part of canonicalParts()) nodeHash.update(part);
const fingerprint = nodeHash.digest('hex');

let Sha256;
try {
  ({ Sha256 } = await import(pathToFileURL(join(repoRoot, 'mobile-app', 'src', 'features', 'scripture', 'sha256.ts')).href));
} catch (error) {
  fail(`the app's SHA-256 could not be loaded (${error.message}); Node 22.18 or newer is needed`);
}
const appHash = new Sha256();
for (const part of canonicalParts()) appHash.update(part);
if (appHash.digestHex() !== fingerprint) fail("the app's JavaScript SHA-256 disagrees with Node's, so a phone would compute a different fingerprint; fix mobile-app/src/features/scripture/sha256.ts");

const digestLines = fileNames.map((name) => `${name}\t${sha256Of(bytesOf(name))}\n`);
const sourceDigest = sha256Of(digestLines.join(''));
const version = `bible-kjv-master-${sourceDigest.slice(0, 12)}`;

const metadata = {
  id: 'kjv-bible-kjv-master',
  translation: 'King James Version',
  edition: 'Community transcription, edition not stated',
  version,
  source:
    `Bible-kjv-master, a community-maintained transcription of the King James Version (MIT licence, ${copyright.trim()}). ` +
    'The edition is not stated by the source. Converted unchanged by backend/scripts/convert-kjv.mjs. ' +
    'Text verification against a printed edition is pending; this text is not approved for release.',
  checksum: fingerprint,
  expectedTotals: { books: EXPECTED.books, chapters: EXPECTED.chapters, verses: EXPECTED.verses },
  review: {
    status: 'PENDING_TEXT_VERIFICATION',
    releaseApproved: false,
    summary:
      'A community-maintained KJV transcription, stored exactly as supplied. It has not been verified against a printed edition, and known differences from common printings ' +
      '(for example the capitalisation of LORD/Lord and GOD/God) have not been corrected.',
    sourceWhitespacePreserved: preservedWhitespace,
  },
  license: { name: 'MIT License', copyright: copyright.trim(), notice: licenseText },
  sourceDigest,
  generatedBy: 'backend/scripts/convert-kjv.mjs',
};

// ------------------------------------------------------------------------------------------------------------------ outputs
const outputs = new Map();

outputs.set(
  OUT_BACKEND,
  `{\n"metadata": ${JSON.stringify({ ...metadata, sourceFiles: Object.fromEntries(fileNames.map((name, i) => [name, digestLines[i].split('\t')[1].trim()])) }, null, 2)},\n"books": {\n` +
    BOOK_IDS.map((id) => `${JSON.stringify(id)}: ${JSON.stringify(books[id])}`).join(',\n') +
    '\n}\n}\n',
);

for (const id of BOOK_IDS) outputs.set(join(OUT_MOBILE, 'books', `${id}.json`), `${JSON.stringify(books[id])}\n`);

const mobileMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== 'expectedTotals'));
outputs.set(
  join(OUT_MOBILE, 'kjv.generated.ts'),
  [
    '/* eslint-disable @typescript-eslint/no-require-imports */',
    '// GENERATED by backend/scripts/convert-kjv.mjs from the Bible-kjv-master source. Do not edit: run `npm run scripture:convert` in backend/ instead.',
    '// Verse text is exactly the source\'s. This file holds only the metadata, the chapter counts and the lazy per-book loaders; each book is its own JSON file in ./books.',
    '',
    'export type KjvBook = readonly (readonly string[])[];',
    '',
    `export const KJV_METADATA = ${JSON.stringify(mobileMetadata, null, 2)};`,
    '',
    '/** Chapters per book, so the book and chapter lists need no book loaded. */',
    `export const KJV_CHAPTER_COUNTS: Readonly<Record<string, number>> = ${JSON.stringify(chapterCounts, null, 2)};`,
    '',
    '/** A book is read from its file only when first asked for (the static paths are what lets Metro bundle each file). */',
    'export const KJV_BOOK_LOADERS: Readonly<Record<string, () => KjvBook>> = {',
    ...BOOK_IDS.map((id) => `  ${JSON.stringify(id)}: () => require('./books/${id}.json') as KjvBook,`),
    '};',
    '',
  ].join('\n'),
);

// ------------------------------------------------------------------------------------------------------------------ the backend's own check
const builtDataset = join(backendRoot, 'dist', 'modules', 'scripture', 'domain', 'dataset.js');
let backendCheck = 'skipped (the backend has not been built; the backend checks the file again when it loads it)';
if (existsSync(builtDataset)) {
  const { parseDataset } = await import(pathToFileURL(builtDataset).href);
  const parsed = parseDataset(JSON.parse(outputs.get(OUT_BACKEND)));
  if (!parsed.ok) fail(`the backend's own parseDataset rejects the generated file: ${parsed.problems.join('; ')}`);
  if (parsed.dataset.metadata.fingerprint !== fingerprint) fail("the backend's fingerprint differs from the one computed here");
  backendCheck = 'passed (parseDataset accepted it and computed the same fingerprint)';
}

// ------------------------------------------------------------------------------------------------------------------ write (or compare)
let differing = 0;
let written = 0;
for (const [path, content] of outputs) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === content) continue;
  differing += 1;
  if (checkOnly) continue;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  written += 1;
}

console.log(`Source: ${relative(repoRoot, sourceDir) || sourceDir}  (${fileNames.length} files, digest ${sourceDigest.slice(0, 12)}…)`);
console.log(`Structure: ${totals.books} books (${totals.otBooks} OT + ${totals.ntBooks} NT), ${totals.chapters} chapters, ${totals.verses} verses`);
console.log(`Fingerprint (SHA-256 of the text): ${fingerprint}`);
console.log('  Node crypto = app JavaScript SHA-256: identical');
console.log(`  Backend parseDataset: ${backendCheck}`);
console.log(`Source whitespace preserved as supplied in ${preservedWhitespace.length} verse(s): ${preservedWhitespace.join(', ') || 'none'}`);
console.log(`Non-ASCII characters in the text: ${[...unusualCharacters].map(([c, n]) => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) x${n}`).join(', ') || 'none'}`);
console.log(`Files: ${outputs.size} generated; ${checkOnly ? `${differing} differ from disk (check only, nothing written)` : `${written} written, ${outputs.size - written} already up to date`}`);
if (checkOnly && differing > 0) process.exit(1);
