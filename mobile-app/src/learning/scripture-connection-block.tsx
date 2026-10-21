import { View } from 'react-native';

import { AppText, BlockNotice } from '@/components/ui';
import { ScriptureLinks } from '@/learning/scripture-links';
import { useTheme } from '@/theme';

/**
 * Renders a published SCRIPTURE_CONNECTION block (backend/src/modules/lessons/domain/blocks/scripture-connection.ts; PROPOSED schema):
 *   { title?, connections: [{ id, label?, scripture: FROZEN passages [{ reference, display, source, verses }], explanation }] }
 * The connections are shown in exactly the published order, numbered, each with its optional label, its passages as tappable references
 * (ScriptureLinks: the frozen text opens in the Scripture card, from the lesson itself, offline) and the author's explanation under its own
 * "Explanation" label, so Scripture and commentary are never confused. Nothing is suggested or inferred about how passages relate.
 * A malformed passage shows the "not available" card for that passage only; a connection without a readable explanation or passage still shows
 * what it has. If no connection has anything readable, only a short "not available" message is shown. Text wraps for long text and large fonts.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function ScriptureConnectionBlock({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors } = useTheme();
  const title = asText(content.title);
  const connections = (Array.isArray(content.connections) ? content.connections : [])
    .filter(isRecord)
    .map((c) => ({ label: asText(c.label), scripture: Array.isArray(c.scripture) ? c.scripture : [], explanation: asText(c.explanation) }))
    .filter((c) => c.scripture.length > 0 || c.explanation.length > 0);

  if (connections.length === 0) {
    return (
      <BlockNotice title="Scripture connection not available" message="This part of the lesson could not be shown. The rest of the lesson is not affected." />
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {title ? (
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {connections.map((connection, index) => (
        <View key={index} style={{ gap: spacing.md, paddingLeft: spacing.lg, borderLeftWidth: 2, borderLeftColor: colors.borderGold }}>
          <AppText variant="label" color="primaryHighlight" accessibilityRole="header">
            {connection.label ? `${index + 1}. ${connection.label}` : `Connection ${index + 1}`}
          </AppText>
          <ScriptureLinks entries={connection.scripture} />
          {connection.explanation ? (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
                Explanation
              </AppText>
              <AppText variant="body" style={{ fontSize: 17, lineHeight: 28 }}>
                {connection.explanation}
              </AppText>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
