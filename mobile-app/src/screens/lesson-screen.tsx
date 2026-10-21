import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
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
import { type OwnerStatus, mediaOwnerKey, useOfflineMedia } from '@/features/offline/offline-media';
import { isRecoverable, useRetryOnReconnect } from '@/features/offline/use-retry-on-reconnect';
import { LEVEL_LABELS, firstParam } from '@/learning/levels';
import { useRouteLevel } from '@/learning/use-route-level';
import { CoverImage, lessonCoverUrl } from '@/learning/cover-image';
import { LessonContents, MIN_SECTIONS_FOR_CONTENTS, lessonSections } from '@/learning/lesson-contents';
import { LessonHeader } from '@/learning/lesson-header';
import { LessonImage } from '@/learning/lesson-image';
import { RichTextContent } from '@/learning/rich-text';
import { HotspotImage } from '@/learning/hotspot-image';
import { RelatedLessons } from '@/learning/related-lessons';
import { CalloutBlock } from '@/learning/callout-block';
import { ContinueExploringBlock } from '@/learning/continue-exploring-block';
import { ExploreDeeperBlock } from '@/learning/explore-deeper-block';
import { AnimatedImageBlock, NarrativeSceneBlock } from '@/learning/scene-media-blocks';
import { GuidedQuestionBlock, StudyActivityBlock } from '@/learning/study-prompt-blocks';
import { CalculationBlock, ComparisonBlock, EquivalenceBlock } from '@/learning/prophecy-blocks';
import { SymbolStudyBlock, WordStudyBlock } from '@/learning/word-symbol-blocks';
import { ScriptureConnectionBlock } from '@/learning/scripture-connection-block';
import { SectionIntroBlock } from '@/learning/section-intro-block';
import { EvidenceBlock } from '@/learning/evidence-block';
import { ScripturePassage } from '@/learning/scripture-passage';
import { TimelineContent } from '@/learning/timeline-block';
import { QuizContent } from '@/learning/quiz-block';
import { SummaryContent } from '@/learning/summary-block';
import { useTheme } from '@/theme';

/** The block types this version of the app can show. The backend enables RICH_TEXT, IMAGE, SUMMARY, QUIZ, INTERACTIVE_IMAGE and TIMELINE today. */
const SUPPORTED_BLOCKS = new Set(['RICH_TEXT', 'IMAGE', 'SUMMARY', 'QUIZ', 'INTERACTIVE_IMAGE', 'TIMELINE', 'SCRIPTURE_PASSAGE', 'HISTORICAL_EVIDENCE', 'SECTION_INTRO', 'CALLOUT', 'SCRIPTURE_CONNECTION', 'MAP', 'EXPLORE_DEEPER', 'WORD_STUDY', 'SYMBOL_STUDY', 'PROPHECY_EQUIVALENCE', 'PROPHECY_COMPARISON', 'PROPHECY_CALCULATION', 'REFLECTION_STUDY_ACTIVITY', 'GUIDED_DISCOVERY_QUESTION', 'CONTINUE_EXPLORING', 'NARRATIVE_SCENE', 'MEDIA_ANIMATION']);

/** What to tell the learner about offline saving of this lesson, or null when nothing needs saying. */
function offlineNote(status: OwnerStatus, showingSavedCopy: boolean): string | null {
  switch (status) {
    case 'saving':
      return 'Saving images for offline reading…';
    case 'updating':
      return showingSavedCopy
        ? 'You are reading an older saved version. The newest version is still being saved for offline reading.'
        : 'Saving the newest version for offline reading… Until it is finished, the older saved version is kept for offline use.';
    case 'update-failed':
      return 'Some images of the newest version are not saved yet, so the older saved version is still the one kept for offline reading. Open the lesson again with an internet connection to retry.';
    case 'incomplete':
      return 'Some images are not saved for offline reading. They are saved when you open the lesson with an internet connection.';
    case 'unknown':
      return showingSavedCopy ? 'The text is saved for offline reading. Its images are saved when you open the lesson with an internet connection.' : null;
    default:
      return null;
  }
}

