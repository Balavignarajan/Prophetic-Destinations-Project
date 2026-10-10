import { BusinessRuleError } from '../../../../shared-kernel/index.js';
import { BLOCK_TYPES, isBlockType } from './block-types.js';
import { checkBlockContent } from './block-content.js';
import { BlockTypeRegistry } from './registry.js';

describe('block types', () => {
  it('are exactly the 19 types defined by the guide', () => {
    expect([...BLOCK_TYPES]).toEqual([
      'RICH_TEXT',
      'SECTION_INTRO',
      'CALLOUT',
      'SCRIPTURE_PASSAGE',
      'SCRIPTURE_CONNECTION',
      'IMAGE',
      'INTERACTIVE_IMAGE',
      'SYMBOL_STUDY',
      'WORD_STUDY',
      'MAP',
      'TIMELINE',
      'PROPHECY_EQUIVALENCE',
      'PROPHECY_CALCULATION',
      'PROPHECY_COMPARISON',
      'NARRATIVE_SCENE',
      'EXPLORE_DEEPER',
      'REFLECTION_STUDY_ACTIVITY',
      'SUMMARY',
      'QUIZ',
    ]);
  });

  it('recognises only those identifiers, exactly', () => {
    expect(isBlockType('RICH_TEXT')).toBe(true);
    expect(isBlockType('rich_text')).toBe(false);
    expect(isBlockType('HTML')).toBe(false);
    expect(isBlockType(undefined)).toBe(false);
  });
});

describe('BlockTypeRegistry', () => {
  const registry = new BlockTypeRegistry();

  it('has RICH_TEXT and nothing else', () => {
    expect(registry.implementedTypes()).toEqual(['RICH_TEXT']);
    for (const type of BLOCK_TYPES.filter((t) => t !== 'RICH_TEXT')) {
      expect(registry.get(type)).toBeUndefined();
    }
  });

  it('describes RICH_TEXT with every capability the registry promises', () => {
    const definition = registry.require('RICH_TEXT');
    expect(definition.type).toBe('RICH_TEXT');
    expect(typeof definition.validateShape).toBe('function');
    expect(typeof definition.validateComplete).toBe('function');
    expect(
      definition.extractReferences({ body: { type: 'doc', content: [] } }),
    ).toEqual([]);
  });

  it('does not assume RICH_TEXT supports variants: it is unconfirmed', () => {
    expect(registry.require('RICH_TEXT').variants).toBe('UNCONFIRMED');
  });

  it('refuses a type that is defined by the guide but not implemented yet', () => {
    try {
      registry.require('QUIZ');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).details).toEqual({
        type: 'QUIZ',
        available: ['RICH_TEXT'],
      });
    }
  });
});

describe('checkBlockContent', () => {
  const definition = new BlockTypeRegistry().require('RICH_TEXT');

  it('accepts "no content yet"', () => {
    expect(checkBlockContent(definition, null)).toBeNull();
    expect(checkBlockContent(definition, undefined)).toBeNull();
  });

  it('returns valid content unchanged', () => {
    const content = { body: { type: 'doc', content: [] } };
    expect(checkBlockContent(definition, content)).toBe(content);
  });

  it('rejects invalid content with the list of problems', () => {
    try {
      checkBlockContent(definition, {
        body: { type: 'doc', content: [{ type: 'script' }] },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      const { problems } = (error as BusinessRuleError).details as {
        problems: { path: string }[];
      };
      expect(problems[0].path).toBe('body.content[0].type');
    }
  });
});
