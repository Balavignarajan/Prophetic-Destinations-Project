import { useResource } from '@/api/use-resource';
import { loadExploring } from '@/features/offline/offline-api';
import type { LearningLevel } from '@/learning/levels';
import { RelatedLessonCards } from '@/learning/related-lessons';

/**
 * Renders a published CONTINUE_EXPLORING block (backend/src/modules/lessons/domain/blocks/continue-exploring.ts; PROPOSED schema):
 *   { title?, links: [{ id, lessonId, label?, levels? }] }
 * The block in the lesson snapshot holds only the AUTHOR's selection; what a learner may actually see is asked of the server per block
 * (GET /lessons/:lessonId/explore/:blockId), which applies the link's level rule and the target's published/catalog eligibility and returns titles and
 * covers from published content only. This list is separate from the lesson's "Related lessons" (metadata links): different data, different endpoint,
 * different saved copy. Nothing is shown while loading, when the list cannot be loaded, or when no target can be opened (no empty heading, and a hidden
 * target is never hinted at). The list is bound to the exact publication (\`contentHash\`) of the lesson on screen, like the related list. Opening a card
 * PUSHES that lesson on top, so Back returns to this lesson with its position and progress intact. Nothing is downloaded for the targets: the note below the
 * cards separates "this list was saved" from "this lesson is saved". Nothing is recommended automatically. If the block's own content is malformed, an
 * "incomplete" note replaces it and the rest of the lesson is unaffected.
 */
export function ContinueExploringBlock({
  lessonId,
  blockId,
  level,
  contentHash,
  content,
}: {
  lessonId: string;
  blockId: string;
  level: LearningLevel;
  contentHash: string;
  content: Record<string, unknown>;
}) {
  const [explore] = useResource(`lesson-explore:${lessonId}:${blockId}:${level}`, (signal) => loadExploring(lessonId, blockId, level, signal));
  if (!Array.isArray(content.links)) return null;
  if (explore.status !== 'success') return null;
  // A list fetched for another publication of this lesson, or for another block, is never shown.
  if (explore.data.value.contentHash !== contentHash || explore.data.value.blockId !== blockId) return null;
  const title = typeof content.title === 'string' && content.title.trim() ? content.title.trim() : 'Continue exploring';
  return (
    <RelatedLessonCards
      lessons={explore.data.value.lessons}
      level={level}
      heading={title}
      listNote={explore.data.source === 'cache' ? 'This list was saved on this device. Each lesson in it opens offline only if that lesson is saved too.' : undefined}
    />
  );
}
