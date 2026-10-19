import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  ScreenContainer,
  ScreenHeader,
  SettingsIcon,
} from '@/components/ui';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { continueTarget } from '@/features/learning/progress-model';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadCourseList } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { useResource } from '@/api/use-resource';
import { CourseCard } from '@/learning/course-card';
import { LevelSelector } from '@/learning/level-selector';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/** The course catalog: the published courses at the chosen learning level, from the backend (or the last saved copy, labelled). */
export function LearnScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, setLevel, ready } = useLearningLevel();
  const { progress } = useLearningProgress();
  const { items: saved } = useBookmarks();
  const [courses, reload] = useResource(ready ? `courses:${level}` : null, (signal) => loadCourseList(level, signal));
  useRetryOnReconnect(isRecoverable(courses), reload);
  // Only an unfinished lesson is offered for resuming (the specification: Continue Learning appears when unfinished progress exists).
  const last = continueTarget(progress);

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Courses"
        onBack={null}
        trailing={
          <View style={{ flexDirection: 'row' }}>
            <IconButton accessibilityLabel={`Saved items, ${saved.length}`} tone="ghost" onPress={() => router.push('/saved')}>
              <AppText variant="heading" color="primaryHighlight">
                ★
              </AppText>
            </IconButton>
            <IconButton accessibilityLabel="Settings" tone="ghost" onPress={() => router.push('/settings')}>
              <SettingsIcon />
            </IconButton>
          </View>
        }
      />
      <View style={{ gap: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {last ? (
          <Card
            variant="outlined"
            onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: last.lessonId, level: last.level } })}
            accessibilityLabel={`Continue learning: ${last.title}, ${LEVEL_LABELS[last.level]} level`}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" color="primaryHighlight">
                Continue learning
              </AppText>
              <AppText variant="heading">{last.title}</AppText>
              <AppText variant="caption" color="textMuted">
                {LEVEL_LABELS[last.level]} level
              </AppText>
            </View>
          </Card>
        ) : null}

        <View style={{ gap: spacing.md }}>
          <AppText variant="label" color="textMuted">
            Built-in interactive lesson
          </AppText>
          <Card
            variant="outlined"
            onPress={() => router.push('/daniel-2')}
            accessibilityLabel="Daniel 2: The Dream of the Great Image. Built-in interactive lesson, not from the course catalog.">
            <View style={{ gap: spacing.sm }}>
              <AppText variant="heading">Daniel 2: The Dream of the Great Image</AppText>
              <AppText variant="bodySmall" color="textSecondary">
                The dream, the great image, the kingdoms, the stone, a timeline and a short quiz.
              </AppText>
              <AppText variant="caption" color="textMuted">
                Built-in content pending approval. Not part of the course catalog below.
              </AppText>
            </View>
          </Card>
          <AppText variant="label" color="textMuted" style={{ marginTop: spacing.sm }}>
            Course catalog
          </AppText>
        </View>

        <LevelSelector value={level} onChange={setLevel} />

        {courses.status === 'loading' ? <LoadingState message="Loading courses…" /> : null}

        {courses.status === 'error' ? (
          <ErrorState {...describeLoadError(courses.error, 'course list')} onRetry={reload} />
        ) : null}

        {courses.status === 'success' && courses.data.source === 'cache' ? <OfflineBanner loaded={courses.data} onRetry={reload} /> : null}

        {courses.status === 'success' && courses.data.value.courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            message={`There are no published courses at the ${LEVEL_LABELS[level]} level right now. Try another level, or check back soon.`}
            action={{ label: 'Refresh', onPress: reload }}
          />
        ) : null}

        {courses.status === 'success'
          ? courses.data.value.courses.map((course) => (
              <CourseCard
                key={course.courseId}
                course={course}
                onPress={() =>
                  router.push({ pathname: '/course/[courseId]', params: { courseId: course.courseId, level } })
                }
              />
            ))
          : null}
      </View>
    </ScreenContainer>
  );
}
