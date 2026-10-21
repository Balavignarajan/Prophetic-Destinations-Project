import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Card } from './card';
import { PrimaryButton } from './primary-button';
import { Reveal } from './reveal';
import { SecondaryButton } from './secondary-button';

export type EmptyStateProps = {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  /** `card` is a left-aligned raised card whose action is the main button (a screen's first-use state). Default `plain`. */
  variant?: 'plain' | 'card';
};

/** What to show when there is nothing to list yet. */
export function EmptyState({ title, message, action, variant = 'plain' }: EmptyStateProps) {
  const { colors, spacing } = useTheme();
  if (variant === 'card') {
    return (
      <Card variant="elevated">
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          {message ? (
            <AppText variant="body" color="textSecondary">
              {message}
            </AppText>
          ) : null}
          {action ? <PrimaryButton size="medium" label={action.label} onPress={action.onPress} /> : null}
        </View>
      </Card>
    );
  }
  return (
    <Reveal style={[styles.center, { gap: spacing.md, padding: spacing.xl }]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 2, backgroundColor: colors.primary }} />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodySmall" color="textSecondary" align="center">
          {message}
        </AppText>
      ) : null}
      {action ? (
        <SecondaryButton label={action.label} onPress={action.onPress} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
      ) : null}
    </Reveal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
