import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  AppText,
  Card,
  ChevronIcon,
  EmptyState,
  ErrorState,
  IconButton,
  LinkRow,
  LoadingState,
  ScreenContainer,
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
import { ContinueCard } from '@/learning/continue-card';
import { CourseCard } from '@/learning/course-card';
import { LevelSelector } from '@/learning/level-selector';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/** The course catalog: the published courses at the chosen learning level, in their published order, from the backend (or the last saved copy, labelled). */
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
  const courseList = courses.status === 'success' ? courses.data.value.courses : [];
  const lastCourse = last && last.level === level && last.courseId ? courseList.find((course) => course.courseId === last.courseId) : undefined;

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs, paddingTop: spacing.sm }}>
            <AppText variant="title" accessibilityRole="header">
              Learn
            </AppText>
            <AppText variant="body" color="textSecondary">
              Explore Bible prophecy, one lesson at a time.
            </AppText>
          </View>
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
        </View>

        {last ? (
          <ContinueCard
            lessonTitle={last.title}
            courseTitle={lastCourse?.title}
            level={last.level}
            onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: last.lessonId, level: last.level } })}
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
            Your learning level
          </AppText>
          <LevelSelector value={level} onChange={setLevel} />
          <LinkRow title="Not sure which level?" description="Take the short, optional assessment for a suggestion. You always choose." onPress={() => router.push('/assessment')} />
        </View>

        <View style={{ gap: spacing.md }}>
          <AppText variant="sectionHeading" accessibilityRole="header">
            {LEVEL_LABELS[level]} courses
          </AppText>

          {courses.status === 'loading' ? <LoadingState message="Loading courses…" /> : null}

          {courses.status === 'error' ? <ErrorState {...describeLoadError(courses.error, 'course list')} onRetry={reload} /> : null}

          {courses.status === 'success' && courses.data.source === 'cache' ? <OfflineBanner loaded={courses.data} onRetry={reload} /> : null}

          {courses.status === 'success' && courseList.length === 0 ? (
            <EmptyState
              title="No courses yet"
              message={`There are no published courses at the ${LEVEL_LABELS[level]} level right now. Try another level, or check back soon.`}
              action={{ label: 'Refresh', onPress: reload }}
            />
          ) : null}

          {courseList.map((course) => (
            <CourseCard
              key={course.courseId}
              course={course}
              level={level}
              onPress={() => router.push({ pathname: '/course/[courseId]', params: { courseId: course.courseId, level } })}
            />
          ))}
        </View>

        {/* The hand-built Daniel 2 lesson: kept and still reachable, but set apart from the published courses and described as a preview. */}
        <View style={{ gap: spacing.md }}>
          <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
            Interactive preview
          </AppText>
          <Card
            onPress={() => router.push('/daniel-2')}
            accessibilityLabel="Daniel 2: The Dream of the Great Image. An interactive preview lesson, separate from the courses above.">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <AppText variant="heading">Daniel 2: The Dream of the Great Image</AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  The dream, the great image, the kingdoms, the stone, a timeline and a short quiz.
                </AppText>
                <AppText variant="bodySmall" color="textMuted">
                  A preview lesson, separate from the courses above.
                </AppText>
              </View>
              <ChevronIcon direction="right" color="primaryHighlight" />
            </View>
          </Card>
        </View>
      </View>
    </ScreenContainer>
  );
}
