import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ApiError, describeError } from '@/api/errors';
import { getCourse } from '@/api/learner-api';
import { useResource } from '@/api/use-resource';
import { AppText, EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader } from '@/components/ui';
import { LessonRow } from '@/learning/lesson-row';
import { LEVEL_LABELS, firstParam, levelFromParam } from '@/learning/levels';
import { useTheme } from '@/theme';

/** One course: its description and its modules with their lessons, in the published order. */
export function CourseScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ courseId: string; level?: string }>();
  const courseId = firstParam(params.courseId);
  const level = levelFromParam(params.level);
  const [course, reload] = useResource(`course:${courseId}:${level}`, (signal) => getCourse(courseId, level, signal));

  return (
    <ScreenContainer scroll>
      <ScreenHeader title={course.status === 'success' ? course.data.title : 'Course'} />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {course.status === 'loading' ? <LoadingState message="Loading course…" /> : null}

        {course.status === 'error' && course.error instanceof ApiError && course.error.isNotFound ? (
          <EmptyState
            title="Course not available"
            message={`This course is not published at the ${LEVEL_LABELS[level]} level, or it is no longer available.`}
            action={{ label: 'Back to courses', onPress: () => router.replace('/learn') }}
          />
        ) : null}

        {course.status === 'error' && !(course.error instanceof ApiError && course.error.isNotFound) ? (
          <ErrorState {...describeError(course.error)} onRetry={reload} />
        ) : null}

        {course.status === 'success' ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" color="primaryHighlight">
                {LEVEL_LABELS[level]} level
              </AppText>
              {course.data.description ? (
                <AppText variant="body" color="textSecondary">
                  {course.data.description}
                </AppText>
              ) : null}
            </View>

            {course.data.modules.length === 0 ? (
              <EmptyState title="No lessons yet" message="This course has no lessons available at this level." />
            ) : null}

            {course.data.modules.map((module) => (
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
                    index={index}
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
