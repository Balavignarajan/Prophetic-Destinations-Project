// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalRichText,
  editorTextToRichText,
  isEditable,
  richTextToEditorText,
  type RichTextContent,
  type RichTextMark,
  type RichTextNode,
} from './rich-text.ts';

const doc = (...content: RichTextNode[]): RichTextContent => ({ body: { type: 'doc', content } });
const text = (value: string, ...marks: RichTextMark[]): RichTextNode => (marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value });
const bold: RichTextMark = { type: 'bold' };
const italic: RichTextMark = { type: 'italic' };
const link = (href: string): RichTextMark => ({ type: 'link', attrs: { href } });
const p = (...content: RichTextNode[]): RichTextNode => ({ type: 'paragraph', content });
const li = (...content: RichTextNode[]): RichTextNode => ({ type: 'listItem', content });
const ul = (...items: RichTextNode[]): RichTextNode => ({ type: 'bulletList', content: items });
const ol = (...items: RichTextNode[]): RichTextNode => ({ type: 'orderedList', content: items });

/** document -> editor text -> document, as the editor does on open and on Save. */
const roundTrip = (content: RichTextContent): RichTextContent => editorTextToRichText(richTextToEditorText(content));
const same = (a: unknown, b: unknown) => assert.equal(canonicalRichText(a), canonicalRichText(b));

describe('every supported formatting type survives open -> save', () => {
  const cases: [string, RichTextContent][] = [
    ['plain paragraphs', doc(p(text('First paragraph.')), p(text('Second paragraph.')))],
    ['bold', doc(p(text('Read '), text('Daniel 2', bold), text(' carefully.')))],
    ['italic', doc(p(text('The '), text('Lamb', italic), text(' of God.')))],
    ['bold and italic together', doc(p(text('very ', bold, italic), text('important')))],
    ['a link', doc(p(text('See '), text('this page', link('https://example.org/a?b=1&c=2')), text('.')))],
    ['a bold link', doc(p(text('Go '), text('here', link('https://example.org'), bold)))],
    ['a bold italic link', doc(p(text('here', link('mailto:team@example.org'), bold, italic)))],
    ['two adjacent links', doc(p(text('one', link('https://a.example')), text('two', link('https://b.example'))))],
    ['a bullet list', doc(ul(li(p(text('first'))), li(p(text('second')))))],
    ['a numbered list', doc(ol(li(p(text('first'))), li(p(text('second'))), li(p(text('third')))))],
    ['a nested list', doc(ul(li(p(text('parent')), ul(li(p(text('child one'))), li(p(text('child two')))), ol(li(p(text('numbered child'))))), li(p(text('sibling')))))],
    ['formatting inside list items', doc(ul(li(p(text('a ', bold), text('link', link('https://example.org')), text(' and '), text('emphasis', italic)))))],
    ['a paragraph, a list and another paragraph', doc(p(text('Intro')), ol(li(p(text('x'))), li(p(text('y')))), p(text('Outro')))],
    ['two different lists in a row', doc(ul(li(p(text('bullet')))), ol(li(p(text('number')))))],
    ['a soft line break inside a paragraph', doc(p(text('line one\nline two')))],
    ['a Scripture token written as plain text', doc(p(text('As in [Scripture: John 3:16] we read.')))],
    ['leading and trailing spaces', doc(p(text('  indented text  ')))],
  ];
  for (const [name, content] of cases) {
    it(`${name}: is editable and round-trips unchanged`, () => {
      assert.equal(isEditable(content), true, 'the editor must be able to open it');
      same(roundTrip(content), content);
    });
  }

  it('the editor text for formatted content is human-readable', () => {
    const content = doc(
      p(text('Read '), text('Daniel 2', bold), text(' and '), text('this', link('https://example.org')), text('.')),
      ul(li(p(text('one'))), li(p(text('two')))),
    );
    assert.equal(richTextToEditorText(content), 'Read **Daniel 2** and [this](https://example.org).\n\n- one\n- two');
  });

  it('typing the syntax produces the expected document', () => {
    const typed = editorTextToRichText('Hello **bold** and *italic* and [a link](https://example.org).\n\n1. one\n2. two\n   - nested\n\nEnd');
    same(
      typed,
      doc(
        p(text('Hello '), text('bold', bold), text(' and '), text('italic', italic), text(' and '), text('a link', link('https://example.org')), text('.')),
        ol(li(p(text('one'))), li(p(text('two')), ul(li(p(text('nested')))))),
        p(text('End')),
      ),
    );
  });
});

describe('text that looks like syntax stays literal', () => {
  const literal = [
    'a * star and ** double stars',
    'an [unclosed bracket',
    'brackets [not](a link) written as text',
    'back\\slash and \\* escaped-looking text',
    '- not a list',
    '1. not a numbered list',
    '  - indented not a list',
    'second line\n- not a list either',
    'url-ish (parentheses) and ]]] symbols',
  ];
  for (const value of literal) {
    it(JSON.stringify(value), () => {
      const content = doc(p(text(value)));
      assert.equal(isEditable(content), true);
      same(roundTrip(content), content);
    });
  }

  it('an emphasis marker typed without a partner is kept as text, not dropped', () => {
    same(editorTextToRichText('price is 5 * 3'), doc(p(text('price is 5 * 3'))));
    same(editorTextToRichText('open **bold never closed'), doc(p(text('open **bold never closed'))));
  });

  it('link URLs may contain parentheses and backslashes', () => {
    const content = doc(p(text('wiki', link('https://example.org/a_(b)/c\\d'))));
    assert.equal(isEditable(content), true);
    same(roundTrip(content), content);
  });
});

