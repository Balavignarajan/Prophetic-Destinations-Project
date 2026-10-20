import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ApiError } from '@/api/errors';
import { useResource } from '@/api/use-resource';
import { AppText, EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader } from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadCourse } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { LessonRow } from '@/learning/lesson-row';
import { LEVEL_LABELS, firstParam } from '@/learning/levels';
import { useRouteLevel } from '@/learning/use-route-level';
import { useTheme } from '@/theme';

/** One course: its description and its modules with their lessons, in the published order. */
export function CourseScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ courseId: string; level?: string }>();
  const courseId = firstParam(params.courseId);
  const { level, ready } = useRouteLevel(params.level);
  const { isCompleted } = useLearningProgress();
  const [course, reload] = useResource(ready ? `course:${courseId}:${level}` : null, (signal) => loadCourse(courseId, level, signal));
  useRetryOnReconnect(isRecoverable(course), reload);
  const data = course.status === 'success' ? course.data.value : null;
  const directLessons = data?.directLessons ?? [];
  const notFound = course.status === 'error' && course.error instanceof ApiError && course.error.isUnavailable;

  return (
    <ScreenContainer scroll>
      <ScreenHeader title={data ? data.title : 'Course'} />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {course.status === 'loading' ? <LoadingState message="Loading course…" /> : null}

        {notFound ? (
          <EmptyState
            title="Course not available"
            message={`This course is not published at the ${LEVEL_LABELS[level]} level, or it is no longer available.`}
            action={{ label: 'Back to courses', onPress: () => router.replace('/learn') }}
          />
        ) : null}

        {course.status === 'error' && !notFound ? (
          <ErrorState {...describeLoadError(course.error, 'course')} onRetry={reload} />
        ) : null}

        {course.status === 'success' && course.data.source === 'cache' ? <OfflineBanner loaded={course.data} onRetry={reload} /> : null}

        {data ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" color="primaryHighlight">
                {LEVEL_LABELS[level]} level
              </AppText>
              {data.description ? (
                <AppText variant="body" color="textSecondary">
                  {data.description}
                </AppText>
              ) : null}
            </View>

            {data.modules.length === 0 && directLessons.length === 0 ? (
              <EmptyState title="No lessons yet" message="This course has no lessons available at this level." />
            ) : null}

            {directLessons.length > 0 ? <View style={{ gap: spacing.md }}>
              <AppText variant="heading" accessibilityRole="header">Lessons</AppText>
              {directLessons.map((lesson, index) => <LessonRow key={lesson.lessonId} lesson={lesson} index={index} level={level} completed={isCompleted(lesson.lessonId, level)} onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.lessonId, level } })} />)}
            </View> : null}

            {data.modules.map((module) => (
              <View key={module.moduleId} style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="heading" accessibilityRole="header">
                    {module.title}
                  </AppText>
                  {module.description ? (
                    <AppText variant="bodySmall" color="textSecondary">
                      {module.description}
                    </AppText>
                  ) : null}
                </View>
                {module.lessons.map((lesson, index) => (
                  <LessonRow
                    key={lesson.lessonId}
                    lesson={lesson}
                    level={level}
                    index={index}
                    completed={isCompleted(lesson.lessonId, level)}
                    onPress={() =>
                      router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.lessonId, level } })
                    }
                  />
                ))}
              </View>
            ))}
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
