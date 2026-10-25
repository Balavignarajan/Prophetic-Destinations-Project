import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ApiError, NetworkError } from '@/api/errors';
import { useResource } from '@/api/use-resource';
import { AppText, EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader, SecondaryButton } from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadHomeEntryCourses } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { CourseCard } from '@/learning/course-card';
import { CoverImage, homeEntryImageUrl } from '@/learning/cover-image';
import { topicCountsLine } from '@/learning/home-entry-cards';
import { LEVEL_LABELS, firstParam } from '@/learning/levels';
import { useRouteLevel } from '@/learning/use-route-level';
import { useTheme } from '@/theme';

/**
 * One Home topic (Daniel, Bible History...): its title and description and the published courses in it at the chosen level, in the course order the catalog uses. A course opens the
 * usual course screen, so nothing about courses or lessons is repeated here. The list is the server's: a draft or unpublished course, or one without lessons at this level, is never in it,
 * and a topic left with none (or deleted or disabled) is "not available". The list is saved on the device like the other catalog lists, so a dropped connection shows the last good one, labelled
 * as a saved copy, and never turns into an empty list.
 */
export function TopicScreen() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const params = useLocalSearchParams<{ entryId: string; level?: string }>();
  const entryId = firstParam(params.entryId);
  const { level, ready } = useRouteLevel(params.level);
  const { isCompleted } = useLearningProgress();
  const [topic, reload] = useResource(ready ? `topic:${entryId}:${level}` : null, (signal) => loadHomeEntryCourses(entryId, level, signal));
  useRetryOnReconnect(isRecoverable(topic), reload);
  const data = topic.status === 'success' ? topic.data.value : null;
  const notFound = topic.status === 'error' && topic.error instanceof ApiError && topic.error.isUnavailable;
  const goHome = () => router.replace('/');

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Topic" />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {topic.status === 'loading' ? <LoadingState message="Loading courses…" /> : null}

        {notFound ? (
          <EmptyState
            title="Topic not available"
            message={`This topic has no published courses at the ${LEVEL_LABELS[level]} level right now, or it is no longer available.`}
            action={{ label: 'Back to Home', onPress: goHome }}
          />
        ) : null}

        {topic.status === 'error' && !notFound ? (
          <>
            <ErrorState {...describeLoadError(topic.error, 'course list', level)} onRetry={reload} />
            {/* Not saved at this level and no connection: Home is where another level (one that was saved) can be chosen. */}
            {topic.error instanceof NetworkError ? <SecondaryButton label="Back to Home" onPress={goHome} /> : null}
          </>
        ) : null}

        {topic.status === 'success' && topic.data.source === 'cache' ? <OfflineBanner loaded={topic.data} onRetry={reload} /> : null}

        {data ? (
          <>
            <View style={{ gap: spacing.lg }}>
              {data.entry.imageMediaId ? (
                <CoverImage mediaId={data.entry.imageMediaId} uri={homeEntryImageUrl(data.entry.entryId, data.entry.imageMediaId, level)} width="100%" aspectRatio={16 / 9} />
              ) : null}
              <View style={{ gap: spacing.sm }}>
                <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600' }}>
                  {LEVEL_LABELS[level]} level · {topicCountsLine({ courseCount: data.courses.length, lessonCount: data.courses.reduce((total, course) => total + course.lessonCount, 0) })}
                </AppText>
                <AppText variant="title" accessibilityRole="header">
                  {data.entry.title}
                </AppText>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 2, backgroundColor: colors.primary }} />
                {data.entry.description ? (
                  <AppText variant="body" color="textSecondary" style={{ fontSize: 17, lineHeight: 27 }}>
                    {data.entry.description}
                  </AppText>
                ) : null}
              </View>
            </View>

            {data.courses.length === 0 ? (
              <EmptyState title="No courses yet" message="This topic has no courses available at this level." />
            ) : (
              <View style={{ gap: spacing.md }}>
                <AppText variant="sectionHeading" accessibilityRole="header">
                  Courses
                </AppText>
                {data.courses.map((course) => {
                  const done = course.lessonIds ? course.lessonIds.filter((lessonId) => isCompleted(lessonId, level)).length : 0;
                  return (
                    <View key={course.courseId} style={{ gap: spacing.xs }}>
                      <CourseCard course={course} level={level} onPress={() => router.push({ pathname: '/course/[courseId]', params: { courseId: course.courseId, level } })} />
                      {done > 0 ? (
                        <AppText variant="bodySmall" color="textSecondary" style={{ fontWeight: '600', paddingHorizontal: spacing.xs }}>
                          {done} of {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'} completed
                        </AppText>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
