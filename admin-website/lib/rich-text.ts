/**
 * Lossless conversion between the backend's RICH_TEXT document and the plain-text format the admin editor edits.
 *
 * Backend contract (backend/src/modules/lessons/domain/blocks/rich-text.ts):
 *   { body: { type: 'doc', content: [ paragraph | bulletList | orderedList ] } }
 *   paragraph: inline `text` nodes; list: `listItem`s holding paragraphs and nested lists; marks: bold, italic, link {href}.
 *
 * Editor text format (what an editor types; a blank line separates blocks):
 *   plain paragraph                 -> paragraph            (a single line break stays inside the paragraph)
 *   **bold**   *italic*   ***both***  -> bold / italic marks
 *   [label](https://example.org)      -> link mark (may contain **bold** / *italic*)
 *   - item                            -> bulletList item      (nest by indenting two spaces)
 *   1. item                           -> orderedList item
 *   \* \[ \] \\ \-                    -> the literal character (a backslash escapes the next character)
 *
 * Safety rule: a document is only EDITABLE here if converting it to text and back reproduces it exactly (`isEditable`). Anything
 * the format cannot represent (for example a list item with two paragraphs, an unknown mark, a text node containing a blank
 * line) is shown read-only, so saving can never silently change approved content. Cosmetic normalisation that does not change
 * what a learner sees is allowed: adjacent text nodes with the same marks are merged, marks are ordered link, bold, italic, and
 * empty top-level paragraphs are dropped.
 *
 * No runtime imports: this file is unit-tested with plain Node (see rich-text.test.ts).
 */
export interface RichTextMark {
  type: string;
  attrs?: { href?: unknown };
}
export interface RichTextNode {
  type: string;
  text?: string;
  marks?: RichTextMark[];
  content?: RichTextNode[];
}
export interface RichTextContent {
  body: { type: 'doc'; content: RichTextNode[] };
}

const NEWLINE = String.fromCharCode(10);
const MAX_HREF_LENGTH = 2048;

/** Mirrors the backend's link rule: an absolute http, https or mailto URL with no whitespace or control characters. */
export function isSafeLinkHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length === 0 || href.length > MAX_HREF_LENGTH) return false;
  for (let i = 0; i < href.length; i += 1) {
    const code = href.charCodeAt(i);
    if (code <= 32 || (code >= 127 && code <= 160)) return false;
  }
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}
const MARK_ORDER = ['link', 'bold', 'italic'];
const LIST_LINE = /^( *)(-|\d+\.) (.*)$/;
const LIST_START_IN_TEXT = /^( *)(- |\d+\. )/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// ------------------------------------------------------------------------------------------------ normalisation

interface Inline {
  text: string;
  bold: boolean;
  italic: boolean;
  href: string | null;
}

/** Reads a paragraph's text nodes. Returns null if anything in it cannot be represented (unknown node or mark, odd link). */
function readInline(content: unknown): Inline[] | null {
  if (content === undefined) return [];
  if (!Array.isArray(content)) return null;
  const out: Inline[] = [];
  for (const node of content) {
    if (!isObject(node) || node.type !== 'text' || typeof node.text !== 'string') return null;
    if (Object.keys(node).some((key) => key !== 'type' && key !== 'text' && key !== 'marks')) return null;
    let bold = false;
    let italic = false;
    let href: string | null = null;
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) return null;
      for (const mark of node.marks) {
        if (!isObject(mark)) return null;
        if (mark.type === 'bold' && mark.attrs === undefined) bold = true;
        else if (mark.type === 'italic' && mark.attrs === undefined) italic = true;
        else if (mark.type === 'link' && isObject(mark.attrs) && Object.keys(mark.attrs).length === 1 && typeof mark.attrs.href === 'string') href = mark.attrs.href;
        else return null;
      }
    }
    out.push({ text: node.text, bold, italic, href });
  }
  return mergeInline(out);
}

function mergeInline(items: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const item of items) {
    if (item.text === '') continue;
    const last = merged[merged.length - 1];
    if (last && last.bold === item.bold && last.italic === item.italic && last.href === item.href) last.text += item.text;
    else merged.push({ ...item });
  }
  return merged;
}

