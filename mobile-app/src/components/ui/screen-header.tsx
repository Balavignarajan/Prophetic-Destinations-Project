import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { ChevronIcon } from './chevron-icon';
import { IconButton } from './icon-button';

export type ScreenHeaderProps = {
  title: string;
  /** Called by the back button; defaults to going back one screen. Pass `null` to hide the button. */
  onBack?: (() => void) | null;
  /** Something on the right, e.g. an IconButton. */
  trailing?: ReactNode;
};

/** The top bar of a content screen: back button, title, optional trailing action. */
export function ScreenHeader({ title, onBack, trailing }: ScreenHeaderProps) {
  const router = useRouter();
  const { spacing, layout } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.sm, paddingVertical: spacing.sm }]}>
      {onBack === null ? (
        <View style={{ width: spacing.xs }} />
      ) : (
        <IconButton
          accessibilityLabel="Go back"
          tone="ghost"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}>
          <ChevronIcon direction="left" color="textPrimary" />
        </IconButton>
      )}
      <View style={[styles.title, { minHeight: layout.touchTarget }]}>
        <AppText variant="heading" numberOfLines={2} accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, justifyContent: 'center' },
});
