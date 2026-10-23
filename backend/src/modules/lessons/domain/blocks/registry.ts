import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../../shared-kernel/index.js';
import { type BlockType } from './block-types.js';
import {
  imageMediaId,
  validateImageComplete,
  validateImageShape,
} from './image.js';
import {
  type ContentProblem,
  validateRichTextComplete,
  validateRichTextShape,
} from './rich-text.js';
import { interactiveImageMediaId, validateInteractiveImageComplete, validateInteractiveImageShape } from './interactive-image.js';
import {
  sectionIntroMediaId,
  validateCalloutComplete,
  validateCalloutShape,
  validateSectionIntroComplete,
  validateSectionIntroShape,
} from './section-callout.js';
import { evidenceMediaId, validateHistoricalEvidenceComplete, validateHistoricalEvidenceShape } from './historical-evidence.js';
import {
  type NestedLookup,
  exploreDeeperReferences,
  mapMediaId,
  validateExploreDeeperComplete,
  validateExploreDeeperShape,
  validateMapComplete,
  validateMapShape,
} from './map-explore.js';
import { symbolStudyMediaId, validateSymbolStudyComplete, validateSymbolStudyShape, validateWordStudyComplete, validateWordStudyShape } from './word-symbol.js';
import { validateCalculationComplete, validateCalculationShape, validateComparisonComplete, validateComparisonShape, validateEquivalenceComplete, validateEquivalenceShape } from './prophecy.js';
import { validateDiscoveryComplete, validateDiscoveryShape, validateReflectionComplete, validateReflectionShape } from './reflection-discovery.js';
import { validateContinueExploringComplete, validateContinueExploringShape } from './continue-exploring.js';
import { animationMedia, sceneMediaId, validateAnimationComplete, validateAnimationShape, validateSceneComplete, validateSceneShape } from './scene-media.js';
import { validateScriptureConnectionComplete, validateScriptureConnectionShape } from './scripture-connection.js';
import { validateScripturePassageComplete, validateScripturePassageShape } from './scripture-passage.js';
import { timelineMediaIds, validateTimelineComplete, validateTimelineShape } from './timeline.js';
import { quizIdOf, validateQuizComplete, validateQuizShape } from './quiz.js';
import { validateSummaryComplete, validateSummaryShape } from './summary.js';

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
  /** MEDIA only: the asset must be an animated WebP (checked from its bytes when the block is saved). */
  animated?: boolean;
  /** MEDIA only: the asset must be a stored MP4 video or Lottie JSON file (the type detected from its bytes at upload). Absent = an image. */
  mediaKind?: 'video' | 'lottie';
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

const IMAGE: BlockTypeDefinition = {
  type: 'IMAGE',
  // The guide says "selected components may have level variants" without naming IMAGE: treated as no variants until confirmed.
  variants: 'UNCONFIRMED',
  validateShape: validateImageShape,
  validateComplete: validateImageComplete,
  extractReferences: (content) => {
    const mediaId = imageMediaId(content);
    return mediaId ? [{ kind: 'MEDIA', targetId: mediaId }] : [];
  },
};

const INTERACTIVE_IMAGE: BlockTypeDefinition = {
  type: 'INTERACTIVE_IMAGE',
  // Per-hotspot and per-level behaviour is undecided (D4), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateInteractiveImageShape,
  validateComplete: validateInteractiveImageComplete,
  extractReferences: (content) => {
    const mediaId = interactiveImageMediaId(content);
    return mediaId ? [{ kind: 'MEDIA', targetId: mediaId }] : [];
  },
};

const TIMELINE: BlockTypeDefinition = {
  type: 'TIMELINE',
  // Per-event level behaviour is undecided (D4), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateTimelineShape,
  validateComplete: validateTimelineComplete,
  extractReferences: (content) => timelineMediaIds(content).map((targetId) => ({ kind: 'MEDIA' as const, targetId })),
};

const SCRIPTURE_PASSAGE: BlockTypeDefinition = {
  type: 'SCRIPTURE_PASSAGE',
  // Level-specific passages are undecided, so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateScripturePassageShape,
  validateComplete: validateScripturePassageComplete,
  extractReferences: () => [], // the passage is verified against the Scripture data set by the application, not a media or quiz reference
};

const HISTORICAL_EVIDENCE: BlockTypeDefinition = {
  type: 'HISTORICAL_EVIDENCE',
  // "Depth can vary by level" (D3) is undecided, so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateHistoricalEvidenceShape,
  validateComplete: validateHistoricalEvidenceComplete,
  extractReferences: (content) => {
    const mediaId = evidenceMediaId(content);
    return mediaId ? [{ kind: 'MEDIA' as const, targetId: mediaId }] : [];
  },
};