function inlineToNodes(items: Inline[]): RichTextNode[] {
  return mergeInline(items).map((item) => {
    const marks: RichTextMark[] = [];
    for (const type of MARK_ORDER) {
      if (type === 'link' && item.href !== null) marks.push({ type: 'link', attrs: { href: item.href } });
      if (type === 'bold' && item.bold) marks.push({ type: 'bold' });
      if (type === 'italic' && item.italic) marks.push({ type: 'italic' });
    }
    return marks.length > 0 ? { type: 'text', text: item.text, marks } : { type: 'text', text: item.text };
  });
}

const hasContent = (items: Inline[]) => items.some((item) => item.text.trim() !== '');

// ------------------------------------------------------------------------------------------------ document -> editor text

const escapeText = (text: string) => text.replace(/[\\*[\]]/g, '\\$&');
const escapeUrl = (url: string) => url.replace(/[\\)]/g, '\\$&');

/**
 * Emits the text with bold/italic written as TOGGLES: one marker where a state changes, not a wrapper around every node.
 * (Wrapping each node would put two marker runs next to each other, e.g. `*a****b***`, which reads back as different marks.)
 * Inside a link label the state must start and end the same as outside, so each label's toggles pair up on their own.
 */
function inlineToText(items: Inline[]): string {
  let out = '';
  let bold = false;
  let italic = false;
  const moveTo = (nextBold: boolean, nextItalic: boolean) => {
    if (nextBold !== bold) out += '**';
    if (nextItalic !== italic) out += '*';
    bold = nextBold;
    italic = nextItalic;
  };
  let i = 0;
  while (i < items.length) {
    const href = items[i].href;
    if (href === null) {
      moveTo(items[i].bold, items[i].italic);
      out += escapeText(items[i].text);
      i += 1;
      continue;
    }
    const enterBold = bold;
    const enterItalic = italic;
    out += '[';
    while (i < items.length && items[i].href === href) {
      moveTo(items[i].bold, items[i].italic);
      out += escapeText(items[i].text);
      i += 1;
    }
    moveTo(enterBold, enterItalic);
    out += `](${escapeUrl(href)})`;
  }
  moveTo(false, false);
  return out;
}

/** A line that would read as a list marker if it started a block or line of a paragraph gets its marker escaped. */
function guardLineStarts(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(LIST_START_IN_TEXT, (_all, spaces: string, marker: string) => (marker === '- ' ? `${spaces}\\- ` : `${spaces}${marker.replace('.', '\\.')}`)))
    .join('\n');
}

interface Serialised {
  text: string;
  exact: boolean;
}

function listToLines(list: RichTextNode, depth: number): string[] | null {
  const ordered = list.type === 'orderedList';
  if (!Array.isArray(list.content) || list.content.length === 0) return null;
  const lines: string[] = [];
  let number = 0;
  for (const item of list.content) {
    if (item.type !== 'listItem' || !Array.isArray(item.content) || item.content.length === 0) return null;
    const [first, ...rest] = item.content;
    if (first.type !== 'paragraph') return null;
    const inline = readInline(first.content);
    if (inline === null) return null;
    number += 1;
    const marker = ordered ? `${number}.` : '-';
    const indent = ' '.repeat(depth * 2);
    const textLines = guardLineStarts(inlineToText(inline)).split('\n');
    lines.push(`${indent}${marker} ${textLines[0]}`);
    for (const continuation of textLines.slice(1)) lines.push(`${indent}${' '.repeat(marker.length + 1)}${continuation}`);
    for (const child of rest) {
      if (child.type !== 'bulletList' && child.type !== 'orderedList') return null;
      const nested = listToLines(child, depth + 1);
      if (nested === null) return null;
      lines.push(...nested);
    }
  }
  return lines;
}

function documentToText(content: unknown): Serialised {
  if (content === null || content === undefined) return { text: '', exact: true };
  if (!isObject(content) || Object.keys(content).some((key) => key !== 'body') || !isObject(content.body)) return { text: '', exact: false };
  const body = content.body;
  if (body.type !== 'doc' || !Array.isArray(body.content)) return { text: '', exact: false };
  const blocks: string[] = [];
  let exact = true;
  for (const node of body.content as RichTextNode[]) {
    if (!isObject(node)) {
      exact = false;
      continue;
    }
    if (node.type === 'paragraph') {
      const inline = readInline(node.content);
      if (inline === null) {
        exact = false;
        continue;
      }
      if (inline.length === 0) continue; // an empty paragraph shows nothing
      blocks.push(guardLineStarts(inlineToText(inline)));
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const lines = listToLines(node, 0);
      if (lines === null) exact = false;
      else blocks.push(lines.join('\n'));
    } else {
      exact = false;
    }
  }
  return { text: blocks.join('\n\n'), exact };
}

