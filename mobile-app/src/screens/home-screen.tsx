import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useResource } from '@/api/use-resource';
import { AppText, Card, ErrorState, LoadingState, PrimaryButton, ScreenContainer, ScreenHeader, SecondaryButton } from '@/components/ui';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { continueTarget, summarise } from '@/features/learning/progress-model';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadCourseList } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { CourseCard } from '@/learning/course-card';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/** How many courses Home previews; the rest are one tap away in Learn. */
const HOME_COURSES = 3;

/**
 * Home: where the app opens after the first launch. Continue Learning (only when there is an unfinished lesson), a short progress
 * summary, and the published courses at the learner's level (the same catalog Learn shows, from the backend or its saved copy).
 */
export function HomeScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, ready } = useLearningLevel();
  const { progress } = useLearningProgress();
  const { items: saved } = useBookmarks();
  const [courses, reload] = useResource(ready ? `courses:${level}` : null, (signal) => loadCourseList(level, signal));
  useRetryOnReconnect(isRecoverable(courses), reload);
  const resume = continueTarget(progress);
  const summary = summarise(progress, level, null);

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Home" onBack={null} />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {resume ? (
          <Card
            variant="outlined"
            onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: resume.lessonId, level: resume.level } })}
            accessibilityLabel={`Continue learning: ${resume.title}, ${LEVEL_LABELS[resume.level]} level`}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" color="primaryHighlight">
                Continue learning
              </AppText>
              <AppText variant="heading">{resume.title}</AppText>
              <AppText variant="caption" color="textMuted">
                {LEVEL_LABELS[resume.level]} level
              </AppText>
            </View>
          </Card>
        ) : (
          <Card variant="outlined">
            <View style={{ gap: spacing.md }}>
              <AppText variant="heading">Start learning</AppText>
              <AppText variant="bodySmall" color="textSecondary">
                Pick a course to begin. Where you stop in a lesson is remembered on this device, so you can continue later.
              </AppText>
              <PrimaryButton label="Browse courses" onPress={() => router.push('/learn')} />
            </View>
          </Card>
        )}

        <Card onPress={() => router.push('/progress')} accessibilityLabel={`Your progress: ${summary.completed} completed, ${summary.inProgress} in progress. Open progress.`}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label" color="textMuted">
              Your progress
            </AppText>
            <AppText variant="heading">
              {summary.completed} {summary.completed === 1 ? 'lesson' : 'lessons'} completed
            </AppText>
            <AppText variant="caption" color="textMuted">
              {summary.inProgress} in progress
            </AppText>
          </View>
        </Card>

        <View style={{ gap: spacing.md }}>
          <AppText variant="label" color="textMuted">
            Courses at the {LEVEL_LABELS[level]} level
          </AppText>
          {courses.status === 'loading' ? <LoadingState message="Loading courses…" /> : null}
          {courses.status === 'error' ? <ErrorState {...describeLoadError(courses.error, 'course list')} onRetry={reload} /> : null}
          {courses.status === 'success' && courses.data.source === 'cache' ? <OfflineBanner loaded={courses.data} onRetry={reload} /> : null}
          {courses.status === 'success' && courses.data.value.courses.length === 0 ? (
            <AppText variant="bodySmall" color="textSecondary">
              There are no published courses at this level right now.
            </AppText>
          ) : null}
          {courses.status === 'success'
            ? courses.data.value.courses
                .slice(0, HOME_COURSES)
                .map((course) => (
                  <CourseCard
                    key={course.courseId}
                    course={course}
                    onPress={() => router.push({ pathname: '/course/[courseId]', params: { courseId: course.courseId, level } })}
                  />
                ))
            : null}
          {courses.status === 'success' && courses.data.value.courses.length > HOME_COURSES ? (
            <SecondaryButton label="See all courses" onPress={() => router.push('/learn')} />
          ) : null}
        </View>

        {saved.length > 0 ? (
          <SecondaryButton label={`Saved items (${saved.length})`} onPress={() => router.push('/saved')} />
        ) : null}
      </View>
    </ScreenContainer>
  );
}
