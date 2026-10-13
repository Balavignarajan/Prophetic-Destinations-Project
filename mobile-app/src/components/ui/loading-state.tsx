import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

export type LoadingStateProps = { message?: string };

/** Centred spinner with an optional message, announced politely to screen readers. */
export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      style={[styles.center, { gap: spacing.lg, padding: spacing.xl }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="bodySmall" color="textMuted" align="center">
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