/** The editor text for a block's content (best effort when the content is not exactly representable; see `isEditable`). */
export function richTextToEditorText(content: unknown): string {
  return documentToText(content).text;
}

// ------------------------------------------------------------------------------------------------ editor text -> document

type Token = { kind: 'text'; value: string } | { kind: 'bold' } | { kind: 'italic' } | { kind: 'link'; label: string; url: string };

function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer !== '') tokens.push({ kind: 'text', value: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      buffer += i + 1 < src.length ? src[i + 1] : '\\';
      i += 2;
      continue;
    }
    if (ch === '*') {
      flush();
      if (src[i + 1] === '*') {
        tokens.push({ kind: 'bold' });
        i += 2;
      } else {
        tokens.push({ kind: 'italic' });
        i += 1;
      }
      continue;
    }
    if (ch === '[') {
      const link = readLink(src, i);
      // A link whose target the backend would refuse (or that is unsafe) stays literal text instead of becoming a link mark.
      if (link && isSafeLinkHref(link.url)) {
        flush();
        tokens.push({ kind: 'link', label: link.label, url: link.url });
        i = link.end;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return tokens;
}

/** `[label](url)` starting at `start`, or null. The label may not contain an unescaped `[`; the url ends at the first unescaped `)`. */
function readLink(src: string, start: number): { label: string; url: string; end: number } | null {
  let j = start + 1;
  while (j < src.length && src[j] !== ']') {
    if (src[j] === '\\') j += 1;
    else if (src[j] === '[') return null;
    j += 1;
  }
  if (j >= src.length || src[j + 1] !== '(') return null;
  let k = j + 2;
  let url = '';
  while (k < src.length && src[k] !== ')') {
    if (src[k] === '\\' && k + 1 < src.length) {
      url += src[k + 1];
      k += 2;
    } else {
      url += src[k];
      k += 1;
    }
  }
  if (k >= src.length || url === '') return null;
  return { label: src.slice(start + 1, j), url, end: k + 1 };
}

/** Parses one paragraph's worth of inline text. An emphasis marker with no partner stays literal. */
function parseInline(src: string, start: { bold: boolean; italic: boolean }, href: string | null): Inline[] {
  const tokens = tokenise(src);
  for (const kind of ['bold', 'italic'] as const) {
    const indexes = tokens.map((t, index) => (t.kind === kind ? index : -1)).filter((index) => index >= 0);
    if (indexes.length % 2 === 1) tokens[indexes[indexes.length - 1]] = { kind: 'text', value: kind === 'bold' ? '**' : '*' };
  }
  const out: Inline[] = [];
  let bold = start.bold;
  let italic = start.italic;
  for (const token of tokens) {
    if (token.kind === 'bold') bold = !bold;
    else if (token.kind === 'italic') italic = !italic;
    else if (token.kind === 'text') out.push({ text: token.value, bold, italic, href });
    else out.push(...parseInline(token.label, { bold, italic }, token.url));
  }
  return mergeInline(out);
}

function paragraphNode(items: Inline[]): RichTextNode {
  const content = inlineToNodes(items);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

interface ListFrame {
  indent: number;
  ordered: boolean;
  list: RichTextNode;
  lastItem: RichTextNode | null;
  markerWidth: number;
}

function parseListBlock(lines: string[]): RichTextNode[] {
  const topLevel: RichTextNode[] = [];
  const stack: ListFrame[] = [];
  // The item being read: its text may continue on following (indented, marker-less) lines.
  const open: { frame: ListFrame | null; item: RichTextNode | null; text: string } = { frame: null, item: null, text: '' };

  const finishItem = () => {
    const paragraph = open.item?.content?.[0];
    if (paragraph) Object.assign(paragraph, paragraphNode(parseInline(open.text, { bold: false, italic: false }, null)));
    open.frame = null;
    open.item = null;
    open.text = '';
  };

  const attach = (list: RichTextNode, parent: ListFrame | undefined) => {
    if (parent === undefined) topLevel.push(list);
    else parent.lastItem?.content?.push(list);
  };

  for (const line of lines) {
    const match = LIST_LINE.exec(line);
    if (match === null) {
      if (open.frame !== null) {
        const strip = Math.min(line.length - line.trimStart().length, open.frame.indent + open.frame.markerWidth);
        open.text += NEWLINE + line.slice(strip);
      }
      continue;
    }
    finishItem();
    const indent = match[1].length;
    const ordered = match[2] !== '-';
    while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop();
    let frame: ListFrame | undefined = stack[stack.length - 1];
    if (frame !== undefined && frame.indent === indent && frame.ordered !== ordered) {
      stack.pop(); // same depth, other list type: a new sibling list
      frame = undefined;
    }
    if (frame === undefined || frame.indent !== indent) {
      const list: RichTextNode = { type: ordered ? 'orderedList' : 'bulletList', content: [] };
      attach(list, stack[stack.length - 1]);
      frame = { indent, ordered, list, lastItem: null, markerWidth: match[2].length + 1 };
      stack.push(frame);
    }
    const item: RichTextNode = { type: 'listItem', content: [{ type: 'paragraph' }] };
    frame.list.content?.push(item);
    frame.lastItem = item;
    frame.markerWidth = match[2].length + 1;
    open.frame = frame;
    open.item = item;
    open.text = match[3];
  }
  finishItem();
  return topLevel;
}

/** Converts editor text into a RICH_TEXT document. Never throws; empty text gives an empty document. */
export function editorTextToRichText(text: string): RichTextContent {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const content: RichTextNode[] = [];
  for (const block of blocks) {
    if (LIST_LINE.test(block[0])) {
      content.push(...parseListBlock(block));
    } else {
      const items = parseInline(block.join('\n'), { bold: false, italic: false }, null);
      if (hasContent(items)) content.push(paragraphNode(items));
    }
  }
  return { body: { type: 'doc', content } };
}

// ------------------------------------------------------------------------------------------------ editability

function canonicalNode(node: unknown): unknown {
  if (!isObject(node)) return node;
  if (node.type === 'text') {
    const marks = Array.isArray(node.marks)
      ? [...node.marks].sort((a, b) => MARK_ORDER.indexOf(String((a as RichTextMark).type)) - MARK_ORDER.indexOf(String((b as RichTextMark).type)))
      : undefined;
    return marks && marks.length > 0 ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text };
  }
  const children = Array.isArray(node.content) ? mergeCanonicalText(node.content.map(canonicalNode)) : undefined;
  return children && children.length > 0 ? { type: node.type, content: children } : { type: node.type };
}

function mergeCanonicalText(nodes: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (isObject(node) && node.type === 'text' && node.text === '') continue;
    if (isObject(node) && node.type === 'text' && isObject(last) && last.type === 'text' && JSON.stringify(last.marks ?? null) === JSON.stringify(node.marks ?? null)) {
      last.text = String(last.text) + String(node.text);
    } else {
      out.push(isObject(node) ? { ...node } : node);
    }
  }
  return out;
}

/** The document with cosmetic differences removed, for comparing two documents. */
export function canonicalRichText(content: unknown): string {
  if (!isObject(content) || !isObject(content.body) || !Array.isArray(content.body.content)) return JSON.stringify(content ?? null);
  const blocks = content.body.content
    .map(canonicalNode)
    .filter((node) => !(isObject(node) && node.type === 'paragraph' && node.content === undefined));
  return JSON.stringify({ body: { type: 'doc', content: blocks } });
}

/**
 * True if the editor can show and re-save this content without changing it: empty content, or content that survives
 * document -> text -> document unchanged. When false the editor must not offer Save (see RichTextEditor `locked`).
 */
export function isEditable(content: unknown): boolean {
  if (content === null || content === undefined) return true;
  const serialised = documentToText(content);
  if (!serialised.exact) return false;
  return canonicalRichText(editorTextToRichText(serialised.text)) === canonicalRichText(content);
}
