import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useResource } from '@/api/use-resource';
import { AppText, Card, ChevronIcon, EmptyState, PageHeading, ScreenContainer, ScreenSection } from '@/components/ui';
import { type LevelProgress, completedByLevel, completedByLevelLine, isMissingFromCatalog, levelProgressLine, publishedLessonsOf } from '@/features/learning/catalog-progress';
import { ProgressStatusNotice } from '@/features/learning/progress-notice';
import { useProgressOverview } from '@/features/learning/progress-overview';
import { useLessonTitleSync } from '@/features/learning/use-lesson-title-sync';
import { loadCourseList } from '@/features/offline/offline-api';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { ContinueCard } from '@/learning/continue-card';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/**
 * Progress: lessons completed and in progress, the quiz results saved on this device, and a way to continue. Everything comes from this device;
 * "completed of available" and "remaining" for the learner's level come from the published catalog at that level (live, or its saved copy) and are left
 * out when that is unknown. Only lessons that are available now count toward the total, so a lesson that was completed and later unpublished never makes
 * the count exceed it.
 *
 * Scope is stated on screen and never mixed: the level card is the SELECTED level against its published catalog; the tiles are ALL levels, as recorded on this
 * device; "completed by level" is the per-level split of those same completions (no catalog needed, so it is true offline). Each level keeps its own completions,
 * positions and quiz results (they are keyed by lesson AND level), so switching level shows that level's figures and changes none of the others.
 *
 * There is deliberately NO "overall progress" percentage: the specification does not define the formula (decision C-14). Quiz scores are the
 * latest completed result of each quiz block taken on this device (provisional rule, see QuizResult); a lesson counts as complete on its own,
 * independent of any quiz.
 */
