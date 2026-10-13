import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { SecondaryButton } from './secondary-button';

export type ErrorStateProps = {
  title?: string;
  message?: string;
  /** When given, a "Try again" button is shown. */
  onRetry?: () => void;
};

/** What to show when something failed. States what happened and offers a way forward. */
export function ErrorState({
  title = 'Something went wrong',
  message = 'Please check your connection and try again.',
  onRetry,
}: ErrorStateProps) {
  const { spacing } = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.center, { gap: spacing.md, padding: spacing.xl }]}>
      <AppText variant="heading" color="error" align="center">
        {title}
      </AppText>
      <AppText variant="bodySmall" color="textSecondary" align="center">
        {message}
      </AppText>
      {onRetry ? (
        <SecondaryButton label="Try again" onPress={onRetry} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
