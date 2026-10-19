import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';

import { ApiError } from '@/api/errors';
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
import { BookmarkButton } from '@/features/bookmarks/bookmark-button';
import { useBookmarks } from '@/features/bookmarks/bookmarks-provider';
import { lessonBookmarkId } from '@/features/bookmarks/model';
import { useLearningProgress } from '@/features/learning/learning-provider';
import { type LessonRef, shouldRestore } from '@/features/learning/progress-model';
import { describeLoadError } from '@/features/offline/describe-offline';
import { loadLesson, loadNavigation } from '@/features/offline/offline-api';
import { OfflineBanner } from '@/features/offline/offline-banner';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { LEVEL_LABELS, firstParam } from '@/learning/levels';
import { useRouteLevel } from '@/learning/use-route-level';
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
  const { level, ready } = useRouteLevel(params.level);
  const [lesson, reload] = useResource(ready ? `lesson:${lessonId}:${level}` : null, (signal) => loadLesson(lessonId, level, signal));
  // Previous / next are a convenience: if the navigation request fails (and nothing is saved) the lesson is still readable.
  const [navigation] = useResource(ready ? `lesson-nav:${lessonId}:${level}` : null, (signal) => loadNavigation(lessonId, level, signal));
  const { has, toggle, remove, setUnavailable } = useBookmarks();
  const { recordOpened, isCompleted, setCompleted, savePosition, positionOf, ready: progressReady } = useLearningProgress();
  useRetryOnReconnect(isRecoverable(lesson), reload);

  const goTo = (target: string) => router.replace({ pathname: '/lesson/[lessonId]', params: { lessonId: target, level } });
  const nav = navigation.status === 'success' ? navigation.data.value : null;
  const next = nav ? nav.next : null;
  const previous = nav ? nav.previous : null;
  const courseId = nav ? nav.courseId : null;

  // unavailable = the backend says it does not exist for the learner (404, or an invalid id); a lesson that is only unpublished is flagged on a saved item
  const notFound = lesson.status === 'error' && lesson.error instanceof ApiError && lesson.error.isUnavailable;
  const unpublished = lesson.status === 'error' && lesson.error instanceof ApiError && lesson.error.isNotFound;
  const snapshotLesson = lesson.status === 'success' ? lesson.data.value.snapshot.lesson : null;
  const title = snapshotLesson?.title ?? null;
  const bookmarkId = lessonBookmarkId(lessonId, level);
  const saved = has(bookmarkId);
  const completed = isCompleted(lessonId, level);

  // Remember what is being read (resume point), and keep a saved lesson's availability flag honest.
  useEffect(() => {
    if (title) recordOpened({ lessonId, level, courseId, title });
  }, [title, lessonId, level, courseId, recordOpened]);
  useEffect(() => {
    if (lesson.status === 'success' && lesson.data.source === 'network') setUnavailable(bookmarkId, false);
    if (unpublished) setUnavailable(bookmarkId, true);
  }, [lesson, unpublished, bookmarkId, setUnavailable]);

  const lessonRef = title ? { lessonId, level, courseId, title } : null;

  // Reading position: the scroll offset is remembered at checkpoints (when scrolling settles, when the app goes to the background
  // and when the lesson is left) and restored the next time an unfinished lesson is opened. A completed lesson opens at the top.
  // The lesson an offset belongs to is captured WHEN IT IS SCROLLED, so moving to the next lesson can never save the old
  // lesson's offset against the new one.
  const scrollRef = useRef<ScrollView>(null);
  const latest = useRef<{ lesson: LessonRef; offset: number } | null>(null);
  const restore = useRef<number | null>(null);
  const restoredFor = useRef<string | null>(null);
  const live = useRef({ lessonRef, completed });
  useEffect(() => {
    live.current = { lessonRef, completed };
  });
  const flush = useCallback(() => {
    const pending = latest.current;
    if (pending) savePosition(pending.lesson, pending.offset); // the provider ignores completed lessons
  }, [savePosition]);

  const restoreKey = `${lessonId}:${level}`;
  useEffect(() => {
    restore.current = null;
    restoredFor.current = null;
    return () => {
      flush();
      latest.current = null;
    };
  }, [restoreKey, flush]);
  useEffect(() => {
    if (!title || !progressReady || restoredFor.current === restoreKey) return;
    restoredFor.current = restoreKey;
    const saved = positionOf(lessonId, level);
    restore.current = !completed && saved && shouldRestore(saved.offset) ? saved.offset : null;
  }, [title, progressReady, restoreKey, lessonId, level, completed, positionOf]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });
    return () => subscription.remove();
  }, [flush]);

  const scrollEvents = {
    scrollEventThrottle: 100,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const current = live.current.lessonRef;
      if (current && !live.current.completed) latest.current = { lesson: current, offset: y };
      // The learner moved on their own: never pull them back to an older position.
      if (restore.current !== null && y > 0) restore.current = null;
    },
    onScrollEndDrag: flush,
    onMomentumScrollEnd: flush,
    onContentSizeChange: (_width: number, height: number) => {
      const target = restore.current;
      if (target === null || height < target + 200) return; // the lesson has not finished laying out yet
      restore.current = null;
      scrollRef.current?.scrollTo({ y: target, animated: false });
    },
  };

  return (
    <ScreenContainer scroll scrollRef={scrollRef} scrollEvents={scrollEvents}>
      <ScreenHeader
        title="Lesson"
        trailing={
          title ? (
            <BookmarkButton
              saved={saved}
              noun="lesson"
              onToggle={() => toggle({ id: bookmarkId, type: 'lesson', lessonId, level, courseId, title, savedAt: Date.now() })}
            />
          ) : null
        }
      />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {lesson.status === 'loading' ? <LoadingState message="Loading lesson…" /> : null}

        {notFound ? (
          <EmptyState
            title="Lesson not available"
            message={`This lesson is not published at the ${LEVEL_LABELS[level]} level, or it is no longer available.`}
            action={{ label: 'Back', onPress: () => (router.canGoBack() ? router.back() : router.replace('/learn')) }}
          />
        ) : null}

        {notFound && saved ? (
          <SecondaryButton label="Remove from saved items" onPress={() => remove(bookmarkId)} />
        ) : null}

        {lesson.status === 'error' && !notFound ? <ErrorState {...describeLoadError(lesson.error, 'lesson')} onRetry={reload} /> : null}

        {lesson.status === 'success' && lesson.data.source === 'cache' ? <OfflineBanner loaded={lesson.data} onRetry={reload} /> : null}

        {lesson.status === 'success' ? <LessonBody lessonBlocks={lesson.data.value.snapshot.blocks} snapshotLesson={lesson.data.value.snapshot.lesson} level={level} /> : null}

        {lesson.status === 'success' ? (
          <View style={{ gap: spacing.md }}>
            <Divider />
            {lessonRef ? (
              <SecondaryButton
                label={completed ? 'Completed. Tap to undo' : 'Mark lesson as complete'}
                onPress={() => setCompleted(lessonRef, !completed)}
              />
            ) : null}
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
