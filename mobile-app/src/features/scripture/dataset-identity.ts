import { BOOK_NAMES } from './books';
import { BUNDLED_SCRIPTURE, type ScriptureDataset } from './scripture-data';
import { Sha256 } from './sha256';

/**
 * The VERIFIED identity of the bundled Scripture text, as opposed to the identity it merely DECLARES.
 *
 * Declared: `metadata.id`, `version`, `edition` and `checksum` in the bundled data are labels the supplier wrote. This app does not trust them as proof of
 * which text is installed, and the loader (scripture-data.ts) does not check `checksum` on load, so a declared checksum is never presented as verified.
 *
 * Verified: the same content FINGERPRINT the backend records on every published passage (backend/src/modules/scripture/domain/dataset.ts
 * `computeFingerprint`): SHA-256, hex, over the exact byte string
 *     "SCRIPTURE-TEXT-v1\0" + for each of the 66 books in canonical OSIS order: bookId + "\0" + JSON.stringify(books[bookId]) + "\0"
 * encoded as UTF-8. The bundled books are stored as exactly that JSON, so the bytes are the same however the files are laid out. The fingerprint is computed here
 * from the bundled verses themselves, once, only on request (when a passage is opened in the Bible), and never compared to anything the file declares unless both
 * are available (a declared checksum that does not match the computed value makes the identity "unconfirmed").
 *
 * HOW IT IS COMPUTED: with the platform's Web Crypto (`crypto.subtle`) when it exists (web). React Native's Hermes does not reliably provide it, so on a phone the
 * plain-JavaScript SHA-256 in sha256.ts is used instead: no new dependency, the same hash. It reads every book once (about 4 MB of text) and hands control back between
 * books so the screen stays responsive; it takes longer on slow phones. If neither can run, the identity is "unconfirmed" with the reason, never "verified".
 *
 * WHAT A MATCH MEANS: that this app and the lesson passage were made from the same text. It does not show the transcription itself is correct.
 */
export type DatasetIdentity =
  | { status: 'none' }
  | { status: 'verified'; fingerprint: string }
  | { status: 'unconfirmed'; reason: string };

export type IdentityComparison = 'same' | 'different' | 'unknown';

const HEX = /^[0-9a-f]{64}$/;
const PREFIX = 'SCRIPTURE-TEXT-v1\0';

/** The canonical byte string the backend hashes, or null if the data set lacks a canonical book (the backend would have rejected it). */
function canonicalText(dataset: ScriptureDataset): string | null {
  let out = PREFIX;
  for (const [id] of BOOK_NAMES) {
    const chapters = dataset.books[id];
    if (!Array.isArray(chapters)) return null;
    out += `${id}\0${JSON.stringify(chapters)}\0`;
  }
  return out;
}

type WebCrypto = { subtle?: { digest?: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> } };
type GlobalWithCrypto = { crypto?: WebCrypto; TextEncoder?: new () => { encode(input: string): Uint8Array } };

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The fingerprint through Web Crypto, or null when this platform has none. Throws only if Web Crypto exists and fails. */
async function fingerprintWithWebCrypto(dataset: ScriptureDataset): Promise<string | null | undefined> {
  const g = globalThis as GlobalWithCrypto;
  const digest = g.crypto?.subtle?.digest;
  if (!digest || !g.TextEncoder) return undefined; // not available here
  const text = canonicalText(dataset);
  if (text === null) return null;
  return hex(await g.crypto!.subtle!.digest!('SHA-256', new g.TextEncoder().encode(text)));
}

/** The fingerprint through the plain-JavaScript SHA-256, one book at a time; null if a canonical book is missing. */
async function fingerprintInJavaScript(dataset: ScriptureDataset): Promise<string | null> {
  const hash = new Sha256().update(PREFIX);
  for (const [id] of BOOK_NAMES) {
    const chapters = dataset.books[id];
    if (!Array.isArray(chapters)) return null;
    hash.update(`${id}\0`).update(JSON.stringify(chapters)).update('\0');
    await yieldToUi();
  }
  return hash.digestHex();
}

async function compute(dataset: ScriptureDataset): Promise<DatasetIdentity> {
  let fingerprint: string | null | undefined;
  try {
    try {
      fingerprint = await fingerprintWithWebCrypto(dataset);
    } catch {
      fingerprint = undefined; // Web Crypto is present but refused (for example an insecure page): use the JavaScript hash
    }
    if (fingerprint === undefined) fingerprint = await fingerprintInJavaScript(dataset);
  } catch {
    return { status: 'unconfirmed', reason: "The Bible text's checksum could not be computed on this device." };
  }
  if (fingerprint === null) return { status: 'unconfirmed', reason: 'The installed Bible text does not contain all 66 books, so its checksum cannot be compared.' };
  const declared = dataset.metadata.checksum;
  if (declared !== null && declared.trim().toLowerCase() !== fingerprint) {
    return { status: 'unconfirmed', reason: 'The installed Bible text does not match the checksum it declares, so it is not trusted as identical to any published text.' };
  }
  return { status: 'verified', fingerprint };
}

const cache = new WeakMap<ScriptureDataset, Promise<DatasetIdentity>>();

/** The verified identity of a data set (the bundled one by default), computed at most once per data set. */
export function verifyDatasetIdentity(dataset: ScriptureDataset | null = BUNDLED_SCRIPTURE): Promise<DatasetIdentity> {
  if (!dataset) return Promise.resolve({ status: 'none' });
  let pending = cache.get(dataset);
  if (!pending) {
    pending = compute(dataset);
    cache.set(dataset, pending);
  }
  return pending;
}

/**
 * Does the text of a published passage (its frozen fingerprint) come from the same text as the installed data set? Only two VERIFIED, well-formed
 * fingerprints can be "same" or "different"; a missing frozen fingerprint (older passages) or an unconfirmed installed identity is "unknown".
 */
export function compareIdentity(publishedFingerprint: string | undefined, installed: DatasetIdentity): IdentityComparison {
  if (!publishedFingerprint || !HEX.test(publishedFingerprint.toLowerCase()) || installed.status !== 'verified') return 'unknown';
  return publishedFingerprint.toLowerCase() === installed.fingerprint ? 'same' : 'different';
}
