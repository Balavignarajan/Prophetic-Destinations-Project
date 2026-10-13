import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  /** Something on the right, e.g. a small button. */
  action?: ReactNode;
};

/** A section title with a short gold rule, optional subtitle and optional trailing action. */
export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <View style={styles.text}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        <View style={[styles.rule, { backgroundColor: colors.primary, marginTop: spacing.xs }]} />
        {subtitle ? (
          <AppText variant="bodySmall" color="textSecondary" style={{ marginTop: spacing.sm }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  text: { flex: 1 },
  rule: { width: 32, height: 2 },
});
