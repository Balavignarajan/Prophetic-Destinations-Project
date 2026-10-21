import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, ChevronIcon, IconButton } from '@/components/ui';
import { useTheme } from '@/theme';

export type LessonHeaderProps = {
  /** The short title when the lesson has one, otherwise the title. */
  title: string;
  /** Reading position, 0 to 100, or null when the lesson is too short to scroll (then no progress is shown). */
  percent: number | null;
  /** Opens the lesson contents. Omit when the lesson has no meaningful sections. */
  onContents?: () => void;
  /** Right-hand action, e.g. the save button. */
  trailing?: ReactNode;
};

/**
 * The compact top bar of the lesson reader: back, short title, optional contents button and save button, and a thin reading-position
 * bar. The position is where the learner is in the text; it is NOT lesson completion and is never stored.
 */
export function LessonHeader({ title, percent, onContents, trailing }: LessonHeaderProps) {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ paddingBottom: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.xs, paddingTop: spacing.xs }]}>
        <IconButton
          accessibilityLabel="Go back"
          tone="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronIcon direction="left" color="textPrimary" />
        </IconButton>
        <View style={styles.title}>
          <AppText variant="bodySmall" numberOfLines={1} accessibilityRole="header" style={{ fontWeight: '600' }}>
            {title}
          </AppText>
        </View>
        {onContents ? (
          <IconButton accessibilityLabel="Lesson contents" tone="ghost" onPress={onContents}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 4 }}>
              {[18, 14, 18].map((width, index) => (
                <View key={index} style={{ width, height: 2, borderRadius: 1, backgroundColor: colors.textPrimary }} />
              ))}
            </View>
          </IconButton>
        ) : null}
        {trailing}
      </View>
      {percent !== null ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Reading position"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={[styles.row, { gap: spacing.md, paddingHorizontal: spacing.sm }]}>
          <View style={[styles.track, { backgroundColor: colors.border, borderRadius: radius.pill }]}>
            <View style={{ width: `${percent}%`, height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary }} />
          </View>
          <AppText variant="bodySmall" color="textSecondary" style={styles.percent}>
            Reading {percent}%
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, justifyContent: 'center', minHeight: 48 },
  track: { flex: 1, height: 4, overflow: 'hidden' },
  percent: { minWidth: 104, textAlign: 'right' },
});