describe('content the editor cannot represent exactly is protected, never rewritten', () => {
  it('a list item with two paragraphs', () => {
    assert.equal(isEditable(doc(ul(li(p(text('one')), p(text('two')))))), false);
  });
  it('a list item that starts with a nested list', () => {
    assert.equal(isEditable(doc(ul(li(ul(li(p(text('x')))))))), false);
  });
  it('a nested list followed by a paragraph inside an item', () => {
    assert.equal(isEditable(doc(ul(li(p(text('a')), ul(li(p(text('b')))), p(text('after')))))), false);
  });
  it('an unknown mark', () => {
    assert.equal(isEditable(doc(p({ type: 'text', text: 'x', marks: [{ type: 'underline' }] }))), false);
  });
  it('an unknown node type', () => {
    assert.equal(isEditable(doc({ type: 'heading', content: [text('Title')] })), false);
  });
  it('a text node holding a blank line (would split into two paragraphs)', () => {
    assert.equal(isEditable(doc(p(text('first\n\nsecond')))), false);
  });
  it('a malformed document', () => {
    assert.equal(isEditable({ nope: true }), false);
    assert.equal(isEditable({ body: { type: 'doc' } }), false);
  });
  it('empty content is editable', () => {
    assert.equal(isEditable(null), true);
    assert.equal(isEditable(doc()), true);
  });
});

describe('backward compatibility with the previous plain-text editor', () => {
  it('blank-line separated plain text still becomes one paragraph per block', () => {
    same(editorTextToRichText('One.\n\nTwo.\n\n\n\nThree.'), doc(p(text('One.')), p(text('Two.')), p(text('Three.'))));
  });
  it('plain paragraphs produced by the old editor open unchanged', () => {
    const old = doc(p(text('Plain one.')), p(text('Plain two.')));
    assert.equal(richTextToEditorText(old), 'Plain one.\n\nPlain two.');
  });
  it('Windows line endings are accepted', () => {
    same(editorTextToRichText('a\r\n\r\nb'), doc(p(text('a')), p(text('b'))));
  });
  it('empty text gives an empty document', () => {
    same(editorTextToRichText('   \n\n  '), doc());
  });
});

describe('the exact defect that was reported', () => {
  it('bold, a link and a bullet list are no longer lost on save', () => {
    const authored = doc(
      p(text('Read '), text('Daniel 2', bold), text(' and '), text('this link', link('https://example.org'))),
      ul(li(p(text('first point'))), li(p(text('second point')))),
    );
    const saved = roundTrip(authored);
    const json = JSON.stringify(saved);
    assert.ok(json.includes('"bold"'), 'bold lost');
    assert.ok(json.includes('"https://example.org"'), 'link lost');
    assert.ok(json.includes('"bulletList"') && json.includes('first point') && json.includes('second point'), 'list lost');
    same(saved, authored);
  });
});

describe('property: random supported documents always round-trip', () => {
  // Small deterministic generator (no dependency, reproducible failures).
  let seed = 20261018;
  const rand = (n: number) => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % n;
  };
  const WORDS = ['alpha', 'Beta', 'gamma delta', 'a*b', '[x]', 'back\\slash', '- dash', '1. one', ' spaced ', 'tilde~', '(par)', 'ünï', 'line\nbreak', 'end.'];
  const HREFS = ['https://example.org', 'https://example.org/a_(b)?x=1&y=2', 'http://a.example/c\\d', 'mailto:a@b.example'];
  const inline = (): RichTextNode[] => {
    const nodes: RichTextNode[] = [];
    for (let i = 0, n = 1 + rand(4); i < n; i += 1) {
      const marks: RichTextMark[] = [];
      if (rand(3) === 0) marks.push(bold);
      if (rand(3) === 0) marks.push(italic);
      if (rand(4) === 0) marks.push(link(HREFS[rand(HREFS.length)]));
      nodes.push(text(WORDS[rand(WORDS.length)], ...marks));
    }
    return nodes;
  };
  const list = (depth: number): RichTextNode => {
    const items: RichTextNode[] = [];
    for (let i = 0, n = 1 + rand(3); i < n; i += 1) {
      const content: RichTextNode[] = [p(...inline())];
      if (depth < 2 && rand(3) === 0) content.push(list(depth + 1));
      items.push(li(...content));
    }
    return rand(2) === 0 ? ul(...items) : ol(...items);
  };
  it('500 random documents are editable and survive open -> save unchanged', () => {
    let editable = 0;
    for (let n = 0; n < 500; n += 1) {
      const blocks: RichTextNode[] = [];
      for (let i = 0, count = 1 + rand(4); i < count; i += 1) blocks.push(rand(3) === 0 ? list(0) : p(...inline()));
      const content = doc(...blocks);
      if (isEditable(content)) {
        editable += 1;
        same(roundTrip(content), content);
      }
    }
    // The generator only builds representable documents, so every one must be editable; anything less is a converter regression.
    assert.equal(editable, 500, `only ${editable}/500 were editable`);
  });
});