const SECTION_INTRO: BlockTypeDefinition = {
  type: 'SECTION_INTRO',
  // The workbook says "selected blocks may support variants" without naming this one (D3), so none.
  variants: 'UNCONFIRMED',
  validateShape: validateSectionIntroShape,
  validateComplete: validateSectionIntroComplete,
  extractReferences: (content) => {
    const mediaId = sectionIntroMediaId(content);
    return mediaId ? [{ kind: 'MEDIA' as const, targetId: mediaId }] : [];
  },
};

const CALLOUT: BlockTypeDefinition = {
  type: 'CALLOUT',
  variants: 'UNCONFIRMED',
  validateShape: validateCalloutShape,
  validateComplete: validateCalloutComplete,
  extractReferences: () => [], // plain author text only: no media, no Scripture reference
};

const SCRIPTURE_CONNECTION: BlockTypeDefinition = {
  type: 'SCRIPTURE_CONNECTION',
  // How a connection would differ by level is undecided, so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateScriptureConnectionShape,
  validateComplete: validateScriptureConnectionComplete,
  extractReferences: () => [], // Scripture references are verified against the data set by the application, not media or quiz references
};

const MAP: BlockTypeDefinition = {
  type: 'MAP',
  // Per-marker and per-level behaviour is undecided (D4, D10), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateMapShape,
  validateComplete: validateMapComplete,
  extractReferences: (content) => {
    const mediaId = mapMediaId(content);
    return mediaId ? [{ kind: 'MEDIA' as const, targetId: mediaId }] : [];
  },
};

/**
 * The block types an Explore Deeper section may hold, with the SAME definitions the lesson uses for them (so a nested block is validated, completed and
 * checked for media exactly like a top-level one). Anything else is refused by the Explore Deeper rules themselves (EXPLORE_DEEPER_NESTED_TYPES).
 * Looked up when called, so the order of the definitions in this file does not matter.
 */
const nestedRules: NestedLookup = (type) => {
  switch (type) {
    case 'RICH_TEXT':
      return RICH_TEXT;
    case 'CALLOUT':
      return CALLOUT;
    case 'SCRIPTURE_PASSAGE':
      return SCRIPTURE_PASSAGE;
    case 'SCRIPTURE_CONNECTION':
      return SCRIPTURE_CONNECTION;
    case 'IMAGE':
      return IMAGE;
    case 'WORD_STUDY':
      return WORD_STUDY;
    case 'SYMBOL_STUDY':
      return SYMBOL_STUDY;
    case 'HISTORICAL_EVIDENCE':
      return HISTORICAL_EVIDENCE;
    default:
      return undefined;
  }
};

const EXPLORE_DEEPER: BlockTypeDefinition = {
  type: 'EXPLORE_DEEPER',
  // Which levels see it is the block's ordinary visibility, and nested blocks appear with it (D11, D3 stay open for anything finer), so no variants.
  variants: 'UNCONFIRMED',
  validateShape: (content) => validateExploreDeeperShape(content, nestedRules),
  validateComplete: (content) => validateExploreDeeperComplete(content, nestedRules),
  // Title, text and Scripture references have none; the images of nested blocks are media references like any other.
  extractReferences: (content) => exploreDeeperReferences(content, nestedRules),
};

const WORD_STUDY: BlockTypeDefinition = {
  type: 'WORD_STUDY',
  // Level-specific word studies are undecided (D3), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateWordStudyShape,
  validateComplete: validateWordStudyComplete,
  extractReferences: () => [], // author text and Scripture references only: no media, no quiz
};

const SYMBOL_STUDY: BlockTypeDefinition = {
  type: 'SYMBOL_STUDY',
  variants: 'UNCONFIRMED',
  validateShape: validateSymbolStudyShape,
  validateComplete: validateSymbolStudyComplete,
  extractReferences: (content) => {
    const mediaId = symbolStudyMediaId(content);
    return mediaId ? [{ kind: 'MEDIA' as const, targetId: mediaId }] : [];
  },
};

const PROPHECY_EQUIVALENCE: BlockTypeDefinition = {
  type: 'PROPHECY_EQUIVALENCE',
  // Level-specific equivalences are undecided (D3, D13), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateEquivalenceShape,
  validateComplete: validateEquivalenceComplete,
  extractReferences: () => [], // author text and Scripture references only: no media, no quiz
};

const PROPHECY_COMPARISON: BlockTypeDefinition = {
  type: 'PROPHECY_COMPARISON',
  variants: 'UNCONFIRMED',
  validateShape: validateComparisonShape,
  validateComplete: validateComparisonComplete,
  extractReferences: () => [],
};

const PROPHECY_CALCULATION: BlockTypeDefinition = {
  type: 'PROPHECY_CALCULATION',
  // Presentation only: author-written steps, never evaluated. No variants.
  variants: 'UNCONFIRMED',
  validateShape: validateCalculationShape,
  validateComplete: validateCalculationComplete,
  extractReferences: () => [],
};

