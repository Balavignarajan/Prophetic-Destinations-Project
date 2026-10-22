import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useResource } from '@/api/use-resource';
import { AppText, Card, ChevronIcon, EmptyState, PageHeading, ScreenContainer, ScreenSection } from '@/components/ui';
import { ProgressStatusNotice } from '@/features/learning/progress-notice';
import { levelProgressLine, useProgressOverview } from '@/features/learning/progress-overview';
import { loadCourseList } from '@/features/offline/offline-api';
import { ContinueCard } from '@/learning/continue-card';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/**
 * Progress: lessons completed and in progress, the quiz results saved on this device, and a way to continue. Everything comes from this device;
 * the "remaining" count comes from the published catalog at the learner's level (live, or its saved copy) and is left out when that is unknown.
 *
 * There is deliberately NO "overall progress" percentage: the specification does not define the formula (decision C-14). Quiz scores are the
 * latest completed result of each quiz block taken on this device (provisional rule, see QuizResult); a lesson counts as complete on its own,
 * independent of any quiz.
 */
export function ProgressScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, ready } = useLearningLevel();
  const [courses] = useResource(ready ? `courses:${level}` : null, (signal) => loadCourseList(level, signal));
  const courseList = courses.status === 'success' ? courses.data.value.courses : [];
  const total = courses.status === 'success' ? courseList.reduce((sum, course) => sum + course.lessonCount, 0) : null;
  // The same figures Home shows, from one place. When the saved progress could not be read, the empty progress is not "nothing yet": neither the empty
  // state nor zero counts are shown. The lesson to continue is the most recent unfinished one that is still published; the list below keeps every
  // unfinished lesson (the history) and says which ones are no longer available. `verifyAll` asks the server about each of them.
  const { unavailable: progressUnavailable, summary, resume, others, done, quizzes, hasAnything, isUnavailable } = useProgressOverview(level, total, { verifyAll: true });
  // The course name is only known when the resumed lesson is at the level whose course list is loaded.
  const resumeCourse = resume && resume.level === level && resume.courseId ? courseList.find((course) => course.courseId === resume.courseId) : undefined;
  const open = (lessonId: string, lessonLevel: string) => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId, level: lessonLevel } });
  const levelLine = levelProgressLine(level, summary, total);

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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <StatTile value={summary.completed} label="Completed" spoken={`${summary.completed} ${summary.completed === 1 ? 'lesson' : 'lessons'} completed`} />
              <StatTile value={summary.inProgress} label="In progress" spoken={`${summary.inProgress} ${summary.inProgress === 1 ? 'lesson' : 'lessons'} in progress`} />
              <StatTile value={quizzes.length} label={quizzes.length === 1 ? 'Quiz taken' : 'Quizzes taken'} spoken={`${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'} taken`} />
            </View>
            <AppText variant="bodySmall" color="textSecondary">
              {levelLine}
            </AppText>
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
              const gone = isUnavailable(lesson);
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
            {done.map((lesson) => (
              <LessonEntry
                key={`${lesson.lessonId}:${lesson.level}`}
                done
                title={lesson.title}
                meta={`Completed${dateOf(lesson.completedAt) ? ` ${dateOf(lesson.completedAt)}` : ''} · ${LEVEL_LABELS[lesson.level]} level`}
                onPress={() => open(lesson.lessonId, lesson.level)}
                accessibilityLabel={`${lesson.title}, ${LEVEL_LABELS[lesson.level]} level, completed. Open again.`}
              />
            ))}
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
