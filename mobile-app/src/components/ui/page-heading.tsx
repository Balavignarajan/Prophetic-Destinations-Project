import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';

/** The heading of a top-level screen: a Cinzel title with one line of supporting text, and an optional action on the right. */
export function PageHeading({ title, description, trailing }: { title: string; description?: string; trailing?: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {description ? (
          <AppText variant="body" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
