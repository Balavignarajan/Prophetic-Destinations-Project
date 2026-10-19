// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DOCUMENTS, DOCUMENT_TITLES, type AppDocument, parseHttpUrl, resolveDocument } from './documents.ts';
import { DEFAULT_SHARE_MESSAGE, buildShareText } from '../config/share-text.ts';

describe('About, Privacy and Terms', () => {
  it('no unapproved legal or privacy text ships in the app', () => {
    assert.deepEqual(DOCUMENTS, { about: null, privacy: null, terms: null });
  });
  it('each document has a title for its screen', () => {
    assert.equal(DOCUMENT_TITLES.privacy, 'Privacy Policy');
    assert.equal(DOCUMENT_TITLES.terms, 'Terms');
    assert.equal(DOCUMENT_TITLES.about, 'About Prophetic Destinations');
  });
  it('with nothing bundled and nothing configured the screen must say it is not available', () => {
    const r = resolveDocument('privacy', {});
    assert.equal(r.missing, true);
    assert.equal(r.content, null);
    assert.equal(r.onlineUrl, null);
  });
  it('a configured http(s) address becomes a "Read online" fallback', () => {
    const r = resolveDocument('terms', { terms: ' https://example.org/terms ' });
    assert.equal(r.onlineUrl, 'https://example.org/terms');
    assert.equal(r.missing, false);
  });
  it('rejects addresses that are not http(s)', () => {
    for (const bad of ['javascript:alert(1)', 'file:///x', 'ftp://x.example', 'not a url', '', '   ', undefined]) assert.equal(parseHttpUrl(bad), null, String(bad));
    assert.equal(parseHttpUrl('http://a.example'), 'http://a.example');
  });
  it('approved bundled text is used when provided', () => {
    const approved: AppDocument = { title: 'x', sections: [{ heading: 'H', paragraphs: ['P'] }] };
    const r = resolveDocument('about', {}, { about: approved, privacy: null, terms: null });
    assert.equal(r.content, approved);
    assert.equal(r.missing, false);
  });
});

describe('Invite a Friend text', () => {
  it('shares the message alone when no link is configured (no link is invented)', () => {
    assert.equal(buildShareText('Hello there  ', null), 'Hello there');
  });
  it('puts the configured link on its own line', () => {
    assert.equal(buildShareText('Hello', 'https://example.org/app'), 'Hello\nhttps://example.org/app');
  });
  it('has a neutral default message', () => {
    assert.ok(DEFAULT_SHARE_MESSAGE.length > 0 && !/https?:\/\//.test(DEFAULT_SHARE_MESSAGE));
  });
});
