import { StyleSheet, View } from 'react-native';

import { type ColorToken, useTheme } from '@/theme';

import { AppText } from './app-text';

export type BlockNoticeVariant = 'unavailable' | 'unsupported' | 'missing' | 'offline';

export type BlockNoticeProps = {
  /** Short statement of what is wrong, e.g. "Quiz not available". */
  title: string;
  /** Optional supporting sentence. Announced politely to screen readers. */
  message?: string;
  /** `unavailable` (default) and `missing` use the warning colour; `unsupported` and `offline` are quieter. */
  variant?: BlockNoticeVariant;
};

const INDICATOR: Record<BlockNoticeVariant, { glyph: string; color: ColorToken }> = {
  unavailable: { glyph: '!', color: 'warning' },
  missing: { glyph: '!', color: 'warning' },
  unsupported: { glyph: 'i', color: 'textSecondary' },
  offline: { glyph: 'i', color: 'textSecondary' },
};

/**
 * The one "this part could not be shown" box for lesson blocks: a small indicator, a title and an optional explanation. The
 * indicator is decorative (the title carries the meaning, so it is never colour alone) and hidden from screen readers.
 */
export function BlockNotice({ title, message, variant = 'unavailable' }: BlockNoticeProps) {
  const { colors, layout, radius, spacing } = useTheme();
  const { glyph, color } = INDICATOR[variant];
  return (
    <View
      style={[
        styles.row,
        {
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: colors.borderSubtle,
          borderLeftWidth: 3,
          borderLeftColor: colors[color],
          backgroundColor: colors.surface,
        },
      ]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.indicator, { borderColor: colors[color] }]}>
        <AppText variant="caption" color={color} style={styles.glyph} allowFontScaling={false}>
          {glyph}
        </AppText>
      </View>
      <View style={[styles.text, { gap: spacing.xs }]}>
        <AppText variant="bodySmall" color={color} style={styles.title}>
          {title}
        </AppText>
        {message ? (
          <AppText variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
            {message}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  indicator: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontWeight: '700', lineHeight: 16 },
  text: { flex: 1 },
  title: { fontWeight: '700' },
});
