import { View } from 'react-native';

import { AppText, BlockFrame, BlockNotice } from '@/components/ui';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

/**
 * Renders published REFLECTION_STUDY_ACTIVITY and GUIDED_DISCOVERY_QUESTION blocks (backend/src/modules/lessons/domain/blocks/reflection-discovery.ts;
 * PROPOSED schemas):
 *   REFLECTION_STUDY_ACTIVITY: { activityType: REFLECT|COMPARE|FIND|STUDY|READ|PERSONAL_APPLICATION, instruction, scripture?: FROZEN passages }
 *   GUIDED_DISCOVERY_QUESTION: { question, scripture: FROZEN passages, explanation }
 * Both are the AUTHOR's prompt, read in normal flow. NOTHING is collected or stored: no text entry, no answers, no journal, no scoring, no completion
 * state and no local interaction state, so there is nothing to scope or reset. The guided question shows its passage and the author's explanation
 * directly (never behind a tap, LESS-007); "optional response interaction" is undecided (D13) and is not implemented. The activity type is a TEXT label,
 * never colour alone. Scripture is the frozen passage(s) of the snapshot (ScriptureLinks), apart from the author's text; a malformed passage shows its
 * own "not available" card. If essential text is missing, or the passage list is not a list, the block shows "incomplete" instead of a shortened
 * version, and the rest of the lesson is unaffected. Long text and large fonts wrap.
 */
const LABELS: Record<string, string> = {
  REFLECT: 'Reflect',
  COMPARE: 'Compare',
  FIND: 'Find',
  STUDY: 'Study',
  READ: 'Read',
  PERSONAL_APPLICATION: 'Personal application',
};
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function Incomplete({ what }: { what: string }) {
  const { spacing, colors, radius } = useTheme();
  return (
    <BlockNotice title={`${what} is incomplete`} message="Part of this block could not be read, so none of it is shown rather than a shortened version. The rest of the lesson is not affected." />
  );
}

export function StudyActivityBlock({ content }: { content: Record<string, unknown> }) {
  const type = typeof content.activityType === 'string' ? LABELS[content.activityType] : undefined;
  const scriptureOk = content.scripture === undefined || Array.isArray(content.scripture);
  if (!type || !isText(content.instruction) || !scriptureOk) return <Incomplete what="Study activity" />;

  return (
    <BlockFrame variant="callout" style={{ gap: 12 }}>
      <AppText variant="bodySmall" color="primaryHighlight" accessibilityRole="header" style={{ fontWeight: '700' }}>
        Study activity: {type}
      </AppText>
      <AppText variant="body" style={{ fontSize: 17, lineHeight: 27 }}>
        {content.instruction}
      </AppText>
      <ScriptureLinks entries={content.scripture} />
    </BlockFrame>
  );
}

export function GuidedQuestionBlock({ content }: { content: Record<string, unknown> }) {
  const passages = Array.isArray(content.scripture) ? content.scripture : null;
  if (!isText(content.question) || !passages || passages.length === 0 || !isText(content.explanation)) return <Incomplete what="Guided question" />;

  return (
    <BlockFrame variant="interactive">
      <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
        Guided question
      </AppText>
      <AppText variant="sectionHeading" accessibilityRole="header">
        {content.question}
      </AppText>
      <ScriptureLinks entries={passages} presentation="inline" />
      <View style={{ gap: 2 }}>
        <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
          Explanation
        </AppText>
        <AppText variant="body" style={{ fontSize: 17, lineHeight: 27 }}>
          {content.explanation}
        </AppText>
      </View>
    </BlockFrame>
  );
}
