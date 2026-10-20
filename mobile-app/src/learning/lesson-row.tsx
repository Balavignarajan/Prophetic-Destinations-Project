import { Pressable, StyleSheet, View } from 'react-native';

import type { CatalogLesson } from '@/api/types';
import { AppText, ChevronIcon } from '@/components/ui';
import { CoverImage, lessonCoverUrl } from '@/learning/cover-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

/** One lesson in a module list. */
export function LessonRow({ lesson, index, level, completed = false, onPress }: { lesson: CatalogLesson; index: number; level?: LearningLevel; completed?: boolean; onPress: () => void }) {
  const { colors, layout, radius, spacing } = useTheme();
  const minutes = lesson.estimatedMinutes ? `${lesson.estimatedMinutes} min` : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lesson ${index + 1}. ${lesson.title}.${lesson.subtitle ? ` ${lesson.subtitle}.` : ''}${minutes ? ` ${minutes}.` : ''}${completed ? ' Completed.' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: layout.touchTarget + spacing.md,
          padding: spacing.md,
          gap: spacing.md,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: colors.borderSubtle,
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
        },
      ]}>
      <View style={[styles.number, { borderColor: colors.borderGold }]}>
        <AppText variant="caption" color="primaryHighlight" style={{ fontWeight: '700' }}>
          {index + 1}
        </AppText>
      </View>
      {level && lesson.coverMediaId ? <CoverImage mediaId={lesson.coverMediaId} uri={lessonCoverUrl(lesson.lessonId, lesson.coverMediaId, level)} width={56} height={40} /> : null}
      <View style={styles.text}>
        <AppText variant="body">{lesson.title}</AppText>
        {lesson.subtitle ? (
          <AppText variant="bodySmall" color="textSecondary">
            {lesson.subtitle}
          </AppText>
        ) : null}
        {minutes || completed ? (
          <AppText variant="caption" color={completed ? 'success' : 'textMuted'}>
            {[minutes, completed ? '✓ Completed' : null].filter(Boolean).join(' · ')}
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
