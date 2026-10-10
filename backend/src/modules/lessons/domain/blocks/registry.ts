import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../../shared-kernel/index.js';
import { type BlockType } from './block-types.js';
import {
  type ContentProblem,
  validateRichTextComplete,
  validateRichTextShape,
} from './rich-text.js';

/**
 * Whether a block type may have per-level variant content.
 * UNCONFIRMED means the guide's content contract for the type has not settled it,
 * so it must be treated as "no variants" until it does.
 */
export type VariantSupport = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNCONFIRMED';

/** An id embedded in block content that points at another module's data (media, quiz). */
export interface BlockReference {
  kind: 'MEDIA' | 'QUIZ';
  targetId: string;
}

/** Everything the application needs to know about one block type. */
export interface BlockTypeDefinition {
  type: BlockType;
  variants: VariantSupport;
  /** Structural validation, on every save. Drafts may be incomplete. */
  validateShape(content: unknown): ContentProblem[];
  /** Completeness, when the lesson is checked for publishing. Assumes valid shape. */
  validateComplete(content: unknown): ContentProblem[];
  /** Ids in the content that reference media or quizzes (for integrity links). */
  extractReferences(content: unknown): BlockReference[];
}

const RICH_TEXT: BlockTypeDefinition = {
  type: 'RICH_TEXT',
  // The guide's content contract for RICH_TEXT does not confirm variants yet.
  variants: 'UNCONFIRMED',
  validateShape: validateRichTextShape,
  validateComplete: validateRichTextComplete,
  extractReferences: () => [], // links are external URLs, not references to our data
};

/**
 * The application-level source of truth for block behaviour. A type becomes
 * usable by being registered here, one concrete type per slice, each only after
 * its content contract has been specified from the guide.
 */
@Injectable()
export class BlockTypeRegistry {
  private readonly definitions = new Map<BlockType, BlockTypeDefinition>([
    [RICH_TEXT.type, RICH_TEXT],
  ]);

  get(type: BlockType): BlockTypeDefinition | undefined {
    return this.definitions.get(type);
  }

  implementedTypes(): BlockType[] {
    return [...this.definitions.keys()];
  }

  /** The definition of a type that can be used, or a business-rule error saying it cannot yet. */
  require(type: BlockType): BlockTypeDefinition {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new BusinessRuleError(`Block type ${type} is not available yet`, {
        type,
        available: this.implementedTypes(),
      });
    }
    return definition;
  }
}
