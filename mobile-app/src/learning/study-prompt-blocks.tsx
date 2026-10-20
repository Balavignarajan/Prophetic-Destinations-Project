import { View } from 'react-native';

import { AppText } from '@/components/ui';
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
    <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
      <AppText variant="label" color="warning">
        {what} is incomplete
      </AppText>
      <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
        Part of this block could not be read, so none of it is shown rather than a shortened version. The rest of the lesson is not affected.
      </AppText>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const { spacing, colors, radius } = useTheme();
  return <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderGold, backgroundColor: colors.surface }}>{children}</View>;
}

export function StudyActivityBlock({ content }: { content: Record<string, unknown> }) {
  const type = typeof content.activityType === 'string' ? LABELS[content.activityType] : undefined;
  const scriptureOk = content.scripture === undefined || Array.isArray(content.scripture);
  if (!type || !isText(content.instruction) || !scriptureOk) return <Incomplete what="Study activity" />;

  return (
    <Card>
      <AppText variant="label" color="primaryHighlight" accessibilityRole="header">
        Study activity: {type}
      </AppText>
      <AppText variant="body">{content.instruction}</AppText>
      <ScriptureLinks entries={content.scripture} />
    </Card>
  );
}

export function GuidedQuestionBlock({ content }: { content: Record<string, unknown> }) {
  const passages = Array.isArray(content.scripture) ? content.scripture : null;
  if (!isText(content.question) || !passages || passages.length === 0 || !isText(content.explanation)) return <Incomplete what="Guided question" />;

  return (
    <Card>
      <AppText variant="label" color="primaryHighlight">
        Guided question
      </AppText>
      <AppText variant="heading" accessibilityRole="header">
        {content.question}
      </AppText>
      <ScriptureLinks entries={passages} />
      <View style={{ gap: 2 }}>
        <AppText variant="caption" color="textMuted">
          Explanation
        </AppText>
        <AppText variant="body">{content.explanation}</AppText>
      </View>
    </Card>
  );
}
