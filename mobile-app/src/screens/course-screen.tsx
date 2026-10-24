import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ApiError, NetworkError } from '@/api/errors';
import type { CatalogLesson } from '@/api/types';
import { useResource } from '@/api/use-resource';
import { AppText, Divider, EmptyState, ErrorState, LoadingState, PrimaryButton, ScreenContainer, ScreenHeader, SecondaryButton } from '@/components/ui';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { unfinishedLessons } from '@/features/learning/progress-model';
import { ProgressStatusNotice } from '@/features/learning/progress-notice';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadCourse } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { CoverImage, courseCoverUrl } from '@/learning/cover-image';
import { LessonRow } from '@/learning/lesson-row';
import { LEVEL_LABELS, firstParam } from '@/learning/levels';
import { useRouteLevel } from '@/learning/use-route-level';
import { useTheme } from '@/theme';

/** One course: its introduction, one clear way in, and its modules with their lessons, in the published order. */
export function CourseScreen() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const params = useLocalSearchParams<{ courseId: string; level?: string }>();
  const courseId = firstParam(params.courseId);
  const { level, ready } = useRouteLevel(params.level);
  const { isCompleted, progress } = useLearningProgress();
  const [course, reload] = useResource(ready ? `course:${courseId}:${level}` : null, (signal) => loadCourse(courseId, level, signal));
  useRetryOnReconnect(isRecoverable(course), reload);
  const data = course.status === 'success' ? course.data.value : null;
  const directLessons = data?.directLessons ?? [];
  const notFound = course.status === 'error' && course.error instanceof ApiError && course.error.isUnavailable;

  // All visible lessons in published order: lessons placed directly in the course first, then each module's (the order they are listed below).
  const allLessons: CatalogLesson[] = data ? [...directLessons, ...data.modules.flatMap((module) => module.lessons)] : [];
  const unfinished = unfinishedLessons(progress).filter((entry) => entry.level === level);
  const inProgressIds = new Set(unfinished.map((entry) => entry.lessonId));
  const completedCount = allLessons.filter((lesson) => isCompleted(lesson.lessonId, level)).length;
  // Continue: the most recent unfinished lesson of THIS course (the list is most recent first); otherwise start at the first lesson.
  const resumeLesson = unfinished.map((entry) => allLessons.find((lesson) => lesson.lessonId === entry.lessonId)).find((lesson) => lesson !== undefined);
  const startLesson = resumeLesson ?? allLessons[0];
  const open = (lessonId: string) => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId, level } });
  const lessonRow = (lesson: CatalogLesson, index: number) => (
    <LessonRow
      key={lesson.lessonId}
      lesson={lesson}
      index={index}
      level={level}
      completed={isCompleted(lesson.lessonId, level)}
      inProgress={inProgressIds.has(lesson.lessonId)}
      onPress={() => open(lesson.lessonId)}
    />
  );

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Course" />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <ProgressStatusNotice />

        {course.status === 'loading' ? <LoadingState message="Loading course…" /> : null}

        {notFound ? (
          <EmptyState
            title="Course not available"
            message={`This course is not published at the ${LEVEL_LABELS[level]} level, or it is no longer available.`}
            action={{ label: 'Back to courses', onPress: () => router.replace('/learn') }}
          />
        ) : null}

        {course.status === 'error' && !notFound ? (
          <>
            <ErrorState {...describeLoadError(course.error, 'course', level)} onRetry={reload} />
            {/* Not saved at this level and no connection: the way back is the course list, where another level (one that was saved) can be chosen. */}
            {course.error instanceof NetworkError ? <SecondaryButton label="Back to courses" onPress={() => router.replace('/learn')} /> : null}
          </>
        ) : null}

        {course.status === 'success' && course.data.source === 'cache' ? <OfflineBanner loaded={course.data} onRetry={reload} /> : null}

        {data ? (
          <>
            <View style={{ gap: spacing.lg }}>
              {data.coverMediaId ? <CoverImage mediaId={data.coverMediaId} uri={courseCoverUrl(data.courseId, data.coverMediaId, level)} width="100%" aspectRatio={16 / 9} /> : null}
              <View style={{ gap: spacing.sm }}>
                <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600' }}>
                  {LEVEL_LABELS[level]} level{allLessons.length > 0 ? ` · ${allLessons.length} ${allLessons.length === 1 ? 'lesson' : 'lessons'}` : ''}
                </AppText>
                <AppText variant="title" accessibilityRole="header">
                  {data.title}
                </AppText>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 2, backgroundColor: colors.primary }} />
                {data.description ? (
                  <AppText variant="body" color="textSecondary" style={{ fontSize: 17, lineHeight: 27 }}>
                    {data.description}
                  </AppText>
                ) : null}
              </View>
              {allLessons.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  {completedCount > 0 ? (
                    <AppText variant="bodySmall" color="textSecondary" style={{ fontWeight: '600' }}>
                      {completedCount} of {allLessons.length} {allLessons.length === 1 ? 'lesson' : 'lessons'} completed
                    </AppText>
                  ) : null}
                  {startLesson ? (
                    <PrimaryButton
                      label={resumeLesson ? 'Continue learning' : 'Start learning'}
                      accessibilityHint={`Opens ${startLesson.title}`}
                      onPress={() => open(startLesson.lessonId)}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>

            {data.modules.length === 0 && directLessons.length === 0 ? (
              <EmptyState title="No lessons yet" message="This course has no lessons available at this level." />
            ) : null}

            {directLessons.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                <AppText variant="sectionHeading" accessibilityRole="header">
                  Lessons
                </AppText>
                {directLessons.map(lessonRow)}
              </View>
            ) : null}

            {data.modules.map((module, moduleIndex) => (
              <View key={module.moduleId} style={{ gap: spacing.md }}>
                {moduleIndex > 0 || directLessons.length > 0 ? <Divider /> : null}
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1 }}>
                    MODULE {String(moduleIndex + 1).padStart(2, '0')}
                  </AppText>
                  <AppText variant="sectionHeading" accessibilityRole="header">
                    {module.title}
                  </AppText>
                  {module.description ? (
                    <AppText variant="bodySmall" color="textSecondary">
                      {module.description}
                    </AppText>
                  ) : null}
                </View>
                {module.lessons.map(lessonRow)}
              </View>
            ))}
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
