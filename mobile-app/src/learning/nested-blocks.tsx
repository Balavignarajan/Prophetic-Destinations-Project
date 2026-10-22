import { View } from 'react-native';

import { BlockNotice } from '@/components/ui';
import { CalloutBlock } from '@/learning/callout-block';
import { EvidenceBlock } from '@/learning/evidence-block';
import { LessonImage } from '@/learning/lesson-image';
import type { LearningLevel } from '@/learning/levels';
import { RichTextContent } from '@/learning/rich-text';
import { ScriptureConnectionBlock } from '@/learning/scripture-connection-block';
import { ScripturePassage } from '@/learning/scripture-passage';
import { SymbolStudyBlock, WordStudyBlock } from '@/learning/word-symbol-blocks';
import { useTheme } from '@/theme';

/**
 * The blocks nested inside an EXPLORE_DEEPER block (backend map-explore.ts: `blocks: [{ id, type, content }]`, in the author's order). Each one is shown by the
 * SAME component the lesson uses for that block type, with the content exactly as the snapshot carries it, so a nested block looks and behaves like the block
 * in the lesson, offline included (the text, the frozen Scripture and the saved images all come with the lesson; nothing is fetched when the section opens).
 *
 * Only the types the backend allows inside a section are drawn: text, callouts, a Scripture passage or connection, an image, a word or symbol study and
 * historical evidence. A QUIZ or another EXPLORE_DEEPER cannot be nested, so neither is handled here; anything this version of the app cannot draw (a
 * newer type, a malformed entry) is counted and reported once, and the other blocks of the section are shown as usual. Nested blocks keep no progress,
 * level or completion state of their own.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function NestedBlock({ type, lessonId, level, content }: { type: string; lessonId: string; level: LearningLevel; content: Record<string, unknown> }) {
  switch (type) {
    case 'RICH_TEXT':
      return <RichTextContent content={content} />;
    case 'CALLOUT':
      return <CalloutBlock content={content} />;
    case 'SCRIPTURE_PASSAGE':
      // inside the section the passage needs no card of its own (the section is the card): the gold rule and the text
      return <ScripturePassage content={content} embedded />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionBlock content={content} />;
    case 'IMAGE':
      return <LessonImage lessonId={lessonId} level={level} content={content} />;
    case 'WORD_STUDY':
      return <WordStudyBlock content={content} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyBlock lessonId={lessonId} level={level} content={content} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlock lessonId={lessonId} level={level} content={content} />;
    default:
      return null;
  }
}

const DRAWN = new Set(['RICH_TEXT', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION', 'IMAGE', 'WORD_STUDY', 'SYMBOL_STUDY', 'HISTORICAL_EVIDENCE']);

export function NestedBlocks({ lessonId, level, blocks }: { lessonId: string; level: LearningLevel; blocks: unknown }) {
  const { spacing } = useTheme();
  const list = Array.isArray(blocks) ? blocks : [];
  const shown = list.filter((entry): entry is { id: string; type: string; content: Record<string, unknown> } => isRecord(entry) && typeof entry.id === 'string' && typeof entry.type === 'string' && DRAWN.has(entry.type) && isRecord(entry.content));
  const skipped = list.length - shown.length;
  if (list.length === 0) return null;

  return (
    <View style={{ gap: spacing.lg }}>
      {shown.map((entry) => (
        <NestedBlock key={entry.id} type={entry.type} lessonId={lessonId} level={level} content={entry.content} />
      ))}
      {skipped > 0 ? (
        <BlockNotice
          variant="unsupported"
          title={skipped === 1 ? 'One part of this section cannot be shown' : `${skipped} parts of this section cannot be shown`}
          message="This version of the app cannot show them yet. The rest of the section and the lesson are not affected."
        />
      ) : null}
    </View>
  );
}
