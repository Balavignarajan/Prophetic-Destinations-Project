/**
 * RICH_TEXT content contract.
 *
 * Rich text is a small structured JSON document, never HTML:
 *
 *   { "body": { "type": "doc", "content": [ ...block nodes ] } }
 *
 * Block nodes:  paragraph, heading, bulletList, orderedList,
 *               listItem (inside lists only, may hold paragraphs and nested lists)
 *               heading { "type": "heading", "attrs": { "level": 1 | 2 | 3 }, "content": [ plain text nodes, no marks ] }
 *               (document level only: a list item holds paragraphs and lists, never a heading)
 * Inline nodes: text  { "type": "text", "text": "...", "marks": [...] }
 *               scriptureRef  { "type": "scriptureRef", "attrs": { "reference": { bookId, chapter, startVerse, endVerse },
 *                                                                   "dataset": { id, version, fingerprint } } }
 *               (paragraphs only, so also the paragraphs inside list items; never inside a heading)
 * Marks:        bold, italic, link (attrs.href)
 *
 * HEADINGS (BLK-001 lists "headings"). The workbook does not say which levels exist, so the three levels the learner app already knew how to draw
 * are allowed (1 to 3); nothing deeper. A heading is plain text: it takes no marks and holds no Scripture reference. Major lesson transitions still
 * use SECTION_INTRO; a heading only titles a part of one explanatory text.
 *
 * SCRIPTURE REFERENCES (BLK-001 lists "references"). A reference is STRUCTURED data, never a string to be found in the text: the same reference
 * model as every other Scripture block (scripture/domain/reference.ts), stored as `attrs.reference`. It is the identity; no Bible text is ever
 * stored in the block. `attrs.dataset` is SET BY THE SERVER when the block is saved (the Scripture data set that confirmed the reference); a
 * client cannot set it. When the lesson is published the node's attrs are replaced by the frozen passage { reference, display, source, verses }
 * (ScriptureEmbedService), exactly like the references of other blocks, so a published lesson carries the approved text and needs no Bible
 * service to be read. The learner app draws the reference in the sentence and shows the frozen text when the learner opens it.
 *
 * Everything not listed here is rejected: unknown nodes, marks, keys and
 * attributes, markup-like keys, and links whose scheme is not allow-listed.
 * Text is plain text and is never interpreted as markup by anyone; clients must
 * render it as text. The validator is deliberately strict and has no
 * dependencies, so it can be unit-tested without Nest.
 */

export interface ContentProblem {
  /** Where in the content, e.g. `body.content[2].content[0].marks[0].attrs.href`. */
  path: string;
  message: string;
}

export const RICH_TEXT_LIMITS = {
  /** Serialized size of the whole content. The database CHECK allows twice this as a backstop. */
  maxBytes: 100_000,
  /** Nesting depth of nodes, counting the document itself as depth 1. */
  maxDepth: 8,
  maxNodes: 5000,
  maxHrefLength: 2048,
  maxMarksPerText: 3,
  /** Inline Scripture references in one block. Each is frozen with its verse text when the lesson is published, so the number is kept modest. */
  maxScriptureRefs: 10,
  /** Heading levels that exist (see the contract above). */
  headingLevels: [1, 2, 3],
  /** Stop collecting after this many problems. */
  maxProblems: 20,
} as const;

export const ALLOWED_LINK_SCHEMES: readonly string[] = [
  'https:',
  'http:',
  'mailto:',
];

const BLOCK_NODES = ['paragraph', 'heading', 'bulletList', 'orderedList'] as const;
const LIST_ITEM_CHILDREN = ['paragraph', 'bulletList', 'orderedList'] as const;
const MARK_TYPES = ['bold', 'italic', 'link'] as const;

/** Keys that look like markup or script hooks; rejected explicitly even though the allow-list would catch them. */
const MARKUP_KEY =
  /^(on[a-z]+|html|innerhtml|outerhtml|srcdoc|style|script|dangerouslysetinnerhtml|__html)$/i;

