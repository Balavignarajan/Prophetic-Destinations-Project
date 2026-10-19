/**
 * What the admin shows for a RICH_TEXT document (block display and learner preview): a small, framework-free view model that
 * components/RichTextView.tsx turns into React elements. The canonical content format is the backend's structured document
 * (see rich-text.ts), NOT Markdown and NOT HTML: text is always shown as text (React escapes it), marks become <strong>, <em>
 * and <a>, and nothing is ever injected as HTML. This mirrors the learner app's renderer (mobile-app/src/learning/rich-text.tsx):
 * paragraphs, nested bullet/numbered lists, bold, italic and links; any node it does not know is skipped, and a link whose target
 * is not an absolute http(s)/mailto URL is shown as plain text.
 *
 * No runtime imports beyond rich-text.ts: unit-tested with plain Node (see rich-text-view.test.ts).
 */
import { isSafeLinkHref } from './rich-text.ts';

export interface ViewInline {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Only ever a safe absolute http, https or mailto URL. */
  href: string | null;
}
export type ViewBlock =
  | { kind: 'paragraph'; inlines: ViewInline[] }
  | { kind: 'list'; ordered: boolean; items: ViewBlock[][] };

const MAX_DEPTH = 8;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function inlines(content: unknown): ViewInline[] {
  const out: ViewInline[] = [];
  for (const node of asArray(content)) {
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
      out.push({ kind: 'paragraph', inlines: inlines(node.content) });
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
  return blocks(content.body.content, 0).filter((block) => block.kind === 'list' || block.inlines.length > 0);
}
