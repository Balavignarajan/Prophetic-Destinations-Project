import { View } from 'react-native';

import type { CourseListItem } from '@/api/types';
import { AppText, Card, ChevronIcon } from '@/components/ui';
import { BOOK_ENTRIES, bookEntryState } from '@/learning/book-entries';
import { LEVEL_LABELS, type LearningLevel } from '@/learning/levels';
import { useTheme } from '@/theme';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The Daniel and Revelation entries on Home: one card for each, opening the published course the CMS marked for that book at the learner's level.
 * `courses` is the catalog already loaded for that level, so a draft or unpublished course can never be offered. A book with no such course at this level
 * (or with only a saved catalog that predates the marking) is shown plainly and cannot be opened, instead of leading to an error.
 */
export function BookEntryCards({ courses, level, onOpen }: { courses: readonly CourseListItem[]; level: LearningLevel; onOpen: (course: CourseListItem) => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {BOOK_ENTRIES.map(({ book, label }) => {
        const state = bookEntryState(courses, book);
        const levelName = LEVEL_LABELS[level];
        if (state.status === 'available') {
          const { course } = state;
          return (
            <Card
              key={book}
              variant="elevated"
              onPress={() => onOpen(course)}
              accessibilityLabel={`${label}. ${course.title}. ${plural(course.lessonCount, 'lesson')} at the ${levelName} level. Open the ${label} course.`}
              style={{ flexGrow: 1, flexBasis: 150 }}>
              <View style={{ gap: spacing.sm }}>
                <AppText variant="heading">{label}</AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                  <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600', flexShrink: 1 }}>
                    {plural(course.lessonCount, 'lesson')}
                  </AppText>
                  <ChevronIcon direction="right" color="primaryHighlight" />
                </View>
              </View>
            </Card>
          );
        }
        const reason = state.status === 'unknown' ? 'Connect to the internet to check this book.' : `Not available at the ${levelName} level yet.`;
        return (
          <Card key={book} style={{ flexGrow: 1, flexBasis: 150 }}>
            <View accessible accessibilityLabel={`${label}. ${reason}`} style={{ gap: spacing.sm }}>
              <AppText variant="heading" color="textMuted">
                {label}
              </AppText>
              <AppText variant="bodySmall" color="textMuted">
                {reason}
              </AppText>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
