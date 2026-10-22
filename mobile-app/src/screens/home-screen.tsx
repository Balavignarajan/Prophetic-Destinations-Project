import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useResource } from '@/api/use-resource';
import { AppText, Card, ErrorState, GoldGlow, LoadingState, PrimaryButton, ScreenContainer, SecondaryButton } from '@/components/ui';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { ProgressStatusNotice } from '@/features/learning/progress-notice';
import { levelProgressLine, progressCountsLine, useProgressOverview } from '@/features/learning/progress-overview';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadCourseList } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { ContinueCard } from '@/learning/continue-card';
import { CourseCard } from '@/learning/course-card';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/** How many courses Home previews; the rest are one tap away in Learn. */
const HOME_COURSES = 3;

/**
 * Home: where the app opens after the first launch. A short welcome, Continue Learning (only when there is an unfinished lesson), the published
 * courses at the learner's level in their published order (the same catalog Learn shows, from the backend or its saved copy) and a quiet
 * progress line.
 */
export function HomeScreen() {
  const router = useRouter();
  const { colors, layout, radius, spacing } = useTheme();
  const { level, ready } = useLearningLevel();
  const { items: saved } = useBookmarks();
  const [courses, reload] = useResource(ready ? `courses:${level}` : null, (signal) => loadCourseList(level, signal));
  useRetryOnReconnect(isRecoverable(courses), reload);
  const courseList = courses.status === 'success' ? courses.data.value.courses : [];
  // The published lessons at this level, from the catalog already loaded for the list below (live or its saved copy); unknown until it is.
  const totalAtLevel = courses.status === 'success' ? courseList.reduce((sum, course) => sum + course.lessonCount, 0) : null;
  // The same figures the Progress screen shows. When the saved progress could not be read, the empty progress is not "nothing yet": no "Start learning"
  // and no zero counts are shown. The resume lesson is the most recent unfinished one that is still published (the saved progress is never changed).
  const { unavailable: progressUnavailable, summary, resume, quizzes } = useProgressOverview(level, totalAtLevel);
  // The course name is only known when the resumed lesson is at the level whose course list is loaded.
  const resumeCourse = resume && resume.level === level && resume.courseId ? courseList.find((course) => course.courseId === resume.courseId) : undefined;

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxl }}>
        {/* An editorial opening: a calm panel with a faint gold wash, the name in small gold capitals, a short rule and the headline. */}
        <View
          style={{
            gap: spacing.md,
            padding: spacing.xl,
            borderRadius: radius.xl,
            borderWidth: layout.hairline,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surface,
          }}>
          <GoldGlow radius={radius.xl} />
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700', letterSpacing: 1 }}>
            PROPHETIC DESTINATIONS
          </AppText>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 2, backgroundColor: colors.primary }} />
          <AppText variant="sectionHeading" accessibilityRole="header">
            Discover Bible prophecy through Scripture and history.
          </AppText>
        </View>

        <ProgressStatusNotice />

        {progressUnavailable ? null : resume ? (
          <ContinueCard
            lessonTitle={resume.title}
            courseTitle={resumeCourse?.title}
            level={resume.level}
            onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: resume.lessonId, level: resume.level } })}
          />
        ) : (
          <Card variant="elevated">
            <GoldGlow radius={radius.lg} />
            <View style={{ gap: spacing.md }}>
              <AppText variant="heading">Start learning</AppText>
              <AppText variant="body" color="textSecondary">
                Pick a course to begin. Where you stop in a lesson is remembered on this device, so you can continue later.
              </AppText>
              <PrimaryButton size="medium" label="Browse courses" onPress={() => router.push('/learn')} />
            </View>
          </Card>
        )}

        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="sectionHeading" accessibilityRole="header">
              Explore courses
            </AppText>
            <AppText variant="bodySmall" color="textMuted">
              {LEVEL_LABELS[level]} level
            </AppText>
          </View>
          {courses.status === 'loading' ? <LoadingState message="Loading courses…" /> : null}
          {courses.status === 'error' ? <ErrorState {...describeLoadError(courses.error, 'course list')} onRetry={reload} /> : null}
          {courses.status === 'success' && courses.data.source === 'cache' ? <OfflineBanner loaded={courses.data} onRetry={reload} /> : null}
          {courses.status === 'success' && courseList.length === 0 ? (
            <AppText variant="body" color="textSecondary">
              No courses are available at this level yet. You can switch level in Learn, or check back soon.
            </AppText>
          ) : null}
          {courseList.slice(0, HOME_COURSES).map((course) => (
            <CourseCard
              key={course.courseId}
              level={level}
              course={course}
              onPress={() => router.push({ pathname: '/course/[courseId]', params: { courseId: course.courseId, level } })}
            />
          ))}
          {courseList.length > HOME_COURSES ? <SecondaryButton label="See all courses" onPress={() => router.push('/learn')} /> : null}
        </View>

        <View style={{ gap: spacing.md }}>
          {progressUnavailable ? null : (
            <Card onPress={() => router.push('/progress')} accessibilityLabel={`Your progress: ${progressCountsLine(summary, quizzes.length)}.${summary.remainingAtLevel !== null ? ` ${levelProgressLine(level, summary, totalAtLevel)}.` : ''} Open progress.`}>
              <View style={{ gap: spacing.xs }}>
                <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
                  Your progress
                </AppText>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  {progressCountsLine(summary, quizzes.length)}
                </AppText>
                {summary.remainingAtLevel !== null ? (
                  <AppText variant="bodySmall" color="textSecondary">
                    {levelProgressLine(level, summary, totalAtLevel)}
                  </AppText>
                ) : null}
              </View>
            </Card>
          )}
          {saved.length > 0 ? <SecondaryButton size="medium" label={`Saved items (${saved.length})`} onPress={() => router.push('/saved')} /> : null}
        </View>
      </View>
    </ScreenContainer>
  );
}