/**
 * The lesson reader: the published snapshot of a lesson at one level, shown in its published order.
 * Nothing is added to the content: no invented text, no Bible text. Block types other than RICH_TEXT, IMAGE, SUMMARY, QUIZ, INTERACTIVE_IMAGE and TIMELINE are not shown,
 * and the reader says so rather than hiding it.
 */
export function LessonScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ lessonId: string; level?: string }>();
  const lessonId = firstParam(params.lessonId);
  const { level, ready } = useRouteLevel(params.level);
  const offlineMedia = useOfflineMedia();
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

  // Reading position (NOT completion, never stored): derived from the scroll state. Only the integer percent is state, and it only
  // changes when the rounded value does, so the lesson body (memoised below) is not re-rendered while scrolling.
  const reduceMotion = useReduceMotion();
  const metrics = useRef({ content: 0, viewport: 0, offset: 0 });
  const [percent, setPercent] = useState<number | null>(null);
  const updatePercent = useCallback(() => {
    const { content, viewport, offset } = metrics.current;
    const scrollable = content - viewport;
    if (viewport <= 0 || scrollable < 80) {
      setPercent(null); // a short lesson fits on screen: no progress to show
      return;
    }
    setPercent(Math.round(Math.min(1, Math.max(0, offset / scrollable)) * 100));
  }, []);

  const handleScroll = scrollEvents.onScroll;
  const handleContentSize = scrollEvents.onContentSizeChange;
  const trackedEvents = {
    ...scrollEvents,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      metrics.current.offset = event.nativeEvent.contentOffset.y;
      handleScroll(event);
      updatePercent();
    },
    onContentSizeChange: (width: number, height: number) => {
      metrics.current.content = height;
      handleContentSize(width, height);
      updatePercent();
    },
  };

  // Lesson contents: only when the published lesson has at least two titled SECTION_INTRO blocks. Their positions are measured as they are
  // laid out (so late-loading images and larger fonts stay accurate) and read when a section is chosen.
  const sections = useMemo(() => (lesson.status === 'success' ? lessonSections(lesson.data.value.snapshot.blocks) : []), [lesson]);
  const [contentsOpen, setContentsOpen] = useState(false);
  const layoutY = useRef({ column: 0, body: 0, sections: {} as Record<string, number> });
  const onBodyLayout = useCallback((y: number) => {
    layoutY.current.body = y;
  }, []);
  const onSectionLayout = useCallback((blockId: string, y: number) => {
    layoutY.current.sections[blockId] = y;
  }, []);
  const jumpToSection = (blockId: string) => {
    const y = layoutY.current.sections[blockId];
    setContentsOpen(false);
    if (y === undefined) return;
    restore.current = null; // the learner chose where to read: never pull them back to an older position
    scrollRef.current?.scrollTo({ y: Math.max(0, layoutY.current.column + layoutY.current.body + y - 8), animated: !reduceMotion });
  };

  // Brings part of a block back into view after it changed shape (a new quiz question, a hotspot's detail panel). A block's own position is
  // measured like a section's, and `localY` is measured inside the block. Nothing moves when the part is already on screen, and answering or
  // an image loading never calls this.
  const revealInBlock = useCallback(
    (blockId: string, localY: number, height: number) => {
      const blockY = layoutY.current.sections[blockId];
      if (blockY === undefined) return;
      const top = layoutY.current.column + layoutY.current.body + blockY + localY;
      const bottom = top + height;
      const { offset, viewport } = metrics.current;
      const margin = 16;
      let target: number | null = null;
      if (top < offset) target = top - margin;
      else if (bottom > offset + viewport) target = Math.min(top - margin, bottom - viewport + margin);
      if (target === null) return;
      restore.current = null; // the learner is interacting: never pull them back to an older position
      scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: !reduceMotion });
    },
    [reduceMotion],
  );
  const scrollToBlockTop = useCallback((blockId: string) => {
    const blockY = layoutY.current.sections[blockId];
    if (blockY === undefined) return;
    const top = layoutY.current.column + layoutY.current.body + blockY;
    if (metrics.current.offset <= top) return; // the top of the block is still on screen
    restore.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, top - 8), animated: false }));
  }, []);

  return (
    <ScreenContainer>
      <LessonHeader
        title={snapshotLesson ? (snapshotLesson.shortTitle || snapshotLesson.title) : 'Lesson'}
        percent={percent}
        onContents={sections.length >= MIN_SECTIONS_FOR_CONTENTS ? () => setContentsOpen(true) : undefined}
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
      <ScrollView
        ref={scrollRef}
        {...trackedEvents}
        onLayout={(event) => {
          metrics.current.viewport = event.nativeEvent.layout.height;
          updatePercent();
        }}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
      <View
        onLayout={(event) => {
          layoutY.current.column = event.nativeEvent.layout.y;
        }}
        style={{ gap: spacing.xl }}>
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

        {lesson.status === 'success' && offlineNote(offlineMedia.status(mediaOwnerKey('lesson', lessonId, level)), lesson.data.source === 'cache') ? (
          <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
            {offlineNote(offlineMedia.status(mediaOwnerKey('lesson', lessonId, level)), lesson.data.source === 'cache')}
          </AppText>
        ) : null}

        {lesson.status === 'success' ? <LessonBody lessonId={lessonId} contentHash={lesson.data.value.contentHash} lessonBlocks={lesson.data.value.snapshot.blocks} snapshotLesson={lesson.data.value.snapshot.lesson} level={level} onBodyLayout={onBodyLayout} onSectionLayout={onSectionLayout} onRevealInBlock={revealInBlock} onBlockStep={scrollToBlockTop} /> : null}

        {lesson.status === 'success' ? <RelatedLessons lessonId={lessonId} level={level} contentHash={lesson.data.value.contentHash} /> : null}

        {lesson.status === 'success' ? (
          <View style={{ gap: spacing.lg }}>
            <Divider />
            {completed ? (
              <AppText variant="bodySmall" color="success" align="center" style={{ fontWeight: '700' }}>
                ✓ This lesson is marked complete
              </AppText>
            ) : null}
            {/* Manual completion is unchanged. It is the dominant action only when there is no next lesson to continue to. */}
            {lessonRef ? (
              !next && !completed ? (
                <PrimaryButton label="Mark lesson as complete" onPress={() => setCompleted(lessonRef, true)} />
              ) : (
                <SecondaryButton
                  size="medium"
                  label={completed ? 'Completed. Tap to undo' : 'Mark lesson as complete'}
                  onPress={() => setCompleted(lessonRef, !completed)}
                />
              )
            ) : null}
            {next ? (
              <View style={{ gap: spacing.sm }}>
                <PrimaryButton label="Continue" onPress={() => goTo(next.lessonId)} />
                <AppText variant="bodySmall" color="textSecondary" align="center">
                  Next: {next.title}
                </AppText>
              </View>
            ) : navigation.status === 'success' ? (
              <AppText variant="bodySmall" color="textMuted" align="center">
                You have reached the end of this course.
              </AppText>
            ) : null}
            {previous || courseId ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {previous ? (
                  <SecondaryButton size="small" label="Previous lesson" onPress={() => goTo(previous.lessonId)} style={{ flexGrow: 1, flexBasis: 140 }} />
                ) : null}
                {courseId ? (
                  <SecondaryButton
                    size="small"
                    label="Back to course"
                    onPress={() => router.replace({ pathname: '/course/[courseId]', params: { courseId, level } })}
                    style={{ flexGrow: 1, flexBasis: 140 }}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      </ScrollView>

      <LessonContents visible={contentsOpen} sections={sections} onSelect={jumpToSection} onClose={() => setContentsOpen(false)} />
    </ScreenContainer>
  );
}

const LessonBody = memo(function LessonBody({
  lessonId,
  contentHash,
  lessonBlocks,
  snapshotLesson,
  level,
  onBodyLayout,
  onSectionLayout,
  onRevealInBlock,
  onBlockStep,
}: {
  lessonId: string;
  /** Identifies the published version shown, so quiz answers never carry over to another publication. */
  contentHash: string;
  lessonBlocks: LessonSnapshotBlock[];
  snapshotLesson: { title: string; subtitle: string | null; introduction: string | null; estimatedMinutes: number | null; coverMediaId: string | null };
  level: keyof typeof LEVEL_LABELS;
  /** Where this body starts inside its column, and where each SECTION_INTRO block starts inside the body (for the contents sheet). */
  onBodyLayout: (y: number) => void;
  onSectionLayout: (blockId: string, y: number) => void;
  /** Scrolls the lesson so part of a block (a hotspot's detail panel) is visible. Positions are inside the block. */
  onRevealInBlock: (blockId: string, localY: number, height: number) => void;
  /** Called when a quiz shows a different question or screen, so the lesson can bring its top back into view. */
  onBlockStep: (blockId: string) => void;
}) {
  const { spacing, colors } = useTheme();
  const ordered = [...lessonBlocks].sort((a, b) => a.ordinal - b.ordinal);
  const shown = ordered.filter((block) => SUPPORTED_BLOCKS.has(block.type));
  const skipped = ordered.length - shown.length;
  // The lesson cover is shown only when no block already shows the same picture.
  const showCover = !ordered.some((block) => blockMediaIds(block.content).includes(snapshotLesson.coverMediaId ?? ''));
  const introduction = snapshotLesson.introduction?.split(/\n\s*\n/).filter((part) => part.trim().length > 0) ?? [];

  return (
    <View style={{ gap: spacing.xl }} onLayout={(event) => onBodyLayout(event.nativeEvent.layout.y)}>
      <View style={{ gap: spacing.lg }}>
        {showCover && snapshotLesson.coverMediaId ? (
          <CoverImage mediaId={snapshotLesson.coverMediaId} uri={lessonCoverUrl(lessonId, snapshotLesson.coverMediaId, level)} width="100%" height={200} />
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '600' }}>
            {LEVEL_LABELS[level]} level{snapshotLesson.estimatedMinutes ? ` · ${snapshotLesson.estimatedMinutes} min read` : ''}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {snapshotLesson.title}
          </AppText>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 2, backgroundColor: colors.primary }} />
          {snapshotLesson.subtitle ? (
            <AppText variant="subtitle" color="textSecondary">
              {snapshotLesson.subtitle}
            </AppText>
          ) : null}
        </View>
        {introduction.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            {introduction.map((paragraph, index) => (
              <AppText key={index} variant="body" style={{ fontSize: 17, lineHeight: 28 }}>
                {paragraph.trim()}
              </AppText>
            ))}
          </View>
        ) : null}
        {shown.length > 0 ? <Divider /> : null}
      </View>

      {shown.map((block) =>
        block.type === 'SECTION_INTRO' ? (
          <View key={block.blockId} onLayout={(event) => onSectionLayout(block.blockId, event.nativeEvent.layout.y)}>
            <SectionIntroBlock lessonId={lessonId} level={level} content={block.content} />
          </View>
        ) : block.type === 'IMAGE' ? (
          <LessonImage key={block.blockId} lessonId={lessonId} level={level} content={block.content} />
        ) : block.type === 'PROPHECY_EQUIVALENCE' ? (
          <EquivalenceBlock key={block.blockId} content={block.content} />
        ) : block.type === 'PROPHECY_COMPARISON' ? (
          <ComparisonBlock key={block.blockId} content={block.content} />
        ) : block.type === 'PROPHECY_CALCULATION' ? (
          <CalculationBlock key={block.blockId} content={block.content} />
        ) : block.type === 'REFLECTION_STUDY_ACTIVITY' ? (
          <StudyActivityBlock key={block.blockId} content={block.content} />
        ) : block.type === 'GUIDED_DISCOVERY_QUESTION' ? (
          <GuidedQuestionBlock key={block.blockId} content={block.content} />
        ) : block.type === 'CONTINUE_EXPLORING' ? (
          <ContinueExploringBlock key={block.blockId} lessonId={lessonId} blockId={block.blockId} level={level} contentHash={contentHash} content={block.content} />
        ) : block.type === 'NARRATIVE_SCENE' ? (
          <NarrativeSceneBlock key={block.blockId} lessonId={lessonId} level={level} content={block.content} />
        ) : block.type === 'MEDIA_ANIMATION' ? (
          <AnimatedImageBlock key={block.blockId} lessonId={lessonId} level={level} content={block.content} />
        ) : block.type === 'WORD_STUDY' ? (
          <WordStudyBlock key={block.blockId} content={block.content} />
        ) : block.type === 'SYMBOL_STUDY' ? (
          <SymbolStudyBlock key={block.blockId} lessonId={lessonId} level={level} content={block.content} />
        ) : block.type === 'MAP' ? (
          <View key={block.blockId} onLayout={(event) => onSectionLayout(block.blockId, event.nativeEvent.layout.y)}>
            <HotspotImage lessonId={lessonId} level={level} content={block.content} variant="map" onReveal={(y, height) => onRevealInBlock(block.blockId, y, height)} />
          </View>
        ) : block.type === 'EXPLORE_DEEPER' ? (
          <ExploreDeeperBlock key={block.blockId} content={block.content} />
        ) : block.type === 'SCRIPTURE_CONNECTION' ? (
          <ScriptureConnectionBlock key={block.blockId} content={block.content} />
        ) : block.type === 'CALLOUT' ? (
          <CalloutBlock key={block.blockId} content={block.content} />
        ) : block.type === 'HISTORICAL_EVIDENCE' ? (
          <EvidenceBlock key={block.blockId} lessonId={lessonId} level={level} content={block.content} />
        ) : block.type === 'SCRIPTURE_PASSAGE' ? (
          <ScripturePassage key={block.blockId} content={block.content} />
        ) : block.type === 'TIMELINE' ? (
          <TimelineContent key={block.blockId} lessonId={lessonId} level={level} content={block.content} />
        ) : block.type === 'INTERACTIVE_IMAGE' ? (
          <View key={block.blockId} onLayout={(event) => onSectionLayout(block.blockId, event.nativeEvent.layout.y)}>
            <HotspotImage lessonId={lessonId} level={level} content={block.content} onReveal={(y, height) => onRevealInBlock(block.blockId, y, height)} />
          </View>
        ) : block.type === 'QUIZ' ? (
          <View key={`${block.blockId}:${contentHash}`} onLayout={(event) => onSectionLayout(block.blockId, event.nativeEvent.layout.y)}>
            <QuizContent content={block.content} lessonId={lessonId} lessonTitle={snapshotLesson.title} level={level} blockId={block.blockId} contentHash={contentHash} onStepChange={() => onBlockStep(block.blockId)} />
          </View>
        ) : block.type === 'SUMMARY' ? (
          <SummaryContent key={block.blockId} content={block.content} />
        ) : (
          <RichTextContent key={block.blockId} content={block.content} />
        ),
      )}

      {shown.length === 0 && introduction.length === 0 ? (
        <EmptyState title="Nothing to read yet" message="This lesson has no readable content at this level." />
      ) : null}

      {skipped > 0 ? (
        <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
          {skipped === 1 ? 'One part' : `${skipped} parts`} of this lesson cannot be shown in this version of the app yet.
        </AppText>
      ) : null}
    </View>
  );
});

/** Every media id a block refers to (its own image, a nested image, a poster), so the cover is not shown twice. */
function blockMediaIds(content: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const take = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) ids.push(value.trim());
  };
  take(content.mediaId);
  take(content.posterMediaId);
  if (typeof content.image === 'object' && content.image !== null) take((content.image as Record<string, unknown>).mediaId);
  return ids;
}
