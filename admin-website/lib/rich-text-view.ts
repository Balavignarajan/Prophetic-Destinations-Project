/**
 * What the admin shows for a RICH_TEXT document (block display and learner preview): a small, framework-free view model that
 * components/RichTextView.tsx turns into React elements. The canonical content format is the backend's structured document
 * (see rich-text.ts), NOT Markdown and NOT HTML: text is always shown as text (React escapes it), marks become <strong>, <em>
 * and <a>, and nothing is ever injected as HTML. This mirrors the learner app's renderer (mobile-app/src/learning/rich-text.tsx):
 * paragraphs, headings (levels 1 to 3), nested bullet/numbered lists, bold, italic, links and inline Scripture references; any node
 * it does not know is skipped, and a link whose target is not an absolute http(s)/mailto URL is shown as plain text.
 *
 * An inline Scripture reference is a structured `scriptureRef` node. In the working copy it is { reference, dataset? } and is shown by its
 * written form ("Daniel 2:31-35"); in the learner preview (and a published snapshot) its attrs are the frozen passage
 * { reference, display, source, verses }, and the verse text is returned with the paragraph so the preview shows what the learner can open.
 *
 * Imports only rich-text.ts (and, through it, scripture.ts): unit-tested with plain Node (see rich-text-view.test.ts).
 */
import { describeScriptureReference, isSafeLinkHref } from './rich-text.ts';

/** The frozen text of a Scripture reference, when the document carries it (a learner preview or a published snapshot). */
export interface ViewPassage {
  label: string;
  verses: { verse: number; text: string }[];
  /** "King James Version, 1769 edition", or '' when the passage does not say. */
  source: string;
}

export interface ViewInline {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Only ever a safe absolute http, https or mailto URL. */
  href: string | null;
  /** Present only on an inline Scripture reference: `text` is then its written form. */
  scripture?: { passage: ViewPassage | null };
}
export type ViewBlock =
  | { kind: 'paragraph'; inlines: ViewInline[]; /** Only present when a reference in the paragraph carries its verse text. */ passages?: ViewPassage[] }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: ViewBlock[][] };

const MAX_DEPTH = 8;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const nonEmpty = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The frozen passage in a reference's attrs, or null when it carries no usable verse text. */
function passageOf(attrs: Record<string, unknown>, label: string): ViewPassage | null {
  const verses = asArray(attrs.verses).flatMap((raw) =>
    isObject(raw) && typeof raw.verse === 'number' && Number.isInteger(raw.verse) && nonEmpty(raw.text) ? [{ verse: raw.verse, text: nonEmpty(raw.text) }] : [],
  );
  if (verses.length === 0) return null;
  const source = isObject(attrs.source) ? [nonEmpty(attrs.source.translation), nonEmpty(attrs.source.edition)].filter(Boolean).join(', ') : '';
  return { label, verses, source };
}

/** The label of a reference node: the frozen `display` when there is one, else the written form of its structured reference; null when it has neither. */
function referenceInline(attrs: Record<string, unknown>): ViewInline | null {
  let label = nonEmpty(attrs.display);
  if (!label && isObject(attrs.reference)) {
    const { bookId, chapter, startVerse, endVerse } = attrs.reference;
    if (typeof bookId === 'string' && typeof chapter === 'number' && typeof startVerse === 'number' && typeof endVerse === 'number') {
      label = describeScriptureReference({ bookId, chapter, startVerse, endVerse });
    }
  }
  if (!label) return null;
  return { text: label, bold: false, italic: false, href: null, scripture: { passage: passageOf(attrs, label) } };
}

function inlines(content: unknown): ViewInline[] {
  const out: ViewInline[] = [];
  for (const node of asArray(content)) {
    if (isObject(node) && node.type === 'scriptureRef' && isObject(node.attrs)) {
      const reference = referenceInline(node.attrs);
      if (reference) out.push(reference);
      continue;
    }
    if (!isObject(node) || node.type !== 'text' || typeof node.text !== 'string' || node.text === '') continue;
    let bold = false;
    let italic = false;
    let href: string | null = null;
    for (const mark of asArray(node.marks)) {
      if (!isObject(mark)) continue;
      if (mark.type === 'bold') bold = true;
      else if (mark.type === 'italic') italic = true;
      else if (mark.type === 'link' && isObject(mark.attrs) && isSafeLinkHref(mark.attrs.href)) href = mark.attrs.href;
    }
    out.push({ text: node.text, bold, italic, href });
  }
  return out;
}

function blocks(nodes: unknown, depth: number): ViewBlock[] {
  const out: ViewBlock[] = [];
  if (depth > MAX_DEPTH) return out;
  for (const node of asArray(nodes)) {
    if (!isObject(node)) continue;
    if (node.type === 'paragraph') {
      const items = inlines(node.content);
      const passages = items.flatMap((item) => (item.scripture?.passage ? [item.scripture.passage] : []));
      out.push(passages.length > 0 ? { kind: 'paragraph', inlines: items, passages } : { kind: 'paragraph', inlines: items });
    } else if (node.type === 'heading') {
      // A heading is plain text on a level the backend accepts (1 to 3); anything else is skipped, as the learner app skips it.
      const level = isObject(node.attrs) ? node.attrs.level : undefined;
      const text = asArray(node.content)
        .map((child) => (isObject(child) && child.type === 'text' && typeof child.text === 'string' ? child.text : ''))
        .join('')
        .trim();
      if ((level === 1 || level === 2 || level === 3) && text) out.push({ kind: 'heading', level, text });
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = asArray(node.content)
        .filter((item): item is Record<string, unknown> => isObject(item) && item.type === 'listItem')
        .map((item) => blocks(item.content, depth + 1));
      out.push({ kind: 'list', ordered: node.type === 'orderedList', items });
    }
  }
  return out;
}

/** The blocks to draw for a document; empty for null, a malformed document, or one with nothing visible. */
export function richTextToView(content: unknown): ViewBlock[] {
  if (!isObject(content) || !isObject(content.body) || content.body.type !== 'doc') return [];
  return blocks(content.body.content, 0).filter((block) => block.kind !== 'paragraph' || block.inlines.length > 0);
}
