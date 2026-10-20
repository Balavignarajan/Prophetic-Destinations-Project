import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Renders a published CALLOUT block (backend/src/modules/lessons/domain/blocks/section-callout.ts; PROPOSED schema):
 *   { calloutType: 'REMEMBER' | 'KEY_IDEA' | 'PROPHECY_PRINCIPLE', title?, body }
 * Short author-written emphasis. What kind of note it is stays in WORDS (a text label such as "Remember"), never only in colour, and the
 * left bar is a neutral accent. It is not Scripture and not a source quotation, so it uses the ordinary text face, not the Scripture card or
 * the quotation style. Only the three types named in the requirement exist (the closed list is open decision D7); an unknown type, or a
 * missing body, makes the callout "not available" rather than guessing what it should look like. The rest of the lesson is unaffected.
 */
const LABELS: Record<string, string> = { REMEMBER: 'Remember', KEY_IDEA: 'Key idea', PROPHECY_PRINCIPLE: 'Prophecy principle' };
const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function CalloutBlock({ content }: { content: Record<string, unknown> }) {
  const { spacing, colors, radius } = useTheme();
  const type = asText(content.calloutType);
  const label = LABELS[type];
  const body = asText(content.body);
  const title = asText(content.title);

  if (!label || !body) {
    return (
      <View style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}>
        <AppText variant="label" color="warning">
          Callout not available
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
          This note could not be shown. The rest of the lesson is not affected.
        </AppText>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${title ? `${title}. ` : ''}${body}`}
      style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, borderLeftWidth: 6, borderLeftColor: colors.primaryHighlight, backgroundColor: colors.surface }}>
      <AppText variant="label" color="primaryHighlight" style={{ textTransform: 'uppercase' }}>
        {label}
      </AppText>
      {title ? (
        <AppText variant="body" style={{ fontWeight: '700' }}>
          {title}
        </AppText>
      ) : null}
      <AppText variant="body">{body}</AppText>
    </View>
  );
}
