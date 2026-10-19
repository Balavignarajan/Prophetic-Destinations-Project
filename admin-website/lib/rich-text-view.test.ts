// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { editorTextToRichText, isSafeLinkHref, richTextToEditorText } from './rich-text.ts';
import { richTextToView, type ViewBlock } from './rich-text-view.ts';

const doc = (...content: unknown[]) => ({ body: { type: 'doc', content } });
const text = (value: string, ...marks: unknown[]) => (marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value });
const p = (...c: unknown[]) => ({ type: 'paragraph', content: c });
const li = (...c: unknown[]) => ({ type: 'listItem', content: c });
const bold = { type: 'bold' };
const italic = { type: 'italic' };
const link = (href: string) => ({ type: 'link', attrs: { href } });
const inl = (b: ViewBlock | undefined) => (b && b.kind === 'paragraph' ? b.inlines : []);

describe('rendering a structured document (no markers appear)', () => {
  it('ordinary text renders as plain paragraphs', () => {
    const view = richTextToView(doc(p(text('First.')), p(text('Second.'))));
    assert.equal(view.length, 2);
    assert.deepEqual(inl(view[0]), [{ text: 'First.', bold: false, italic: false, href: null }]);
  });
  it('bold, italic and both', () => {
    const [block] = richTextToView(doc(p(text('a '), text('b', bold), text(' c '), text('d', italic), text(' e '), text('f', bold, italic))));
    assert.deepEqual(
      inl(block).map((i) => [i.text, i.bold, i.italic]),
      [['a ', false, false], ['b', true, false], [' c ', false, false], ['d', false, true], [' e ', false, false], ['f', true, true]],
    );
  });
  it('links keep their label and target, never the bracket syntax', () => {
    const [block] = richTextToView(doc(p(text('see '), text('this page', link('https://example.com/a?b=1')))));
    assert.deepEqual(inl(block)[1], { text: 'this page', bold: false, italic: false, href: 'https://example.com/a?b=1' });
    assert.ok(!JSON.stringify(block).includes(']('));
  });
  it('bulleted and numbered lists, including a nested one', () => {
    const view = richTextToView(
      doc({ type: 'bulletList', content: [li(p(text('one')), { type: 'orderedList', content: [li(p(text('inner')))] }), li(p(text('two')))] }),
    );
    const list = view[0];
    assert.equal(list.kind, 'list');
    if (list.kind !== 'list') return;
    assert.equal(list.ordered, false);
    assert.equal(list.items.length, 2);
    const nested = list.items[0][1];
    assert.equal(nested.kind === 'list' && nested.ordered, true);
  });
  it('the documents the editor produces render with formatting and no leftover markers', () => {
    const typed = 'Read **Daniel 2** and *this* [page](https://example.com).\n\n- first\n- second\n\n1. one\n2. two';
    const view = richTextToView(editorTextToRichText(typed));
    assert.equal(view.length, 3);
    const flat = JSON.stringify(view);
    assert.ok(!flat.includes('**') && !flat.includes('](') && !flat.includes('"- '), 'markers leaked into the rendering');
    assert.equal(view[1].kind === 'list' && !view[1].ordered, true);
    assert.equal(view[2].kind === 'list' && view[2].ordered, true);
  });
  it('rendering and editing agree: what is rendered re-opens as the same editor text', () => {
    const typed = 'A **b** *c* [d](https://example.com)\n\n- x\n  - y';
    assert.equal(richTextToEditorText(editorTextToRichText(typed)), typed);
  });
});

describe('safety: content is data, never markup', () => {
  it('HTML in text stays literal text', () => {
    const [block] = richTextToView(doc(p(text('<script>alert(1)</script><img src=x onerror=alert(1)>'))));
    assert.equal(inl(block)[0].text, '<script>alert(1)</script><img src=x onerror=alert(1)>');
  });
  it('unsafe link targets are dropped and the label is kept as plain text', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<b>x', 'vbscript:x', 'file:///etc/passwd', '//evil.example', 'relative/path', 'https://a b', '']) {
      const [block] = richTextToView(doc(p(text('click', link(href)))));
      assert.deepEqual(inl(block), [{ text: 'click', bold: false, italic: false, href: null }], href);
    }
  });
  it('http, https and mailto targets are allowed', () => {
    for (const href of ['http://a.example', 'https://a.example/x', 'mailto:a@b.example']) assert.equal(isSafeLinkHref(href), true, href);
  });
  it('unknown nodes, marks and malformed input are skipped without throwing', () => {
    assert.deepEqual(richTextToView(null), []);
    assert.deepEqual(richTextToView({}), []);
    assert.deepEqual(richTextToView({ body: { type: 'nope' } }), []);
    const view = richTextToView(
      doc({ type: 'heading', content: [text('H')] }, { type: 'html', content: '<b>x</b>' }, p(text('ok', { type: 'underline' }, { type: 'style' }))),
    );
    assert.equal(view.length, 1);
    assert.deepEqual(inl(view[0]), [{ text: 'ok', bold: false, italic: false, href: null }]);
  });
  it('typing an unsafe or unfinished link address does not create a link mark', () => {
    for (const typed of ['[x](javascript:alert(1))', '[x](https://)', '[x](not a url)']) {
      assert.ok(!JSON.stringify(editorTextToRichText(typed)).includes('"link"'), typed);
    }
  });
  it('empty paragraphs and empty documents render nothing', () => {
    assert.deepEqual(richTextToView(doc(p(), { type: 'paragraph' })), []);
    assert.deepEqual(richTextToView(doc()), []);
  });
  it('a pathologically deep list is cut off instead of recursing without limit', () => {
    let node: unknown = p(text('leaf'));
    for (let i = 0; i < 50; i += 1) node = { type: 'bulletList', content: [li(node)] };
    assert.doesNotThrow(() => richTextToView(doc(node)));
  });
});
