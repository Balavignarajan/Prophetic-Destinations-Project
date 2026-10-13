import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ApiError, describeError } from '@/api/errors';
import { getLesson, getNavigation } from '@/api/learner-api';
import type { LessonSnapshotBlock } from '@/api/types';
import { useResource } from '@/api/use-resource';
import {
  AppText,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ScreenContainer,
  ScreenHeader,
  SecondaryButton,
} from '@/components/ui';
import { LEVEL_LABELS, firstParam, levelFromParam } from '@/learning/levels';
import { RichTextContent } from '@/learning/rich-text';
import { useTheme } from '@/theme';

/** The block types this version of the app can show. The backend enables only RICH_TEXT today. */
const SUPPORTED_BLOCKS = new Set(['RICH_TEXT']);

/**
 * The lesson reader: the published snapshot of a lesson at one level, shown in its published order.
 * Nothing is added to the content: no invented text, no Bible text. Block types other than RICH_TEXT are not shown,
 * and the reader says so rather than hiding it.
 */
export function LessonScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ lessonId: string; level?: string }>();
  const lessonId = firstParam(params.lessonId);
  const level = levelFromParam(params.level);
  const [lesson, reload] = useResource(`lesson:${lessonId}:${level}`, (signal) => getLesson(lessonId, level, signal));
  // Previous / next are a convenience: if the navigation request fails the lesson is still readable.
  const [navigation] = useResource(`lesson-nav:${lessonId}:${level}`, (signal) => getNavigation(lessonId, level, signal));

  const goTo = (target: string) => router.replace({ pathname: '/lesson/[lessonId]', params: { lessonId: target, level } });
  const next = navigation.status === 'success' ? navigation.data.next : null;
  const previous = navigation.status === 'success' ? navigation.data.previous : null;
  const courseId = navigation.status === 'success' ? navigation.data.courseId : null;

  const notFound = lesson.status === 'error' && lesson.error instanceof ApiError && lesson.error.isNotFound;

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Lesson" />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {lesson.status === 'loading' ? <LoadingState message="Loading lesson…" /> : null}

        {notFound ? (
          <EmptyState
            title="Lesson not available"
            message={`This lesson is not published at the ${LEVEL_LABELS[level]} level, or it is no longer available.`}
            action={{ label: 'Back', onPress: () => (router.canGoBack() ? router.back() : router.replace('/learn')) }}
          />
        ) : null}

        {lesson.status === 'error' && !notFound ? <ErrorState {...describeError(lesson.error)} onRetry={reload} /> : null}

        {lesson.status === 'success' ? <LessonBody lessonBlocks={lesson.data.snapshot.blocks} snapshotLesson={lesson.data.snapshot.lesson} level={level} /> : null}

        {lesson.status === 'success' ? (
          <View style={{ gap: spacing.md }}>
            <Divider />
            {next ? (
              <PrimaryButton label="Continue" onPress={() => goTo(next.lessonId)} />
            ) : navigation.status === 'success' ? (
              <AppText variant="bodySmall" color="textMuted" align="center">
                You have reached the end of this course.
              </AppText>
            ) : null}
            {next ? (
              <AppText variant="caption" color="textMuted" align="center">
                Next: {next.title}
              </AppText>
            ) : null}
            {previous ? <SecondaryButton label="Previous lesson" onPress={() => goTo(previous.lessonId)} /> : null}
            {courseId ? (
              <SecondaryButton
                label="Back to course"
                onPress={() => router.replace({ pathname: '/course/[courseId]', params: { courseId, level } })}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function LessonBody({
  lessonBlocks,
  snapshotLesson,
  level,
}: {
  lessonBlocks: LessonSnapshotBlock[];
  snapshotLesson: { title: string; subtitle: string | null; introduction: string | null; estimatedMinutes: number | null };
  level: keyof typeof LEVEL_LABELS;
}) {
  const { spacing } = useTheme();
  const ordered = [...lessonBlocks].sort((a, b) => a.ordinal - b.ordinal);
  const shown = ordered.filter((block) => SUPPORTED_BLOCKS.has(block.type));
  const skipped = ordered.length - shown.length;
  const introduction = snapshotLesson.introduction?.split(/\n\s*\n/).filter((part) => part.trim().length > 0) ?? [];

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color="primaryHighlight">
          {LEVEL_LABELS[level]} level{snapshotLesson.estimatedMinutes ? ` · ${snapshotLesson.estimatedMinutes} min` : ''}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {snapshotLesson.title}
        </AppText>
        {snapshotLesson.subtitle ? (
          <AppText variant="subtitle" color="primaryHighlight">
            {snapshotLesson.subtitle}
          </AppText>
        ) : null}
      </View>

      {introduction.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          {introduction.map((paragraph, index) => (
            <AppText key={index} variant="body" color="textSecondary">
              {paragraph.trim()}
            </AppText>
          ))}
        </View>
      ) : null}

      {shown.map((block) => (
        <RichTextContent key={block.blockId} content={block.content} />
      ))}

      {shown.length === 0 && introduction.length === 0 ? (
        <EmptyState title="Nothing to read yet" message="This lesson has no readable content at this level." />
      ) : null}

      {skipped > 0 ? (
        <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
          {skipped === 1 ? 'One part' : `${skipped} parts`} of this lesson cannot be shown in this version of the app yet.
        </AppText>
      ) : null}
    </View>
  );
}
