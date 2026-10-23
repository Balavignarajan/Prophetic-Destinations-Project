/**
 * Pure text transforms behind the editor toolbar (components/RichTextEditor.tsx). They only ever insert the editor syntax that
 * rich-text.ts parses, so whatever the toolbar produces becomes the matching bold/italic/link/list/heading/reference nodes on save, and is shown
 * by the same renderer. Each returns the new text and the selection to restore.
 * The only import is rich-text.ts (for the written form of a reference): unit-tested with plain Node.
 */
import { scriptureToken } from './rich-text.ts';
import type { ScriptureReference } from './scripture.ts';

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection in a marker (`**` or `*`), or inserts a placeholder word to type over when nothing is selected. */
export function wrapSelection(value: string, start: number, end: number, marker: '**' | '*'): EditResult {
  const selected = value.slice(start, end) || 'text';
  const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
  return { value: next, selectionStart: start + marker.length, selectionEnd: start + marker.length + selected.length };
}

/** Turns the selection into [label](https://), with the unfinished address selected. An address left unfinished stays plain text. */
export function linkSelection(value: string, start: number, end: number): EditResult {
  const label = value.slice(start, end) || 'link text';
  const url = 'https://';
  const next = `${value.slice(0, start)}[${label}](${url})${value.slice(end)}`;
  const urlStart = start + label.length + 3;
  return { value: next, selectionStart: urlStart, selectionEnd: urlStart + url.length };
}

const LIST_MARKER = /^( *)(?:-|\d+\.) /;

/**
 * Makes the lines touched by the selection a bullet or numbered list (or removes the markers when they all already have it).
 * A list must be separated from neighbouring paragraph text by a blank line, so one is added where needed.
 */
export function toggleList(value: string, start: number, end: number, kind: 'bullet' | 'numbered'): EditResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  const lineEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const marker = (i: number) => (kind === 'bullet' ? '- ' : `${i + 1}. `);
  const wanted = kind === 'bullet' ? /^( *)- / : /^( *)\d+\. /;
  const allMarked = lines.every((line) => line.trim() === '' || wanted.test(line));
  let body: string;
  if (allMarked) {
    body = lines.map((line) => line.replace(LIST_MARKER, '$1')).join('\n');
  } else {
    let n = 0;
    body = lines
      .map((line) => {
        if (line.trim() === '') return line;
        const bare = line.replace(LIST_MARKER, '$1');
        return marker(n++) + bare.trimStart();
      })
      .join('\n');
  }
  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);
  const prevLine = before === '' ? '' : before.slice(0, -1).split('\n').pop() ?? '';
  const nextLine = after === '' ? '' : after.slice(1).split('\n')[0] ?? '';
  const needBefore = !allMarked && before !== '' && prevLine.trim() !== '' && !LIST_MARKER.test(prevLine);
  const needAfter = !allMarked && after !== '' && nextLine.trim() !== '' && !LIST_MARKER.test(nextLine);
  const head = before + (needBefore ? '\n' : '');
  const tail = (needAfter ? '\n' : '') + after;
  return { value: head + body + tail, selectionStart: head.length, selectionEnd: head.length + body.length };
}

/**
 * Makes the line holding the cursor a heading of `level` ("## text"), changes it to that level if it is another heading, or turns it back into plain text
 * when it is already a heading of that level. A heading is always a line of its own; only the first line of a selection is changed.
 */
export function toggleHeading(value: string, start: number, end: number, level: 1 | 2 | 3): EditResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', start);
  const lineEnd = nl === -1 ? value.length : nl;
  const line = value.slice(lineStart, lineEnd);
  const existing = /^(#{1,3}) /.exec(line);
  const bare = existing ? line.slice(existing[0].length) : line;
  const changed = existing && existing[1].length === level ? bare : `${'#'.repeat(level)} ${bare}`;
  const shift = changed.length - line.length;
  return {
    value: value.slice(0, lineStart) + changed + value.slice(lineEnd),
    selectionStart: Math.max(lineStart, start + shift),
    selectionEnd: Math.max(lineStart, end + shift),
  };
}

/** Replaces the selection (or inserts at the cursor) with an inline Scripture reference, "{{Daniel 2:31-35}}", spaced from the words around it. */
export function insertScriptureReference(value: string, start: number, end: number, reference: ScriptureReference): EditResult {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before !== '' && !/[\s([]$/.test(before) ? ' ' : '';
  const trail = after !== '' && !/^[\s.,;:!?)\]]/.test(after) ? ' ' : '';
  const token = `${lead}${scriptureToken(reference)}${trail}`;
  const caret = start + lead.length + scriptureToken(reference).length;
  return { value: before + token + after, selectionStart: caret, selectionEnd: caret };
}
