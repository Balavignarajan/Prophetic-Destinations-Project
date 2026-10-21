import { View } from 'react-native';

import { AppText, Card, ChevronIcon } from '@/components/ui';
import type { CourseListItem } from '@/api/types';
import { CoverImage, courseCoverUrl } from '@/learning/cover-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One course in the catalog: cover (when the course has one), Cinzel title, description, counts and a chevron. The whole card is the button. */
export function CourseCard({ course, level, onPress }: { course: CourseListItem; level?: LearningLevel; onPress: () => void }) {
  const { spacing } = useTheme();
  const counts = `${plural(course.moduleCount, 'module')} · ${plural(course.lessonCount, 'lesson')}`;
  return (
    <Card
      variant="elevated"
      onPress={onPress}
      accessibilityLabel={`${course.title}. ${counts}.${course.description ? ` ${course.description}` : ''}`}>
      <View style={{ gap: spacing.md }}>
        {level && course.coverMediaId ? <CoverImage mediaId={course.coverMediaId} uri={courseCoverUrl(course.courseId, course.coverMediaId, level)} width="100%" height={160} /> : null}
        <AppText variant="heading">{course.title}</AppText>
        {course.description ? (
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={3}>
            {course.description}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600', flexShrink: 1 }}>
            {counts}
          </AppText>
          <ChevronIcon direction="right" color="primaryHighlight" />
        </View>
      </View>
    </Card>
  );
}
