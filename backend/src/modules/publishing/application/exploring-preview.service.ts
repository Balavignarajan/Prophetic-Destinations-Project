import { Injectable } from '@nestjs/common';
import { BusinessRuleError, type LearningLevel, NotFoundError } from '../../../shared-kernel/index.js';
import { LessonsFacade } from '../../lessons/index.js';
import { PublishedCatalogService, type RelatedLessonView } from './published-catalog.service.js';

export interface ExploringPreview {
  level: LearningLevel;
  /** Always true: this is the WORKING selection of the block as saved, not what is published. */
  workingCopy: true;
  /** The lesson is offered at this level (a lesson not offered at a level has no learners there). */
  lessonAvailableAtLevel: boolean;
  /** The block itself is set visible at this level (ordinary block level visibility). */
  blockVisibleAtLevel: boolean;
  /** How many links the author has saved in the block. */
  authoredLinks: number;
  /** What a learner at this level would be offered once the lesson is published: titles and covers come from each target's published snapshot only. */
  cards: RelatedLessonView[];
  /** Author-only diagnostics for links that would not be shown: the lesson id, the author's own label and the reason. No target metadata. */
  omitted: { lessonId: string; label: string | null; reason: string }[];
}

/**
 * The admin "working preview" of a Continue Exploring block. It resolves the block's SAVED working selection (not the source lesson's published one, and
 * the source lesson need not be published) for one level with the same eligibility rules as learner delivery, and returns the learner cards separately from
 * the author diagnostics. It never publishes, changes or stores anything, and the public delivery endpoints are untouched.
 */
@Injectable()
export class ExploringPreviewService {
  constructor(
    private readonly lessons: LessonsFacade,
    private readonly catalog: PublishedCatalogService,
  ) {}

  async preview(lessonId: string, blockId: string, level: LearningLevel): Promise<ExploringPreview> {
    const block = await this.lessons.findBlockForPreview(lessonId, blockId);
    if (!block) throw new NotFoundError('Block not found');
    if (block.type !== 'CONTINUE_EXPLORING') throw new BusinessRuleError('This block is not a Continue exploring block', { code: 'NOT_CONTINUE_EXPLORING' });
    const raw = block.content?.links;
    const ids = (Array.isArray(raw) ? raw : []).flatMap((l) => (typeof l === 'object' && l !== null && typeof (l as { lessonId?: unknown }).lessonId === 'string' ? [((l as { lessonId: string }).lessonId).toLowerCase()] : []));
    const found = await block.existing(ids);
    const missing = new Set(ids.filter((id) => !found.has(id)));
    const { cards, omitted } = await this.catalog.previewWorkingLinks(raw, lessonId, level, missing);
    return {
      level,
      workingCopy: true,
      lessonAvailableAtLevel: block.lessonLevels.includes(level),
      blockVisibleAtLevel: block.blockLevels.includes(level),
      authoredLinks: ids.length,
      cards,
      omitted,
    };
  }
}
