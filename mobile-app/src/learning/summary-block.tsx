import { View } from 'react-native';

import { AppText, BlockFrame } from '@/components/ui';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

/**
 * Renders a published SUMMARY block (backend/src/modules/lessons/domain/blocks/summary.ts; PROPOSED schema):
 *   { heading?, takeaways: string[] (the KEY IDEAS), keyScripture?: frozen passages, prophecyTakeaways?: string[], applicationTakeaways?: string[] }
 * Older summaries are just { heading?, takeaways } and show exactly as before, under the label "Key ideas". Each section has its own label; a
 * section with nothing valid in it is left out, and the sections that do have content are always shown. Lists are numbered in the published order.
 * Key Scripture is the FROZEN passages of the snapshot (shown through ScriptureLinks, from the lesson itself, offline). A malformed passage shows
 * the "not available" card for that passage only. Text is shown strictly as text and wraps (long text and large system fonts are expected);
 * entries that are not text are ignored. Nothing is added to the content: without a heading the title is the plain word "Summary".
 */
const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="bodySmall" color="primaryHighlight" accessibilityRole="header" style={{ fontWeight: '700' }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

function NumberedList({ items }: { items: string[] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppText variant="body" color="primaryHighlight" style={{ minWidth: 26, fontWeight: '700' }} accessibilityElementsHidden importantForAccessibility="no">
            {index + 1}.
          </AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="body" style={{ fontSize: 17, lineHeight: 27 }}>{item}</AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

export function SummaryContent({ content }: { content: Record<string, unknown> }) {
  const { spacing } = useTheme();
  const heading = typeof content.heading === 'string' ? content.heading.trim() : '';
  const keyIdeas = textList(content.takeaways);
  const keyScripture = Array.isArray(content.keyScripture) ? content.keyScripture : [];
  const prophecy = textList(content.prophecyTakeaways);
  const application = textList(content.applicationTakeaways);
  if (keyIdeas.length + keyScripture.length + prophecy.length + application.length === 0) return null;

  return (
    <BlockFrame variant="evidence" accessible={false} style={{ gap: spacing.xl }}>
      <AppText variant="sectionHeading" accessibilityRole="header">
        {heading || 'Summary'}
      </AppText>
      {keyIdeas.length > 0 ? (
        <Section label="Key ideas">
          <NumberedList items={keyIdeas} />
        </Section>
      ) : null}
      {keyScripture.length > 0 ? (
        <Section label="Key Scripture">
          <ScriptureLinks entries={keyScripture} />
        </Section>
      ) : null}
      {prophecy.length > 0 ? (
        <Section label="Prophecy takeaways">
          <NumberedList items={prophecy} />
        </Section>
      ) : null}
      {application.length > 0 ? (
        <Section label="Application takeaways">
          <NumberedList items={application} />
        </Section>
      ) : null}
    </BlockFrame>
  );
}