export function isMarkupLikeKey(key: string): boolean {
  return /[<>]/.test(key) || MARKUP_KEY.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class Walk {
  readonly problems: ContentProblem[] = [];
  nodes = 0;
  scriptureRefs = 0;

  add(path: string, message: string): void {
    if (this.problems.length < RICH_TEXT_LIMITS.maxProblems) {
      this.problems.push({ path, message });
    }
  }

  get full(): boolean {
    return this.problems.length >= RICH_TEXT_LIMITS.maxProblems;
  }

  /** Checks an object has only the allowed keys; markup-like keys get their own message. */
  keys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    path: string,
  ): void {
    for (const key of Object.keys(value)) {
      if (isMarkupLikeKey(key)) {
        this.add(`${path}.${key}`, `Markup-like key "${key}" is not allowed`);
      } else if (!allowed.includes(key)) {
        this.add(`${path}.${key}`, `Unknown key "${key}"`);
      }
    }
  }
}

function hasWhitespaceOrControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Why a link target is not acceptable, or null if it is fine. */
export function checkLinkHref(href: unknown): string | null {
  if (typeof href !== 'string' || href.length === 0) {
    return 'href must be a non-empty string';
  }
  if (href.length > RICH_TEXT_LIMITS.maxHrefLength) {
    return `href must be at most ${RICH_TEXT_LIMITS.maxHrefLength} characters`;
  }
  // The stored string must be exactly what is rendered: no whitespace or control characters at all.
  if (hasWhitespaceOrControl(href)) {
    return 'href must not contain whitespace or control characters';
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return 'href must be an absolute URL';
  }
  if (!ALLOWED_LINK_SCHEMES.includes(url.protocol)) {
    return `href scheme "${url.protocol}" is not allowed (allowed: ${ALLOWED_LINK_SCHEMES.join(' ')})`;
  }
  return null;
}

function checkMarks(marks: unknown, path: string, walk: Walk): void {
  if (!Array.isArray(marks)) {
    walk.add(path, 'marks must be an array');
    return;
  }
  if (marks.length > RICH_TEXT_LIMITS.maxMarksPerText) {
    walk.add(
      path,
      `A text node may have at most ${RICH_TEXT_LIMITS.maxMarksPerText} marks`,
    );
    return;
  }
  const seen = new Set<string>();
  marks.forEach((mark, index) => {
    const markPath = `${path}[${index}]`;
    if (!isPlainObject(mark)) {
      walk.add(markPath, 'A mark must be an object');
      return;
    }
    walk.keys(mark, ['type', 'attrs'], markPath);
    const type = mark.type;
    if (
      typeof type !== 'string' ||
      !(MARK_TYPES as readonly string[]).includes(type)
    ) {
      walk.add(`${markPath}.type`, `Unknown mark "${String(type)}"`);
      return;
    }
    if (seen.has(type))
      walk.add(markPath, `Mark "${type}" is used twice on one text node`);
    seen.add(type);

    if (type === 'link') {
      if (!isPlainObject(mark.attrs)) {
        walk.add(`${markPath}.attrs`, 'A link needs attrs.href');
        return;
      }
      walk.keys(mark.attrs, ['href'], `${markPath}.attrs`);
      const problem = checkLinkHref(mark.attrs.href);
      if (problem) walk.add(`${markPath}.attrs.href`, problem);
    } else if (mark.attrs !== undefined) {
      walk.add(`${markPath}.attrs`, `Mark "${type}" takes no attrs`);
    }
  });
}

