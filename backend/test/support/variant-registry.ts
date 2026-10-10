import { BlockTypeRegistry } from '../../src/modules/lessons/domain/blocks/registry.js';

/**
 * The real registry, except that every implemented type is marked as supporting
 * level variants. RICH_TEXT's real content contract has not confirmed variants, so
 * the real application rejects them; this lets the generic variant machinery be
 * tested end to end. Only ever used to override the provider in tests.
 */
export class VariantEnabledRegistry extends BlockTypeRegistry {
  override get(type: Parameters<BlockTypeRegistry['get']>[0]) {
    const definition = super.get(type);
    return definition && { ...definition, variants: 'SUPPORTED' as const };
  }

  override require(type: Parameters<BlockTypeRegistry['require']>[0]) {
    return { ...super.require(type), variants: 'SUPPORTED' as const };
  }
}
