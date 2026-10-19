// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BLOCK_VARIANT_SUPPORT, supportsLevelVariants } from './block-capabilities.ts';

describe('level variants follow the backend registry', () => {
  it('RICH_TEXT variants are not offered (backend: UNCONFIRMED is treated as no)', () => {
    assert.equal(BLOCK_VARIANT_SUPPORT.RICH_TEXT, 'UNCONFIRMED');
    assert.equal(supportsLevelVariants('RICH_TEXT'), false);
  });
  it('unknown or not-yet-registered block types are not offered variants', () => {
    for (const type of ['TIMELINE', 'IMAGE', '', 'rich_text']) assert.equal(supportsLevelVariants(type), false, type);
  });
});
