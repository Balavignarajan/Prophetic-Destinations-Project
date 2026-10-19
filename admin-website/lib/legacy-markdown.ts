/**
 * Content saved by the earlier plain-text editor can hold Markdown-style markers as ordinary text (for example a paragraph whose
 * text is "Read **Daniel 2**"). The canonical format is the structured document, so such text is displayed exactly as stored
 * (see rich-text-view.ts) and is never reinterpreted behind the author's back. Instead the editor OFFERS a conversion the author
 * can apply and review before saving: `legacyMarkdownToRichText`.
 *
 * Applies only to documents made purely of plain paragraphs (no marks, no lists, which is all the old editor could save) whose text
 * contains markers that the editor syntax would turn into formatting. Returns null otherwise, or when nothing would change.
 * No runtime imports beyond rich-text.ts: unit-tested with plain Node.
 */
import { canonicalRichText, editorTextToRichText, type RichTextContent } from './rich-text.ts';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The raw text of each paragraph when the document is plain paragraphs only; null if it holds anything else. */
function plainParagraphs(content: unknown): string[] | null {
  if (!isObject(content) || !isObject(content.body) || content.body.type !== 'doc' || !Array.isArray(content.body.content)) return null;
  const out: string[] = [];
  for (const block of content.body.content) {
    if (!isObject(block) || block.type !== 'paragraph') return null;
    const parts = Array.isArray(block.content) ? block.content : [];
    let text = '';
    for (const node of parts) {
      if (!isObject(node) || node.type !== 'text' || typeof node.text !== 'string' || node.marks !== undefined) return null;
      text += node.text;
    }
    out.push(text);
  }
  return out;
}

/** The converted document, or null if the content is not legacy plain text with markers (or the conversion changes nothing). */
export function legacyMarkdownToRichText(content: unknown): RichTextContent | null {
  const paragraphs = plainParagraphs(content);
  if (paragraphs === null) return null;
  const converted = editorTextToRichText(paragraphs.join('\n\n'));
  return canonicalRichText(converted) === canonicalRichText(content) ? null : converted;
}

/** True when the converted document would carry formatting the stored plain text only shows as markers. */
export function hasLegacyMarkers(content: unknown): boolean {
  const converted = legacyMarkdownToRichText(content);
  if (converted === null) return false;
  const json = JSON.stringify(converted);
  return json.includes('"marks"') || json.includes('"bulletList"') || json.includes('"orderedList"');
}
