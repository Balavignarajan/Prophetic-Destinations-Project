import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

/** A titled group on a screen: a Cinzel heading, an optional line of explanation, then the group's content. */
export function ScreenSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {description ? (
          <AppText variant="bodySmall" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}