const REFERENCE_KEYS = ['bookId', 'chapter', 'startVerse', 'endVerse'] as const;
const BOOK_ID = /^[1-3]?[A-Za-z]+$/;
const whole = (value: unknown, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;

/** An inline Scripture reference: structured data only (the shared one-chapter reference model); the dataset stamp, when present, is the server's. */
function checkScriptureRef(node: Record<string, unknown>, path: string, walk: Walk): void {
  walk.scriptureRefs += 1;
  if (walk.scriptureRefs === RICH_TEXT_LIMITS.maxScriptureRefs + 1) {
    walk.add(path, `A block may have at most ${RICH_TEXT_LIMITS.maxScriptureRefs} Scripture references`);
  }
  const attrs = node.attrs;
  if (!isPlainObject(attrs)) {
    walk.add(`${path}.attrs`, 'A Scripture reference needs attrs.reference');
    return;
  }
  walk.keys(attrs, ['reference', 'dataset'], `${path}.attrs`);
  const ref = attrs.reference;
  if (!isPlainObject(ref)) {
    walk.add(`${path}.attrs.reference`, 'A Scripture reference needs a reference { bookId, chapter, startVerse, endVerse }');
  } else {
    walk.keys(ref, REFERENCE_KEYS, `${path}.attrs.reference`);
    if (typeof ref.bookId !== 'string' || ref.bookId.length > 10 || !BOOK_ID.test(ref.bookId)) {
      walk.add(`${path}.attrs.reference.bookId`, 'The book must be a book id such as "John" or "1Sam"');
    }
    if (!whole(ref.chapter, 150)) walk.add(`${path}.attrs.reference.chapter`, 'The chapter must be a whole number from 1 to 150');
    if (!whole(ref.startVerse, 176)) walk.add(`${path}.attrs.reference.startVerse`, 'The first verse must be a whole number from 1 to 176');
    if (!whole(ref.endVerse, 176)) walk.add(`${path}.attrs.reference.endVerse`, 'The last verse must be a whole number from 1 to 176');
    if (whole(ref.startVerse, 176) && whole(ref.endVerse, 176) && (ref.endVerse as number) < (ref.startVerse as number)) {
      walk.add(`${path}.attrs.reference`, 'The last verse comes before the first verse');
    }
  }
  const dataset = attrs.dataset;
  if (dataset !== undefined) {
    if (
      !isPlainObject(dataset) ||
      typeof dataset.id !== 'string' ||
      typeof dataset.version !== 'string' ||
      (dataset.fingerprint !== undefined && typeof dataset.fingerprint !== 'string') ||
      Object.keys(dataset).some((key) => !['id', 'version', 'fingerprint'].includes(key))
    ) {
      walk.add(`${path}.attrs.dataset`, 'dataset must be { id, version, fingerprint }');
    }
  }
}

/** Text in a heading is plain: no marks. */
type InlineMode = 'paragraph' | 'heading';

function checkText(node: unknown, path: string, walk: Walk, mode: InlineMode): void {
  walk.nodes += 1;
  if (!isPlainObject(node)) {
    walk.add(path, 'An inline node must be an object');
    return;
  }
  if (node.type === 'scriptureRef' && mode === 'paragraph') {
    walk.keys(node, ['type', 'attrs'], path);
    checkScriptureRef(node, path, walk);
    return;
  }
  walk.keys(node, ['type', 'text', 'marks'], path);
  if (node.type !== 'text') {
    walk.add(
      `${path}.type`,
      mode === 'heading'
        ? `Only plain text is allowed in a heading, not "${String(node.type)}"`
        : `Only text or a Scripture reference is allowed here, not "${String(node.type)}"`,
    );
    return;
  }
  if (typeof node.text !== 'string' || node.text.length === 0) {
    walk.add(`${path}.text`, 'text must be a non-empty string');
  } else if (node.text.includes('\u0000')) {
    walk.add(`${path}.text`, 'text must not contain NUL characters');
  }
  if (mode === 'heading' && node.marks !== undefined) {
    walk.add(`${path}.marks`, 'A heading is plain text and takes no marks');
  } else if (node.marks !== undefined) {
    checkMarks(node.marks, `${path}.marks`, walk);
  }
}

function checkInline(content: unknown, path: string, walk: Walk, mode: InlineMode = 'paragraph'): void {
  if (content === undefined) return; // an empty paragraph is allowed in a draft
  if (!Array.isArray(content)) {
    walk.add(path, 'content must be an array');
    return;
  }
  content.forEach((child, index) => {
    if (!walk.full) checkText(child, `${path}[${index}]`, walk, mode);
  });
}

function checkChildren(
  content: unknown,
  allowed: readonly string[],
  path: string,
  depth: number,
  walk: Walk,
  requireOne: boolean,
): void {
  if (!Array.isArray(content) || (requireOne && content.length === 0)) {
    walk.add(
      path,
      requireOne
        ? 'content must be a non-empty array'
        : 'content must be an array',
    );
    return;
  }
  content.forEach((child, index) => {
    if (!walk.full) checkNode(child, `${path}[${index}]`, allowed, depth, walk);
  });
}

function checkNode(
  node: unknown,
  path: string,
  allowed: readonly string[],
  depth: number,
  walk: Walk,
): void {
  walk.nodes += 1;
  if (walk.nodes > RICH_TEXT_LIMITS.maxNodes) {
    walk.add(path, `Too many nodes (limit ${RICH_TEXT_LIMITS.maxNodes})`);
    return;
  }
  if (depth > RICH_TEXT_LIMITS.maxDepth) {
    walk.add(path, `Nested too deeply (limit ${RICH_TEXT_LIMITS.maxDepth})`);
    return; // never descend further: this also bounds the recursion
  }
  if (!isPlainObject(node)) {
    walk.add(path, 'A node must be an object');
    return;
  }

  const type = node.type;
  if (typeof type !== 'string' || !allowed.includes(type)) {
    walk.keys(node, ['type'], path); // report markup-like keys even on a rejected node
    walk.add(
      `${path}.type`,
      `Node "${String(type)}" is not allowed here (allowed: ${allowed.join(', ')})`,
    );
    return;
  }

  switch (type) {
    case 'paragraph':
      walk.keys(node, ['type', 'content'], path);
      checkInline(node.content, `${path}.content`, walk);
      break;
    case 'heading': {
      walk.keys(node, ['type', 'attrs', 'content'], path);
      const attrs = node.attrs;
      if (!isPlainObject(attrs)) {
        walk.add(`${path}.attrs`, 'A heading needs attrs.level');
      } else {
        walk.keys(attrs, ['level'], `${path}.attrs`);
        if (!(RICH_TEXT_LIMITS.headingLevels as readonly unknown[]).includes(attrs.level)) {
          walk.add(`${path}.attrs.level`, `A heading level must be ${RICH_TEXT_LIMITS.headingLevels.join(', ')}`);
        }
      }
      checkInline(node.content, `${path}.content`, walk, 'heading');
      break;
    }
    case 'bulletList':
    case 'orderedList':
      walk.keys(node, ['type', 'content'], path);
      checkChildren(
        node.content,
        ['listItem'],
        `${path}.content`,
        depth + 1,
        walk,
        true,
      );
      break;
    case 'listItem':
      walk.keys(node, ['type', 'content'], path);
      checkChildren(
        node.content,
        LIST_ITEM_CHILDREN,
        `${path}.content`,
        depth + 1,
        walk,
        true,
      );
      break;
  }
}

/**
 * Structural validation, run on every save (drafts may be incomplete).
 * Returns the problems found; an empty array means the content is acceptable.
 */
export function validateRichTextShape(content: unknown): ContentProblem[] {
  const walk = new Walk();

  if (!isPlainObject(content)) {
    return [{ path: '', message: 'Content must be an object' }];
  }
  walk.keys(content, ['body'], '');

  const body = content.body;
  if (!isPlainObject(body)) {
    walk.add('body', 'body must be a document object');
    return walk.problems;
  }
  walk.keys(body, ['type', 'content'], 'body');
  if (body.type !== 'doc')
    walk.add('body.type', 'The document type must be "doc"');
  checkChildren(body.content, BLOCK_NODES, 'body.content', 2, walk, false);

  // Only measure the size once the structure is known to be shallow, so serialising is always safe.
  if (walk.problems.length === 0) {
    const bytes = Buffer.byteLength(JSON.stringify(content));
    if (bytes > RICH_TEXT_LIMITS.maxBytes) {
      walk.add(
        '',
        `Content is too large (${bytes} bytes; limit ${RICH_TEXT_LIMITS.maxBytes})`,
      );
    }
  }
  return walk.problems;
}

function hasText(node: unknown): boolean {
  if (!isPlainObject(node)) return false;
  if (node.type === 'text') {
    return typeof node.text === 'string' && node.text.trim().length > 0;
  }
  return Array.isArray(node.content) && node.content.some(hasText);
}

/**
 * Completeness, checked when the lesson is prepared for publishing (not on drafts):
 * the block must contain some actual text. Assumes the shape is already valid.
 */
export function validateRichTextComplete(content: unknown): ContentProblem[] {
  const body = isPlainObject(content) ? content.body : undefined;
  return hasText(body)
    ? []
    : [{ path: 'body', message: 'Rich text must contain some text' }];
}
