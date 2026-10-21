import { View } from 'react-native';

import { AppText, Card, ChevronIcon } from '@/components/ui';
import type { CourseListItem } from '@/api/types';
import { CoverImage, courseCoverUrl } from '@/learning/cover-image';
import type { LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * One course in the catalog: the cover (when the course has one) runs edge to edge across the top of the card, then the Cinzel title, the
 * description, the counts and a chevron. The whole card is the button and shares the card press feedback. The clipping happens in an inner
 * layer so the card's own shadow is not cut off.
 */
export function CourseCard({ course, level, onPress }: { course: CourseListItem; level?: LearningLevel; onPress: () => void }) {
  const { radius, spacing } = useTheme();
  const counts = `${plural(course.moduleCount, 'module')} · ${plural(course.lessonCount, 'lesson')}`;
  return (
    <Card
      variant="elevated"
      onPress={onPress}
      accessibilityLabel={`${course.title}. ${counts}.${course.description ? ` ${course.description}` : ''}`}
      style={{ padding: 0 }}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        {level && course.coverMediaId ? (
          <CoverImage mediaId={course.coverMediaId} uri={courseCoverUrl(course.courseId, course.coverMediaId, level)} width="100%" aspectRatio={16 / 9} flush />
        ) : null}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
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
      </View>
    </Card>
  );
}
