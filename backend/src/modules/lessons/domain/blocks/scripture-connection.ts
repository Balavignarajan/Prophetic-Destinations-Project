import { type ContentProblem, isMarkupLikeKey } from './rich-text.js';
import { validateScriptureEntries } from './scripture-refs.js';

/**
 * SCRIPTURE_CONNECTION content contract (feature register BLK-005: "a configured sequence/comparison of related passages with labels and
 * tappable references"; workbook fields "title; ordered connections; label; Scripture; explanation; display style"; guide: "ordered or
 * comparative chain of related passages. Each item can include label, reference and explanation").
 *
 * PROPOSED, NOT APPROVED (the repository holds no schema for it):
 *
 *   {
 *     "title": "optional",
 *     "connections": [ { "id": "c-ab12cd", "label": "optional", "scripture": [ { reference, dataset?, refresh? }, ... ],
 *                        "explanation": "the author's own words" }, ... ]
 *   }
 *
 *  - `connections` keep the AUTHOR'S order and are shown in exactly that order. The block records only what the author wrote: it never
 *    suggests, infers or labels a theological relationship, and the author's `explanation` is commentary, kept apart from Scripture.
 *  - `scripture` is the shared structured reference list (scripture-refs.ts, up to 5 per connection): references only, never Bible text.
 *    The server stamps each with the installed text's fingerprint when saved; publication freezes the verified passages into the snapshot.
 *  - `display style` is NOT part of the contract: its values are an open decision (D8), so the unknown key is rejected rather than stored.
 *  - Plain text only. No per-connection level flags. Level variants are enabled PROVISIONALLY (variant-types.ts): a level's version is another complete
 *    object of this same contract, so it has its own connections and references, stamped when saved like these.
 * A draft may be incomplete. Publishing requires at least two connections (a sequence or comparison needs two) and, for each, at least one
 * passage and an explanation. The label is optional ("can include"). The block cannot be verified or published while the Scripture text
 * is not installed; saved references are kept as they are.
 */
export const SCRIPTURE_CONNECTION_LIMITS = {
  maxTitleLength: 200,
  maxConnections: 12,
  maxIdLength: 40,
  maxLabelLength: 200,
  maxExplanationLength: 2000,
  minConnectionsToPublish: 2,
} as const;

const ALLOWED_KEYS = ['title', 'connections'] as const;
const CONNECTION_KEYS = ['id', 'label', 'scripture', 'explanation'] as const;
const ID = /^[A-Za-z0-9_-]+$/;

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

export function validateScriptureConnectionShape(content: unknown): ContentProblem[] {
  if (!isPlainObject(content)) return [{ path: '', message: 'Scripture connection content must be an object' }];
  const L = SCRIPTURE_CONNECTION_LIMITS;
  const problems: ContentProblem[] = [];
  for (const key of Object.keys(content)) {
    if (isMarkupLikeKey(key)) problems.push({ path: key, message: `Markup-like key "${key}" is not allowed` });
    else if (!(ALLOWED_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: `Unknown key "${key}"` });
  }
  checkText(content, 'title', L.maxTitleLength, 'title', 'The title', problems);

  const connections = content.connections;
  if (connections === undefined) return problems;
  if (!Array.isArray(connections)) {
    problems.push({ path: 'connections', message: 'connections must be a list' });
    return problems;
  }
  if (connections.length > L.maxConnections) problems.push({ path: 'connections', message: `A Scripture connection can have at most ${L.maxConnections} connections` });
  const seen = new Set<string>();
  connections.slice(0, L.maxConnections).forEach((connection, index) => {
    const at = `connections[${index}]`;
    const n = `Connection ${index + 1}`;
    if (!isPlainObject(connection)) {
      problems.push({ path: at, message: `${n} must be an object` });
      return;
    }
    for (const key of Object.keys(connection)) {
      if (isMarkupLikeKey(key)) problems.push({ path: `${at}.${key}`, message: `${n}: markup-like key "${key}" is not allowed` });
      else if (!(CONNECTION_KEYS as readonly string[]).includes(key)) problems.push({ path: `${at}.${key}`, message: `${n}: unknown key "${key}"` });
    }
    const id = connection.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > L.maxIdLength || !ID.test(id)) {
      problems.push({ path: `${at}.id`, message: `${n} needs an id of letters, digits, "-" or "_" (up to ${L.maxIdLength} characters)` });
    } else if (seen.has(id)) {
      problems.push({ path: `${at}.id`, message: `${n} repeats the id of another connection` });
    } else {
      seen.add(id);
    }
    checkText(connection, 'label', L.maxLabelLength, `${at}.label`, `${n}: the label`, problems);
    checkText(connection, 'explanation', L.maxExplanationLength, `${at}.explanation`, `${n}: the explanation`, problems);
    validateScriptureEntries(connection.scripture, `${at}.scripture`, n, problems);
  });
  return problems;
}

/** What publishing needs. Assumes a valid shape. */
export function validateScriptureConnectionComplete(content: unknown): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const connections = isPlainObject(content) && Array.isArray(content.connections) ? content.connections : [];
  if (connections.length < SCRIPTURE_CONNECTION_LIMITS.minConnectionsToPublish) {
    problems.push({ path: 'connections', message: `Add at least ${SCRIPTURE_CONNECTION_LIMITS.minConnectionsToPublish} connections before publishing (a sequence or comparison needs two)` });
  }
  connections.forEach((raw, index) => {
    const connection = isPlainObject(raw) ? raw : {};
    const n = `Connection ${index + 1}`;
    if (!Array.isArray(connection.scripture) || connection.scripture.length === 0) {
      problems.push({ path: `connections[${index}].scripture`, message: `${n} needs at least one Scripture passage` });
    }
    if (typeof connection.explanation !== 'string' || connection.explanation.trim() === '') {
      problems.push({ path: `connections[${index}].explanation`, message: `${n} needs an explanation in your own words` });
    }
  });
  return problems;
}
