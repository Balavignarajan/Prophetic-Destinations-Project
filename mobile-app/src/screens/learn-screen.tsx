import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { describeError } from '@/api/errors';
import { listCourses } from '@/api/learner-api';
import { useResource } from '@/api/use-resource';
import {
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  ScreenContainer,
  ScreenHeader,
  SettingsIcon,
} from '@/components/ui';
import { CourseCard } from '@/learning/course-card';
import { LevelSelector } from '@/learning/level-selector';
import { LEVEL_LABELS } from '@/learning/levels';
import { useLearningLevel } from '@/learning/use-learning-level';
import { useTheme } from '@/theme';

/** The course catalog: the published courses at the chosen learning level, from the backend. */
export function LearnScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { level, setLevel, ready } = useLearningLevel();
  const [courses, reload] = useResource(ready ? `courses:${level}` : null, (signal) => listCourses(level, signal));

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Courses"
        trailing={
          <IconButton accessibilityLabel="Settings" tone="ghost" onPress={() => router.push('/settings')}>
            <SettingsIcon />
          </IconButton>
        }
      />
      <View style={{ gap: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        <LevelSelector value={level} onChange={setLevel} />

        {courses.status === 'loading' ? <LoadingState message="Loading courses…" /> : null}

        {courses.status === 'error' ? (
          <ErrorState {...describeError(courses.error)} onRetry={reload} />
        ) : null}

        {courses.status === 'success' && courses.data.courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            message={`There are no published courses at the ${LEVEL_LABELS[level]} level right now. Try another level, or check back soon.`}
            action={{ label: 'Refresh', onPress: reload }}
          />
        ) : null}

        {courses.status === 'success'
          ? courses.data.courses.map((course) => (
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
