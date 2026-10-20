import { BOOK_NAMES } from './books';
import { BUNDLED_SCRIPTURE, type ScriptureDataset } from './scripture-data';

/**
 * The VERIFIED identity of the bundled Scripture text, as opposed to the identity it merely DECLARES.
 *
 * Declared: `metadata.id`, `version`, `edition` and `checksum` in the bundled file are labels the supplier wrote. This app does not trust them as proof of
 * which text is installed, and the mobile loader (scripture-data.ts) does not check `checksum` on load, so a declared checksum is never presented as verified.
 *
 * Verified: the same content FINGERPRINT the backend records on every published passage (backend/src/modules/scripture/domain/dataset.ts
 * `computeFingerprint`): SHA-256, hex, over the exact byte string
 *     "SCRIPTURE-TEXT-v1\0" + for each of the 66 books in canonical OSIS order: bookId + "\0" + JSON.stringify(books[bookId]) + "\0"
 * encoded as UTF-8. It is computed here from the bundled verses themselves, once, only on request (when a passage is opened in the Bible), and never
 * stored or compared to anything the file declares unless both are available (a declared checksum that does not match the computed value makes the
 * identity "unconfirmed").
 *
 * FACILITY: no hashing library is installed and none may be added in this change. The computation uses the platform's Web Crypto (`crypto.subtle`) and
 * TextEncoder only if the runtime provides them. React Native's Hermes does not reliably provide `crypto.subtle`, so on a device it may be unavailable;
 * then the identity is reported as "unconfirmed" (never as matching). This is a known blocker for confirming text identity on such devices, until an
 * approved hashing facility is added. It does not affect reading the Bible or opening passages.
 */
export type DatasetIdentity =
  | { status: 'none' }
  | { status: 'verified'; fingerprint: string }
  | { status: 'unconfirmed'; reason: string };

export type IdentityComparison = 'same' | 'different' | 'unknown';

const HEX = /^[0-9a-f]{64}$/;

/** The canonical byte string the backend hashes, or null if the data set lacks a canonical book (the backend would have rejected it). */
function canonicalText(dataset: ScriptureDataset): string | null {
  let out = 'SCRIPTURE-TEXT-v1\0';
  for (const [id] of BOOK_NAMES) {
    const chapters = dataset.books[id];
    if (!Array.isArray(chapters)) return null;
    out += `${id}\0${JSON.stringify(chapters)}\0`;
  }
  return out;
}

async function compute(dataset: ScriptureDataset): Promise<DatasetIdentity> {
  const g = globalThis as { crypto?: { subtle?: { digest?: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> } }; TextEncoder?: new () => { encode(input: string): Uint8Array } };
  const subtle = g.crypto?.subtle;
  if (!subtle?.digest || !g.TextEncoder) {
    return { status: 'unconfirmed', reason: 'This device cannot compute the Bible text\'s checksum, so which text is installed could not be checked.' };
  }
  const text = canonicalText(dataset);
  if (text === null) return { status: 'unconfirmed', reason: 'The installed Bible text does not contain all 66 books, so its checksum cannot be compared.' };
  try {
    const digest = await subtle.digest('SHA-256', new g.TextEncoder().encode(text));
    const fingerprint = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const declared = dataset.metadata.checksum;
    if (declared !== null && declared.trim().toLowerCase() !== fingerprint) {
      return { status: 'unconfirmed', reason: 'The installed Bible text does not match the checksum it declares, so it is not trusted as identical to any published text.' };
    }
    return { status: 'verified', fingerprint };
  } catch {
    return { status: 'unconfirmed', reason: 'The Bible text\'s checksum could not be computed on this device.' };
  }
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
