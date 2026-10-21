import { View } from 'react-native';

import { AppText, Card, GoldGlow, PrimaryButton } from '@/components/ui';
import { LEVEL_LABELS, type LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/** The "pick up where you left off" card: the unfinished lesson, its course when known, its level and one clear button. */
export function ContinueCard({
  lessonTitle,
  courseTitle,
  level,
  onPress,
}: {
  lessonTitle: string;
  courseTitle?: string | null;
  level: LearningLevel;
  onPress: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const meta = `${courseTitle ? `${courseTitle} · ` : ''}${LEVEL_LABELS[level]} level`;
  return (
    <Card variant="elevated" style={{ borderColor: colors.borderGold }}>
      <GoldGlow radius={radius.lg} />
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
            Continue learning
          </AppText>
          <AppText variant="heading" accessibilityRole="header">
            {lessonTitle}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary">
            {meta}
          </AppText>
        </View>
        <PrimaryButton size="medium" label="Continue" accessibilityLabel={`Continue learning: ${lessonTitle}, ${LEVEL_LABELS[level]} level`} onPress={onPress} />
      </View>
    </Card>
  );
}
