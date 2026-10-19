// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { apiHostLabel, unreachableHint } from './api-host.ts';

describe('naming the server the app is trying to reach', () => {
  it('extracts host and port from the configured base URL', () => {
    assert.equal(apiHostLabel('http://192.168.43.241:3001/api/v1'), '192.168.43.241:3001');
    assert.equal(apiHostLabel('https://api.example.org/api/v1'), 'api.example.org');
  });
  it('is null when there is no usable URL', () => {
    for (const bad of [null, undefined, '', 'not a url']) assert.equal(apiHostLabel(bad), null);
  });
  it('gives a development hint that names the address and the fix', () => {
    const hint = unreachableHint('http://192.168.43.241:3001/api/v1', true);
    assert.ok(hint?.includes('192.168.43.241:3001'));
    assert.ok(hint?.includes('EXPO_PUBLIC_API_URL'));
  });
  it('never shows the hint in a release build or without an address', () => {
    assert.equal(unreachableHint('http://192.168.43.241:3001/api/v1', false), null);
    assert.equal(unreachableHint(null, true), null);
  });
});
