// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { linkSelection, toggleList, wrapSelection } from './editor-format.ts';
import { editorTextToRichText, richTextToEditorText } from './rich-text.ts';

const marks = (typed: string) => JSON.stringify(editorTextToRichText(typed));

describe('toolbar output is accepted by the renderer pipeline', () => {
  it('Bold wraps the selection and produces a bold mark', () => {
    const r = wrapSelection('Read Daniel 2 today', 5, 13, '**');
    assert.equal(r.value, 'Read **Daniel 2** today');
    assert.equal(r.value.slice(r.selectionStart, r.selectionEnd), 'Daniel 2');
    assert.ok(marks(r.value).includes('"bold"'));
  });
  it('Italic wraps the selection and produces an italic mark', () => {
    const r = wrapSelection('the Lamb', 4, 8, '*');
    assert.equal(r.value, 'the *Lamb*');
    assert.ok(marks(r.value).includes('"italic"'));
  });
  it('with nothing selected a placeholder is inserted and selected', () => {
    const r = wrapSelection('ab', 1, 1, '**');
    assert.equal(r.value, 'a**text**b');
    assert.equal(r.value.slice(r.selectionStart, r.selectionEnd), 'text');
  });
  it('Link leaves an unfinished address selected, which stays plain text until completed', () => {
    const r = linkSelection('see this page', 4, 13);
    assert.equal(r.value, 'see [this page](https://)');
    assert.equal(r.value.slice(r.selectionStart, r.selectionEnd), 'https://');
    assert.ok(!marks(r.value).includes('"link"'));
    const done = r.value.replace('https://', 'https://example.com');
    assert.ok(marks(done).includes('"link"') && marks(done).includes('https://example.com'));
  });
  it('Bullet list turns lines into bullets and produces a bulletList', () => {
    const r = toggleList('one\ntwo', 0, 7, 'bullet');
    assert.equal(r.value, '- one\n- two');
    assert.ok(marks(r.value).includes('"bulletList"'));
  });
  it('Numbered list numbers the lines and produces an orderedList', () => {
    const r = toggleList('one\ntwo\nthree', 0, 13, 'numbered');
    assert.equal(r.value, '1. one\n2. two\n3. three');
    assert.ok(marks(r.value).includes('"orderedList"'));
  });
  it('a list is separated from neighbouring paragraph text by a blank line so it really becomes a list', () => {
    const r = toggleList('Intro\nitem\nOutro', 6, 10, 'bullet');
    assert.equal(r.value, 'Intro\n\n- item\n\nOutro');
    const json = marks(r.value);
    assert.ok(json.includes('"bulletList"') && json.indexOf('Intro') < json.indexOf('bulletList'));
  });
  it('applying the same list again removes it (toggle)', () => {
    const once = toggleList('a\nb', 0, 3, 'bullet');
    const twice = toggleList(once.value, once.selectionStart, once.selectionEnd, 'bullet');
    assert.equal(twice.value, 'a\nb');
  });
  it('switching bullets to numbers renumbers', () => {
    assert.equal(toggleList('- a\n- b', 0, 7, 'numbered').value, '1. a\n2. b');
  });
  it('everything the toolbar can produce survives open -> save', () => {
    let v = 'Intro words here';
    v = wrapSelection(v, 0, 5, '**').value;
    const end = v.length;
    v = linkSelection(v, end - 4, end).value.replace('https://', 'https://example.org');
    v += '\n\nfirst\nsecond';
    v = toggleList(v, v.length - 12, v.length, 'numbered').value;
    assert.equal(richTextToEditorText(editorTextToRichText(v)), v);
  });
});
