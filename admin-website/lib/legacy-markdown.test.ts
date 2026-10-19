// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { editorTextToRichText } from './rich-text.ts';
import { hasLegacyMarkers, legacyMarkdownToRichText } from './legacy-markdown.ts';
import { richTextToView } from './rich-text-view.ts';

const plain = (...paragraphs: string[]) => ({
  body: { type: 'doc', content: paragraphs.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) },
});

describe('legacy plain-text content that holds Markdown-style markers', () => {
  it('is displayed exactly as stored (never reinterpreted silently)', () => {
    const [block] = richTextToView(plain('Read **Daniel 2** now'));
    assert.equal(block.kind === 'paragraph' && block.inlines[0].text, 'Read **Daniel 2** now');
  });
  it('can be converted on request: bold, italic, link, bullets, numbers', () => {
    const legacy = plain('Read **Daniel 2**, *carefully*, at [this page](https://example.com).', '- first\n- second', '1. one\n2. two');
    assert.equal(hasLegacyMarkers(legacy), true);
    const converted = legacyMarkdownToRichText(legacy);
    assert.ok(converted);
    const json = JSON.stringify(converted);
    for (const needle of ['"bold"', '"italic"', '"link"', '"bulletList"', '"orderedList"']) assert.ok(json.includes(needle), needle);
    assert.ok(!json.includes('**') && !json.includes(']('));
  });
  it('converting equals what typing the same text in the editor produces', () => {
    assert.deepEqual(legacyMarkdownToRichText(plain('a **b**', 'c')), editorTextToRichText('a **b**\n\nc'));
  });
  it('ordinary text with no markers is left alone', () => {
    assert.equal(hasLegacyMarkers(plain('Just words.', 'And more words.')), false);
    assert.equal(legacyMarkdownToRichText(plain('Just words.')), null);
  });
  it('already-structured content is never offered a conversion', () => {
    const structured = { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }] } };
    assert.equal(hasLegacyMarkers(structured), false);
    assert.equal(legacyMarkdownToRichText(structured), null);
    const withList = {
      body: { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '**x**' }] }] }] }] },
    };
    assert.equal(hasLegacyMarkers(withList), false);
  });
  it('malformed input is ignored', () => {
    assert.equal(legacyMarkdownToRichText(null), null);
    assert.equal(legacyMarkdownToRichText({}), null);
  });
});
