import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useResource } from '@/api/use-resource';
import { AppText, Card, EmptyState, ScreenContainer, ScreenHeader, SectionHeader } from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { completedLessons, summarise, unfinishedLessons } from '@/features/learning/progress-model';
import { loadCourseList } from '@/features/offline/offline-api';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/**
 * Progress: lessons completed and remaining, and the lessons in progress, all from this device. The remaining count comes from the
 * published catalog at the learner's level (live, or its saved copy); with neither it is simply not shown, never guessed.
 *
 * There is deliberately NO "overall progress" percentage and no quiz score here: the specification does not define the formula
 * (decision C-14), and published lessons do not have quizzes yet. Both appear once they are defined.
 */
export function ProgressScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, ready } = useLearningLevel();
  const { progress } = useLearningProgress();
  const [courses] = useResource(ready ? `courses:${level}` : null, (signal) => loadCourseList(level, signal));
  const total = courses.status === 'success' ? courses.data.value.courses.reduce((sum, course) => sum + course.lessonCount, 0) : null;
  const summary = summarise(progress, level, total);
  const unfinished = unfinishedLessons(progress);
  const done = completedLessons(progress);
  const open = (lessonId: string, lessonLevel: string) => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId, level: lessonLevel } });

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Progress" onBack={null} />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <Card>
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" color="textMuted">
                {LEVEL_LABELS[level]} level
              </AppText>
              <AppText variant="heading">
                {summary.completedAtLevel} {summary.completedAtLevel === 1 ? 'lesson' : 'lessons'} completed
              </AppText>
              <AppText variant="bodySmall" color="textSecondary">
                {summary.remainingAtLevel === null
                  ? 'Lessons remaining: not available until the course list has loaded once.'
                  : `${summary.remainingAtLevel} remaining of ${total} published`}
              </AppText>
            </View>
            <AppText variant="caption" color="textMuted">
              {summary.completed} completed across all levels · {summary.inProgress} in progress
            </AppText>
          </View>
        </Card>

        <View style={{ gap: spacing.md }}>
          <SectionHeader title="In progress" />
          {unfinished.length === 0 ? (
            <EmptyState title="Nothing in progress" message="Lessons you start and do not finish appear here, so you can continue where you stopped." />
          ) : (
            unfinished.map((lesson) => (
              <Card
                key={`${lesson.lessonId}:${lesson.level}`}
                variant="outlined"
                onPress={() => open(lesson.lessonId, lesson.level)}
                accessibilityLabel={`Continue ${lesson.title}, ${LEVEL_LABELS[lesson.level]} level`}>
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="heading">{lesson.title}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {LEVEL_LABELS[lesson.level]} level · tap to continue
                  </AppText>
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={{ gap: spacing.md }}>
          <SectionHeader title="Completed" />
          {done.length === 0 ? (
            <AppText variant="bodySmall" color="textSecondary">
              Lessons you mark as complete are listed here.
            </AppText>
          ) : (
            done.map((lesson) => (
              <Card
                key={`${lesson.lessonId}:${lesson.level}`}
                onPress={() => open(lesson.lessonId, lesson.level)}
                accessibilityLabel={`${lesson.title}, ${LEVEL_LABELS[lesson.level]} level, completed. Open again.`}>
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="body">{lesson.title}</AppText>
                  <AppText variant="caption" color="success">
                    ✓ Completed · {LEVEL_LABELS[lesson.level]} level
                  </AppText>
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Quiz scores" />
          <AppText variant="bodySmall" color="textSecondary">
            Quizzes for published lessons are not available yet, so there are no scores to show.
          </AppText>
        </View>
      </View>
    </ScreenContainer>
  );
}
