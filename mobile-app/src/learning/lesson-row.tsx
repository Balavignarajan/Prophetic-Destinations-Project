import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, ChevronIcon } from '@/components/ui';
import type { CatalogLesson } from '@/api/types';
import { CoverImage, lessonCoverUrl } from '@/learning/cover-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/**
 * One lesson in a course list: its number (a check once completed), title, subtitle, length and state. "Completed" and "In progress" come from
 * the learner's existing local progress; a lesson with neither shows no state. Nothing is locked.
 */
export function LessonRow({
  lesson,
  index,
  level,
  completed = false,
  inProgress = false,
  onPress,
}: {
  lesson: CatalogLesson;
  index: number;
  level?: LearningLevel;
  completed?: boolean;
  inProgress?: boolean;
  onPress: () => void;
}) {
  const { colors, layout, radius, spacing } = useTheme();
  const minutes = lesson.estimatedMinutes ? `${lesson.estimatedMinutes} min` : null;
  const state = completed ? '✓ Completed' : inProgress ? 'In progress' : null;
  const meta = [minutes, state].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lesson ${index + 1}. ${lesson.title}.${lesson.subtitle ? ` ${lesson.subtitle}.` : ''}${minutes ? ` ${minutes}.` : ''}${completed ? ' Completed.' : inProgress ? ' In progress.' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: layout.touchTarget + spacing.lg,
          padding: spacing.md,
          gap: spacing.md,
          borderRadius: radius.lg,
          borderWidth: layout.hairline,
          borderColor: inProgress ? colors.borderGold : colors.borderSubtle,
          borderLeftWidth: inProgress ? 3 : layout.hairline,
          borderLeftColor: inProgress ? colors.primary : colors.borderSubtle,
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
        },
      ]}>
      <View
        style={[
          styles.number,
          { borderColor: completed ? colors.success : colors.borderGold, backgroundColor: completed ? colors.success : colors.transparent },
        ]}>
        <AppText variant="caption" color={completed ? 'onPrimary' : 'primaryHighlight'} style={{ fontWeight: '700' }} allowFontScaling={false}>
          {completed ? '✓' : index + 1}
        </AppText>
      </View>
      {level && lesson.coverMediaId ? <CoverImage mediaId={lesson.coverMediaId} uri={lessonCoverUrl(lesson.lessonId, lesson.coverMediaId, level)} width={56} height={40} /> : null}
      <View style={styles.text}>
        <AppText variant="body" style={{ fontWeight: '600' }}>
          {lesson.title}
        </AppText>
        {lesson.subtitle ? (
          <AppText variant="bodySmall" color="textSecondary">
            {lesson.subtitle}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="bodySmall" color={completed ? 'success' : inProgress ? 'primaryHighlight' : 'textMuted'} style={completed || inProgress ? { fontWeight: '600' } : undefined}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <ChevronIcon direction="right" color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
