import { View } from 'react-native';

import type { CourseListItem } from '@/api/types';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One course in the catalog. The whole card is the button. */
export function CourseCard({ course, onPress }: { course: CourseListItem; onPress: () => void }) {
  const { spacing } = useTheme();
  const counts = `${plural(course.moduleCount, 'module')} · ${plural(course.lessonCount, 'lesson')}`;
  return (
    <Card
      variant="elevated"
      onPress={onPress}
      accessibilityLabel={`${course.title}. ${counts}.${course.description ? ` ${course.description}` : ''}`}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="heading">{course.title}</AppText>
        {course.description ? (
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={3}>
            {course.description}
          </AppText>
        ) : null}
        <AppText variant="caption" color="primaryHighlight">
          {counts}
        </AppText>
      </View>
    </Card>
  );
}