export function ProgressScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, ready } = useLearningLevel();
  const [courses, reloadCourses] = useResource(ready ? `courses:${level}` : null, (signal) => loadCourseList(level, signal));
  // When the totals below come from the saved course list, they are refreshed as soon as the connection is back.
  useRetryOnReconnect(isRecoverable(courses), reloadCourses);
  const courseList = courses.status === 'success' ? courses.data.value.courses : [];
  const catalogLive = courses.status === 'success' && courses.data.source === 'network';
  const published = useMemo(() => (courses.status === 'success' ? publishedLessonsOf(courses.data.value.courses) : null), [courses]);
  // The same figures Home shows, from one place. When the saved progress could not be read, the empty progress is not "nothing yet": neither the empty
  // state nor zero counts are shown. The lesson to continue is the most recent unfinished one that is still published; the list below keeps every
  // unfinished lesson (the history) and says which ones are no longer available. `verifyAll` asks the server about each of them.
  const { unavailable: progressUnavailable, summary, levelProgress, resume, others, done, quizzes, hasAnything, isUnavailable } = useProgressOverview(level, published, { verifyAll: true });
  // A lesson renamed in the CMS is titled by the live catalog: the titles saved with the learner's progress (lessons in progress, completed, quiz results) are brought up
  // to date, titles only (completion dates, positions and scores are untouched), and stay the fallback while offline.
  const listedAtLevel = [...(resume ? [resume] : []), ...others, ...done, ...quizzes].filter((entry) => entry.level === level).map((entry) => entry.lessonId);
  useLessonTitleSync({ level, courses: courseList, live: catalogLive, lessonIds: listedAtLevel });
  // A lesson the live catalog no longer lists keeps its place in the history but is not described as somewhere to go; a saved copy of the catalog never says this.
  const isGone = (lesson: { lessonId: string; level: typeof level }) => isUnavailable(lesson) || isMissingFromCatalog(published, catalogLive, lesson, level);
  // The course name is only known when the resumed lesson is at the level whose course list is loaded.
  const resumeCourse = resume && resume.level === level && resume.courseId ? courseList.find((course) => course.courseId === resume.courseId) : undefined;
  const open = (lessonId: string, lessonLevel: string) => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId, level: lessonLevel } });
  const levelLine = levelProgressLine(level, levelProgress);
  // What is counted, and over what, is said on screen: the tiles are ALL levels (what this device recorded), the level card is the selected level against the catalog.
  // The per-level completed counts need no catalog, so they are true offline as well.
  const byLevelLine = completedByLevelLine(completedByLevel(done));
  // The lesson total of the selected level needs its course list. If that could not be loaded and nothing is saved, the total and the remaining count are said to be
  // unavailable (never guessed, never zero), and the completed lessons already recorded are unaffected.
  const totalsUnavailable = courses.status === 'error' && levelProgress.kind === 'unknown' && levelProgress.available === null;

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <PageHeading title="Your Progress" description="See how far you've come in your learning journey." />

        <ProgressStatusNotice />

        {progressUnavailable ? null : !hasAnything ? (
          <EmptyState
            variant="card"
            title="Your journey starts here"
            message="Lessons you start appear here, so you can pick up where you stopped. Completed lessons and quiz results are listed too. Everything is kept on this device."
            action={{ label: 'Browse courses', onPress: () => router.push('/learn') }}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {levelProgress.kind === 'counts' ? <LevelCountsCard level={level} progress={levelProgress} spoken={levelLine} /> : null}
            {levelProgress.kind === 'counts' ? null : (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="bodySmall" color="textSecondary">
                  {levelLine}
                </AppText>
                {totalsUnavailable ? (
                  <AppText variant="bodySmall" color="textMuted">
                    The lesson total for this level cannot be loaded right now, so the remaining count is not shown. Your completed lessons are kept on this device.
                  </AppText>
                ) : null}
              </View>
            )}
            <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
              All levels on this device
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <StatTile value={summary.completed} label="Completed" spoken={`${summary.completed} ${summary.completed === 1 ? 'lesson' : 'lessons'} completed across all levels`} />
              <StatTile value={summary.inProgress} label="In progress" spoken={`${summary.inProgress} ${summary.inProgress === 1 ? 'lesson' : 'lessons'} in progress across all levels`} />
              <StatTile value={quizzes.length} label={quizzes.length === 1 ? 'Quiz taken' : 'Quizzes taken'} spoken={`${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'} taken across all levels`} />
            </View>
            <AppText variant="bodySmall" color="textMuted">
              {byLevelLine}
            </AppText>
            {/* The totals come from the course list saved on this device when the live one could not be reached: they may be out of date, and are refreshed once the connection is back. */}
            {courses.status === 'success' && courses.data.source === 'cache' && levelProgress.kind !== 'unknown' ? (
              <AppText variant="bodySmall" color="textMuted">
                Lesson totals come from the course list saved on this device. They update when you are back online.
              </AppText>
            ) : null}
          </View>
        )}

        {resume ? (
          <ContinueCard
            lessonTitle={resume.title}
            courseTitle={resumeCourse?.title}
            level={resume.level}
            onPress={() => open(resume.lessonId, resume.level)}
          />
        ) : null}

        {others.length > 0 ? (
          <ScreenSection title={resume ? 'Also in progress' : 'In progress'}>
            {others.map((lesson) => {
              // Your place in a lesson that is no longer published is kept (and shown), but it is not described as somewhere to continue.
              const gone = isGone(lesson);
              return (
                <LessonEntry
                  key={`${lesson.lessonId}:${lesson.level}`}
                  title={lesson.title}
                  meta={`${LEVEL_LABELS[lesson.level]} level${gone ? ' · No longer available' : dateOf(lesson.at) ? ` · Last visited ${dateOf(lesson.at)}` : ''}`}
                  onPress={() => open(lesson.lessonId, lesson.level)}
                  accessibilityLabel={gone ? `${lesson.title}, ${LEVEL_LABELS[lesson.level]} level, no longer available. Open for details.` : `Continue ${lesson.title}, ${LEVEL_LABELS[lesson.level]} level`}
                />
              );
            })}
          </ScreenSection>
        ) : null}

        {done.length > 0 ? (
          <ScreenSection title="Completed">
            {done.map((lesson) => {
              // The completion stays on record whatever happens to the lesson; one that is no longer published is said to be, and is not offered as "open again".
              const gone = isGone(lesson);
              return (
                <LessonEntry
                  key={`${lesson.lessonId}:${lesson.level}`}
                  done
                  title={lesson.title}
                  meta={`Completed${dateOf(lesson.completedAt) ? ` ${dateOf(lesson.completedAt)}` : ''} · ${LEVEL_LABELS[lesson.level]} level${gone ? ' · No longer available' : ''}`}
                  onPress={() => open(lesson.lessonId, lesson.level)}
                  accessibilityLabel={
                    gone
                      ? `${lesson.title}, ${LEVEL_LABELS[lesson.level]} level, completed, no longer available. Open for details.`
                      : `${lesson.title}, ${LEVEL_LABELS[lesson.level]} level, completed. Open again.`
                  }
                />
              );
            })}
          </ScreenSection>
        ) : null}

        {quizzes.length > 0 ? (
          <ScreenSection title="Quiz results" description="Your latest result for each quiz, saved on this device.">
            {quizzes.map((quiz) => (
              <Card
                key={`${quiz.lessonId}:${quiz.level}:${quiz.blockId}`}
                onPress={() => open(quiz.lessonId, quiz.level)}
                accessibilityLabel={`Quiz in ${quiz.lessonTitle || 'a lesson'}, ${LEVEL_LABELS[quiz.level]} level. Latest score ${quiz.score} of ${quiz.total}. Open the lesson.`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="body" style={{ fontWeight: '600' }}>
                      {quiz.lessonTitle || 'Lesson quiz'}
                    </AppText>
                    <AppText variant="bodySmall" color="textMuted">
                      {[dateOf(quiz.completedAt), `${LEVEL_LABELS[quiz.level]} level`].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <AppText variant="heading" color="primaryHighlight">
                      {quiz.score} of {quiz.total}
                    </AppText>
                    <AppText variant="bodySmall" color="textMuted">
                      correct
                    </AppText>
                  </View>
                  <ChevronIcon direction="right" color="textMuted" />
                </View>
              </Card>
            ))}
          </ScreenSection>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function dateOf(time: number): string {
  try {
    return new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '';
  }
}

/**
 * Lessons completed out of the lessons available at the learner's level, and how many remain. Counts only: there is no percentage because the documents do
 * not define one (decision C-14).
 */
function LevelCountsCard({ level, progress, spoken }: { level: keyof typeof LEVEL_LABELS; progress: Extract<LevelProgress, { kind: 'counts' }>; spoken: string }) {
  const { spacing } = useTheme();
  return (
    <Card>
      <View accessible accessibilityLabel={spoken} style={{ gap: spacing.xs }}>
        <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '600' }}>
          {LEVEL_LABELS[level]} level · your selected level
        </AppText>
        <AppText variant="title" color="primaryHighlight">
          {progress.completed} of {progress.total}
        </AppText>
        <AppText variant="bodySmall" color="textSecondary">
          {progress.total === 1 ? 'lesson' : 'lessons'} completed{progress.remaining > 0 ? ` · ${progress.remaining} remaining` : ' · none remaining'}
        </AppText>
      </View>
    </Card>
  );
}

/** One count, big, with its label. Wraps onto a new line on a narrow screen or at a large font size. */
function StatTile({ value, label, spoken }: { value: number; label: string; spoken: string }) {
  const { spacing } = useTheme();
  return (
    <Card style={{ flexGrow: 1, flexBasis: 96 }}>
      <View accessible accessibilityLabel={spoken} style={{ gap: spacing.xs }}>
        <AppText variant="title" color="primaryHighlight">
          {value}
        </AppText>
        <AppText variant="bodySmall" color="textSecondary">
          {label}
        </AppText>
      </View>
    </Card>
  );
}

/** A lesson in a list. Completed lessons carry a check badge AND the word "Completed", so the state is never colour alone. */
function LessonEntry({
  title,
  meta,
  done = false,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  meta: string;
  done?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {done ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} allowFontScaling={false}>
              ✓
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" style={{ fontWeight: '600' }}>
            {title}
          </AppText>
          <AppText variant="bodySmall" color={done ? 'success' : 'textMuted'} style={done ? { fontWeight: '600' } : undefined}>
            {meta}
          </AppText>
        </View>
        <ChevronIcon direction="right" color="textMuted" />
      </View>
    </Card>
  );
}