const REFLECTION_STUDY_ACTIVITY: BlockTypeDefinition = {
  type: 'REFLECTION_STUDY_ACTIVITY',
  // Level-specific activities are undecided (D3), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateReflectionShape,
  validateComplete: validateReflectionComplete,
  extractReferences: () => [], // author text and Scripture references only: no media, no quiz
};

const GUIDED_DISCOVERY_QUESTION: BlockTypeDefinition = {
  type: 'GUIDED_DISCOVERY_QUESTION',
  variants: 'UNCONFIRMED',
  validateShape: validateDiscoveryShape,
  validateComplete: validateDiscoveryComplete,
  extractReferences: () => [],
};

const CONTINUE_EXPLORING: BlockTypeDefinition = {
  type: 'CONTINUE_EXPLORING',
  // Per-level link visibility is part of each link; the block itself has no level variants (D3).
  variants: 'UNCONFIRMED',
  validateShape: validateContinueExploringShape,
  validateComplete: validateContinueExploringComplete,
  extractReferences: () => [], // lesson links are resolved from published content at delivery time; not media or quiz references
};

const NARRATIVE_SCENE: BlockTypeDefinition = {
  type: 'NARRATIVE_SCENE',
  // Level-specific scenes and the predefined effect list are undecided (D3, D8), so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateSceneShape,
  validateComplete: validateSceneComplete,
  extractReferences: (content) => {
    const mediaId = sceneMediaId(content);
    return mediaId ? [{ kind: 'MEDIA' as const, targetId: mediaId }] : [];
  },
};

const MEDIA_ANIMATION: BlockTypeDefinition = {
  type: 'MEDIA_ANIMATION',
  variants: 'UNCONFIRMED',
  validateShape: validateAnimationShape,
  validateComplete: validateAnimationComplete,
  extractReferences: (content) => {
    const { mediaId, posterMediaId, mediaType } = animationMedia(content);
    // The kind of the main file decides what it must be: an MP4 video, a Lottie file, or (as before, also when the block names no kind) an animated WebP.
    const rule = mediaType === 'VIDEO' ? { mediaKind: 'video' as const } : mediaType === 'LOTTIE' ? { mediaKind: 'lottie' as const } : { animated: true };
    return [
      ...(mediaId ? [{ kind: 'MEDIA' as const, targetId: mediaId, ...rule }] : []),
      ...(posterMediaId ? [{ kind: 'MEDIA' as const, targetId: posterMediaId }] : []),
    ];
  },
};

const QUIZ: BlockTypeDefinition = {
  type: 'QUIZ',
  // How a quiz would differ by level is undecided, so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateQuizShape,
  validateComplete: validateQuizComplete,
  extractReferences: (content) => {
    const id = quizIdOf(content);
    return id ? [{ kind: 'QUIZ', targetId: id }] : [];
  },
};

const SUMMARY: BlockTypeDefinition = {
  type: 'SUMMARY',
  // How a summary may differ by level is undecided, so no variants (visibility per level still works).
  variants: 'UNCONFIRMED',
  validateShape: validateSummaryShape,
  validateComplete: validateSummaryComplete,
  extractReferences: () => [],
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
    [IMAGE.type, IMAGE],
    [SUMMARY.type, SUMMARY],
    [QUIZ.type, QUIZ],
    [INTERACTIVE_IMAGE.type, INTERACTIVE_IMAGE],
    [TIMELINE.type, TIMELINE],
    [SCRIPTURE_PASSAGE.type, SCRIPTURE_PASSAGE],
    [HISTORICAL_EVIDENCE.type, HISTORICAL_EVIDENCE],
    [SECTION_INTRO.type, SECTION_INTRO],
    [CALLOUT.type, CALLOUT],
    [SCRIPTURE_CONNECTION.type, SCRIPTURE_CONNECTION],
    [MAP.type, MAP],
    [EXPLORE_DEEPER.type, EXPLORE_DEEPER],
    [WORD_STUDY.type, WORD_STUDY],
    [SYMBOL_STUDY.type, SYMBOL_STUDY],
    [PROPHECY_EQUIVALENCE.type, PROPHECY_EQUIVALENCE],
    [PROPHECY_COMPARISON.type, PROPHECY_COMPARISON],
    [PROPHECY_CALCULATION.type, PROPHECY_CALCULATION],
    [REFLECTION_STUDY_ACTIVITY.type, REFLECTION_STUDY_ACTIVITY],
    [GUIDED_DISCOVERY_QUESTION.type, GUIDED_DISCOVERY_QUESTION],
    [CONTINUE_EXPLORING.type, CONTINUE_EXPLORING],
    [NARRATIVE_SCENE.type, NARRATIVE_SCENE],
    [MEDIA_ANIMATION.type, MEDIA_ANIMATION],
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
