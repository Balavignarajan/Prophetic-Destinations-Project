import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { SecondaryButton } from './secondary-button';

export type EmptyStateProps = {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

/** What to show when there is nothing to list yet. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.center, { gap: spacing.md, padding: spacing.xl }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
