import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { ApiError } from '@/api/errors';
import type { LessonSnapshotBlock } from '@/api/types';
import { useResource } from '@/api/use-resource';
import {
  AppText,
  Card,
  CompletionMark,
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
import { type LessonRef, type ReadingAnchor, lessonKey, shouldRestore } from '@/features/learning/progress-model';
import { type BlockBox, anchorAtOffset, hasAnchorBlock, planRestore } from '@/features/learning/reading-anchor';
import { noteLessonAvailability } from '@/features/learning/continue-target';
import { ProgressStatusNotice, isProgressUnavailable } from '@/features/learning/progress-notice';
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

/** How long the lesson body must stay the same size before the reader stops being kept on the saved place (and a position beyond its end is clamped to the end; see `tryRestore`). */
const RESTORE_SETTLE_MS = 1200;
/** However long images keep arriving, the reader is not kept on the saved place for longer than this. */
const RESTORE_MAX_MS = 8000;
/** A scroll this soon after the lesson changed shape is the layout moving, not the learner. */
const SHIFT_GRACE_MS = 350;
/** The saved position is written at most this often while the learner keeps scrolling (it is always written when the lesson is left or the app goes to the background). */
const SAVE_MIN_INTERVAL_MS = 2000;

/** Where a restore is trying to put the reader: the saved place (pixels, and the content anchor when there is one) and the published version it was saved in. */
type RestoreRequest = { offset: number; anchor: ReadingAnchor | undefined; contentHash: string | null };

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
    case 'text-only':
      // This browser cannot keep image files: say so rather than imply the whole lesson is available offline.
      return showingSavedCopy ? 'The text is saved for offline reading. This browser cannot keep the images, so they need an internet connection.' : null;
    case 'no-room':
      return 'Some images could not be saved for offline reading because this browser has no room left for them. The text is saved; the images need an internet connection.';
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
  const { spacing, colors } = useTheme();
  const params = useLocalSearchParams<{ lessonId: string; level?: string }>();
  const lessonId = firstParam(params.lessonId);
  const { level, ready } = useRouteLevel(params.level);
  const offlineMedia = useOfflineMedia();
  // keepPrevious: when the saved copy is refreshed (the connection came back, or "Try again"), the lesson stays on screen instead of turning into a spinner, so the reader keeps their place.
  const [lesson, reload] = useResource(ready ? `lesson:${lessonId}:${level}` : null, (signal) => loadLesson(lessonId, level, signal), { keepPrevious: true });
  // Previous / next are a convenience: if the navigation request fails (and nothing is saved) the lesson is still readable.
  const [navigation] = useResource(ready ? `lesson-nav:${lessonId}:${level}` : null, (signal) => loadNavigation(lessonId, level, signal));
  const { has, toggle, remove, setUnavailable, syncTitles: syncSavedTitles, ready: savedReady } = useBookmarks();
  const { progress, recordOpened, isCompleted, setCompleted, savePosition, positionOf, ready: progressReady, status: progressStatus } = useLearningProgress();
  // The saved progress could not be read: nothing is restored or saved until it can be, so completion is not offered (it would silently do nothing).
  const progressUnavailable = isProgressUnavailable(progressStatus);
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
  // What to tell the learner about offline reading of this lesson. A copy the device refused to save is never described as saved.
  const lessonOfflineNote =
    lesson.status !== 'success'
      ? null
      : lesson.data.source === 'network' && lesson.data.saved === false
        ? 'This lesson could not be saved for offline reading on this device just now. It will be saved the next time you open it with an internet connection, if there is room.'
        : offlineNote(offlineMedia.status(mediaOwnerKey('lesson', lessonId, level)), lesson.data.source === 'cache');
  const bookmarkId = lessonBookmarkId(lessonId, level);
  const saved = has(bookmarkId);
  const completed = isCompleted(lessonId, level);

  // Remember what is being read (resume point), and keep a saved lesson's availability flag honest. The provider holds this back until the saved
  // progress has been read (and drops it if that fails), so it can never overwrite earlier progress; it is noted again once the progress is known.
  // A lesson that was renamed also gets its new title in the records kept of it (titles only: when it was completed, where the reader was and quiz scores stay as they are).
  // That is only done from a live answer: a saved copy can be older than a title already refreshed.
  const titleIsLive = lesson.status === 'success' && lesson.data.source === 'network';
  useEffect(() => {
    if (title) recordOpened({ lessonId, level, courseId, title }, { liveTitle: titleIsLive });
  }, [title, lessonId, level, courseId, recordOpened, progressReady, titleIsLive]);
  // The same for the saved item of this lesson, if there is one (title only; also only from a live answer).
  useEffect(() => {
    if (title && titleIsLive && savedReady) syncSavedTitles([{ lessonId, level, title }]);
  }, [title, titleIsLive, savedReady, lessonId, level, syncSavedTitles]);
  useEffect(() => {
    if (lesson.status === 'success' && lesson.data.source === 'network') setUnavailable(bookmarkId, false);
    if (unpublished) setUnavailable(bookmarkId, true);
  }, [lesson, unpublished, bookmarkId, setUnavailable]);
  // What this open found out about the lesson is shared with "Continue learning": a lesson the backend confirmed is no longer published is
  // not offered there (the learner's saved progress is not touched); a live answer that it exists puts it back.
  useEffect(() => {
    if (lesson.status === 'success' && lesson.data.source === 'network') noteLessonAvailability(lessonId, level, true);
    else if (lesson.status === 'error' && lesson.error instanceof ApiError && lesson.error.isUnavailable && lesson.error.code !== 'ERROR') noteLessonAvailability(lessonId, level, false);
  }, [lesson, lessonId, level]);

  const lessonRef = title ? { lessonId, level, courseId, title } : null;
  // The published version on screen (changes when a newer one replaces a saved copy).
  const contentHash = lesson.status === 'success' ? lesson.data.value.contentHash : null;

  // Reading position (LESS-004, APP-011). The learner's place is remembered by CONTENT: the lesson block at the top of the screen and how far down it (a reading anchor,
  // features/learning/reading-anchor.ts), together with the scroll offset in pixels, which stays as the fallback (and is all that positions saved by earlier versions
  // have). It is remembered at checkpoints (when scrolling settles, no more than every few seconds, when the app goes to the background and when the lesson is left)
  // and restored the next time an unfinished lesson is opened. A completed lesson opens at the top.
  // The lesson a position belongs to is captured WHEN IT IS SCROLLED, so moving to the next lesson can never save the old lesson's position against the new one.
  const scrollRef = useRef<ScrollView>(null);
  // The measured sizes of the scrolling area and of the lesson inside it, and the latest scroll offset.
  const metrics = useRef({ content: 0, viewport: 0, viewportWidth: 0, offset: 0 });
  // Where each block of the lesson body sits (measured as it is laid out), for turning an offset into an anchor and back.
  const layoutY = useRef({ column: 0, body: 0, sections: {} as Record<string, number> });
  const blockBoxes = useRef(new Map<string, { y: number; height: number }>());
  const latest = useRef<{ lesson: LessonRef; offset: number; anchor: ReadingAnchor | null; contentHash: string | null } | null>(null);
  const liveAnchor = useRef<ReadingAnchor | null>(null);
  const restore = useRef<RestoreRequest | null>(null);
  const restoreSince = useRef(0);
  const restoredFor = useRef<string | null>(null);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The offset the reader last put the scroll at itself, and when the lesson last changed shape: they tell the app's own scrolling and layout moves from the learner's.
  const programmatic = useRef<number | null>(null);
  const lastLayoutChange = useRef(0);
  // `decided`: it is settled whether a saved position is restored for this lesson (the saved progress is known). `moved`: the learner has scrolled since it opened.
  const decided = useRef(false);
  const moved = useRef(false);
  const live = useRef({ lessonRef, completed, contentHash });
  useEffect(() => {
    live.current = { lessonRef, completed, contentHash };
  });
  const lastWrite = useRef(0);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    const pending = latest.current;
    if (!pending) return;
    lastWrite.current = Date.now();
    savePosition(pending.lesson, pending.offset, { anchor: pending.anchor, contentHash: pending.contentHash }); // the provider ignores completed lessons and repeats of the kept position
  }, [savePosition]);
  // Checkpoints while scrolling go through here: a burst of flicks becomes one write, the last position always follows.
  const flushSoon = useCallback(() => {
    const wait = SAVE_MIN_INTERVAL_MS - (Date.now() - lastWrite.current);
    if (wait <= 0) {
      flush();
      return;
    }
    if (writeTimer.current === null) writeTimer.current = setTimeout(flush, wait);
  }, [flush]);

  const clearRestoreTimer = useCallback(() => {
    if (restoreTimer.current !== null) {
      clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
  }, []);
  const stopRestore = useCallback(() => {
    restore.current = null;
    programmatic.current = null;
    clearRestoreTimer();
  }, [clearRestoreTimer]);
  const boxes = useCallback((): BlockBox[] => {
    const origin = layoutY.current.column + layoutY.current.body;
    return [...blockBoxes.current].map(([blockId, box]) => ({ blockId, top: origin + box.y, height: box.height }));
  }, []);

  // Puts the reader on the saved place once the lesson is laid out far enough to reach it. Text and images keep changing the lesson's height while it loads, so the place is
  // found again from the CONTENT (the saved block, wherever it is now) every time the lesson changes shape, until the layout has settled; the learner scrolling first, or
  // leaving the lesson, ends it. `settled` = the layout has stopped changing: then a saved block that never appeared falls back (see `planRestore`) and a place beyond the
  // end of a shorter lesson is clamped to its end instead of waiting for ever.
  const tryRestore = useCallback(
    (settled: boolean) => {
      const request = restore.current;
      if (request === null) return;
      const { content, viewport } = metrics.current;
      if (content <= 0 || viewport <= 0) return; // not measured yet
      const laidOut = boxes();
      if (!settled && !hasAnchorBlock(request.anchor, laidOut)) return; // the saved block is not laid out yet
      const plan = planRestore(request, laidOut, live.current.contentHash);
      if (plan === null) return; // nothing to go back to: the lesson stays at the top
      const reachable = Math.max(0, content - viewport);
      if (plan.offset > reachable && !settled) return; // not laid out far enough yet
      const target = Math.min(plan.offset, reachable);
      if (Math.abs(target - metrics.current.offset) <= 1) return; // already there
      programmatic.current = target;
      scrollRef.current?.scrollTo({ y: target, animated: false });
    },
    [boxes],
  );
  const waitForLayout = useCallback(() => {
    if (restore.current === null) return;
    clearRestoreTimer();
    const remaining = Math.max(0, RESTORE_MAX_MS - (Date.now() - restoreSince.current));
    restoreTimer.current = setTimeout(() => {
      restoreTimer.current = null;
      tryRestore(true);
      stopRestore();
    }, Math.min(RESTORE_SETTLE_MS, remaining));
  }, [clearRestoreTimer, tryRestore, stopRestore]);
  // Keeps the reader on the block they were reading when the lesson changes shape after the restore has finished: the screen was resized or turned, or a newer published
  // version replaced the saved copy. Nothing happens for a reader who has not scrolled yet.
  const reanchor = useCallback(() => {
    const anchor = liveAnchor.current;
    if (!anchor || metrics.current.offset <= 0 || restore.current !== null) return;
    restore.current = { offset: metrics.current.offset, anchor, contentHash: null };
    restoreSince.current = Date.now();
    waitForLayout();
  }, [waitForLayout]);

  const restoreKey = `${lessonId}:${level}`;
  const shownHash = useRef<string | null>(null);
  useEffect(() => {
    restore.current = null;
    restoredFor.current = null;
    decided.current = false;
    moved.current = false;
    shownHash.current = null;
    liveAnchor.current = null;
    blockBoxes.current.clear();
    programmatic.current = null;
    clearRestoreTimer();
    return () => {
      clearRestoreTimer();
      flush();
      latest.current = null;
    };
  }, [restoreKey, flush, clearRestoreTimer]);
  // Decides about restoring only once the saved progress is KNOWN, and for the lesson and level on screen. This also runs when the progress
  // becomes known late (a retry after a failed read) while the lesson is already open.
  useEffect(() => {
    if (!title || !progressReady || restoredFor.current === restoreKey) return;
    restoredFor.current = restoreKey;
    decided.current = true;
    if (moved.current) {
      // The learner has already read on while the saved progress was unavailable: never pull them back to an older position. Where they got to is kept instead.
      restore.current = null;
      flush();
      return;
    }
    const saved = positionOf(lessonId, level);
    restore.current =
      !completed && saved && shouldRestore(saved.offset)
        ? { offset: Math.max(0, Math.round(saved.offset)), anchor: saved.anchor, contentHash: saved.contentHash ?? null }
        : null;
    restoreSince.current = Date.now();
    tryRestore(false); // the lesson may be laid out already
    waitForLayout();
  }, [title, progressReady, restoreKey, lessonId, level, completed, positionOf, flush, tryRestore, waitForLayout]);
  // A newer published version replaced the one on screen (a saved copy refreshed when the connection came back): the reader stays on the block they were reading.
  const [updatedFor, setUpdatedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!contentHash) return;
    const before = shownHash.current;
    shownHash.current = contentHash;
    if (before === null || before === contentHash) return;
    setUpdatedFor(restoreKey);
    reanchor();
  }, [contentHash, restoreKey, reanchor]);
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
      if (y > 0) moved.current = true;
      // Until it is decided whether a saved position is restored, and while that restore is waiting, the top of the lesson is where the page
      // starts, not where the learner is: it must never be recorded over the saved position.
      const waitingAtTop = y <= 0 && (!decided.current || restore.current !== null);
      const anchor = anchorAtOffset(y, boxes());
      if (!waitingAtTop) liveAnchor.current = anchor;
      if (current && !live.current.completed && !waitingAtTop) latest.current = { lesson: current, offset: y, anchor, contentHash: live.current.contentHash };
      // The learner moved on their own: never pull them back to an older position. (The reader's own scrolling and the lesson changing shape under it are not that.)
      if (restore.current !== null && y > 0) {
        const own = programmatic.current !== null && Math.abs(y - programmatic.current) <= 2;
        const shifting = Date.now() - lastLayoutChange.current < SHIFT_GRACE_MS;
        if (!own && !shifting) stopRestore();
      }
    },
    onScrollBeginDrag: stopRestore,
    onScrollEndDrag: flushSoon,
    onMomentumScrollEnd: flushSoon,
    onContentSizeChange: (_width: number, _height: number) => {
      lastLayoutChange.current = Date.now();
      if (restore.current === null) return;
      tryRestore(false);
      waitForLayout(); // starts the wait again: the layout changed
    },
  };

  // Reading progress (NOT completion, never stored): derived from the scroll state. Only the integer percent is state, and it only
  // changes when the rounded value does, so the lesson body (memoised below) is not re-rendered while scrolling.
  const reduceMotion = useReduceMotion();
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

  // Completion is ONLY ever the learner's own tap on "Mark lesson as complete" (and "Completed. Tap to undo" takes it back): nothing here (scrolling, reaching the end,
  // time, the quiz, opening a block) completes a lesson, and opening a completed lesson writes nothing. It is kept per lesson AND level, never per published version,
  // so a lesson stays complete when it is republished. The "lesson complete" moment belongs to the tap that was stored. It is remembered per lesson and level, so it is
  // never shown for a lesson that was already complete when opened, after moving to another lesson, or after "undo"; and it is only drawn while the lesson really is complete.
  //
  // While a tap is being saved the screen does NOT claim the new state ("Saving...": a lesson being marked is not yet shown as complete, and one being un-marked
  // still is), and further taps are ignored, also taps that arrive before the screen has re-drawn (`completionBusy`). If the progress cannot be stored the change is
  // taken back, so the screen, the course list, Home and Progress never show a state that is not saved; the standard "couldn't be saved" notice stays for a retry.
  // The state is tied to the lesson and level it was started for, so it can never show on another lesson.
  const [celebratedKey, setCelebratedKey] = useState<string | null>(null);
  const [removedKey, setRemovedKey] = useState<string | null>(null);
  const [completion, setCompletion] = useState<{ key: string; action: 'mark' | 'undo'; state: 'saving' | 'failed' } | null>(null);
  const completionBusy = useRef(false);
  const activeCompletion = completion && completion.key === restoreKey ? completion : null;
  const completionState = activeCompletion?.state ?? null;
  const savingCompletion = completionState === 'saving';
  // A lesson being marked is not shown as complete yet; one being un-marked still is, until that is stored.
  const shownCompleted = savingCompletion ? activeCompletion?.action === 'undo' : completed;
  const celebrate = shownCompleted && celebratedKey === restoreKey;
  const removed = !shownCompleted && removedKey === restoreKey;
  const markComplete = async () => {
    if (!lessonRef || completed || progressUnavailable || completionBusy.current) return;
    completionBusy.current = true;
    const key = restoreKey;
    setCompletion({ key, action: 'mark', state: 'saving' });
    try {
      const stored = await setCompleted(lessonRef, true);
      if (!stored) {
        void setCompleted(lessonRef, false);
        setCompletion((current) => (current?.key === key ? { key, action: 'mark', state: 'failed' } : current));
        return;
      }
      setCompletion((current) => (current?.key === key ? null : current));
      setRemovedKey(null);
      setCelebratedKey(key);
    } finally {
      completionBusy.current = false;
    }
  };
  const undoComplete = async () => {
    if (!lessonRef || !completed || progressUnavailable || completionBusy.current) return;
    completionBusy.current = true;
    const key = restoreKey;
    const completedAt = progress.completed[lessonKey(lessonId, level)]?.completedAt;
    setCompletion({ key, action: 'undo', state: 'saving' });
    try {
      const stored = await setCompleted(lessonRef, false);
      if (!stored) {
        // The stored progress still has the lesson as complete: put it back (with its original time) so the screen keeps telling the truth.
        void setCompleted(lessonRef, true, completedAt);
        setCompletion((current) => (current?.key === key ? { key, action: 'undo', state: 'failed' } : current));
        return;
      }
      setCompletion((current) => (current?.key === key ? null : current));
      setCelebratedKey(null);
      setRemovedKey(key);
    } finally {
      completionBusy.current = false;
    }
  };
  const onBodyLayout = useCallback((y: number) => {
    layoutY.current.body = y;
  }, []);
  // Every block reports where it sits as it is laid out (and again whenever its place or size changes, for instance when an image above it loads). The contents sheet,
  // "reveal in block" and the reading position all read from this one record.
  const onBlockLayout = useCallback(
    (blockId: string, y: number, height: number) => {
      layoutY.current.sections[blockId] = y;
      blockBoxes.current.set(blockId, { y, height });
      lastLayoutChange.current = Date.now();
      if (restore.current !== null) {
        tryRestore(false);
        waitForLayout();
      }
    },
    [tryRestore, waitForLayout],
  );
  // The blocks the lesson on screen now has: a block that is gone is forgotten, so a saved place in it is never matched against stale measurements.
  const onBlocks = useCallback((ids: string[]) => {
    const present = new Set(ids);
    for (const id of [...blockBoxes.current.keys()]) if (!present.has(id)) blockBoxes.current.delete(id);
    for (const id of Object.keys(layoutY.current.sections)) if (!present.has(id)) delete layoutY.current.sections[id];
  }, []);
  const jumpToSection = (blockId: string) => {
    const y = layoutY.current.sections[blockId];
    setContentsOpen(false);
    if (y === undefined) return;
    stopRestore(); // the learner chose where to read: never pull them back to an older position
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
      stopRestore(); // the learner is interacting: never pull them back to an older position
      scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: !reduceMotion });
    },
    [reduceMotion, stopRestore],
  );
  const scrollToBlockTop = useCallback((blockId: string) => {
    const blockY = layoutY.current.sections[blockId];
    if (blockY === undefined) return;
    const top = layoutY.current.column + layoutY.current.body + blockY;
    if (metrics.current.offset <= top) return; // the top of the block is still on screen
    stopRestore();
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, top - 8), animated: false }));
  }, [stopRestore]);

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
          const { width, height } = event.nativeEvent.layout;
          const previousWidth = metrics.current.viewportWidth;
          metrics.current.viewport = height;
          metrics.current.viewportWidth = width;
          updatePercent();
          // The screen was resized or turned: the text reflows, so the reader is kept on the block they were reading rather than on the old pixel offset.
          if (previousWidth > 0 && Math.abs(width - previousWidth) > 1) reanchor();
          tryRestore(false);
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

        {lesson.status === 'success' && lessonOfflineNote ? (
          <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
            {lessonOfflineNote}
          </AppText>
        ) : null}

        {lesson.status === 'success' && updatedFor === restoreKey ? (
          <AppText variant="bodySmall" color="textMuted" accessibilityLiveRegion="polite">
            A newer published version of this lesson has replaced the saved copy. Your progress and quiz results are kept.
          </AppText>
        ) : null}

        {lesson.status === 'success' ? <LessonBody lessonId={lessonId} contentHash={lesson.data.value.contentHash} lessonBlocks={lesson.data.value.snapshot.blocks} snapshotLesson={lesson.data.value.snapshot.lesson} level={level} onBodyLayout={onBodyLayout} onBlockLayout={onBlockLayout} onBlocks={onBlocks} onRevealInBlock={revealInBlock} onBlockStep={scrollToBlockTop} /> : null}

        {lesson.status === 'success' ? <RelatedLessons lessonId={lessonId} level={level} contentHash={lesson.data.value.contentHash} /> : null}

        {lesson.status === 'success' ? (
          <View style={{ gap: spacing.lg }}>
            <Divider />
            <ProgressStatusNotice />
            {celebrate ? (
              <Card variant="elevated" style={{ borderColor: colors.borderGold }}>
                <CompletionMark title="Lesson complete" message="This lesson is marked complete." />
              </Card>
            ) : shownCompleted ? (
              <AppText variant="bodySmall" color="success" align="center" style={{ fontWeight: '700' }}>
                ✓ This lesson is marked complete
              </AppText>
            ) : null}
            {removed ? (
              <AppText variant="bodySmall" color="textSecondary" align="center" accessibilityLiveRegion="polite">
                This lesson is no longer marked complete.
              </AppText>
            ) : null}
            {completionState === 'failed' ? (
              <AppText variant="bodySmall" color="warning" align="center" accessibilityLiveRegion="polite">
                {activeCompletion?.action === 'undo'
                  ? "Your progress couldn't be saved, so this lesson is still marked complete. Please try again."
                  : "Your progress couldn't be saved, so this lesson is not marked complete. Please try again."}
              </AppText>
            ) : null}
            {/* Manual completion is unchanged. It is the dominant action only when there is no next lesson to continue to. */}
            {lessonRef ? (
              !next && !shownCompleted ? (
                <PrimaryButton
                  label={savingCompletion ? 'Saving…' : 'Mark lesson as complete'}
                  accessibilityLabel={savingCompletion ? 'Saving your progress' : `Mark ${title ?? 'this lesson'} as complete`}
                  accessibilityHint="Saves on this device that you have finished this lesson. You can undo it."
                  loading={savingCompletion}
                  disabled={progressUnavailable}
                  onPress={() => void markComplete()}
                />
              ) : (
                <SecondaryButton
                  size="medium"
                  label={savingCompletion ? 'Saving…' : shownCompleted ? 'Completed. Tap to undo' : 'Mark lesson as complete'}
                  accessibilityLabel={savingCompletion ? 'Saving your progress' : shownCompleted ? `${title ?? 'This lesson'} is marked complete. Undo` : `Mark ${title ?? 'this lesson'} as complete`}
                  accessibilityHint={shownCompleted ? 'Removes the completion mark on this device.' : 'Saves on this device that you have finished this lesson. You can undo it.'}
                  accessibilityState={{ busy: savingCompletion }}
                  disabled={progressUnavailable || savingCompletion}
                  onPress={() => void (shownCompleted ? undoComplete() : markComplete())}
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
  onBlockLayout,
  onBlocks,
  onRevealInBlock,
  onBlockStep,
}: {
  lessonId: string;
  /** Identifies the published version shown, so quiz answers never carry over to another publication. */
  contentHash: string;
  lessonBlocks: LessonSnapshotBlock[];
  snapshotLesson: { title: string; subtitle: string | null; introduction: string | null; estimatedMinutes: number | null; coverMediaId: string | null };
  level: keyof typeof LEVEL_LABELS;
  /** Where this body starts inside its column, and where each block starts (and how tall it is) inside the body: for the contents sheet, revealing part of a block and the reading position. */
  onBodyLayout: (y: number) => void;
  onBlockLayout: (blockId: string, y: number, height: number) => void;
  /** The ids of the blocks this body shows, whenever they change. */
  onBlocks: (ids: string[]) => void;
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

  // The reader is told which blocks this body shows, so a block that is no longer in the lesson stops counting as a place to return to.
  const shownIds = shown.map((block) => block.blockId).join('|');
  useEffect(() => {
    onBlocks(shownIds ? shownIds.split('|') : []);
  }, [shownIds, onBlocks]);

  const renderBlock = (block: LessonSnapshotBlock) =>
    block.type === 'SECTION_INTRO' ? (
      <SectionIntroBlock lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'IMAGE' ? (
      <LessonImage lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'PROPHECY_EQUIVALENCE' ? (
      <EquivalenceBlock content={block.content} />
    ) : block.type === 'PROPHECY_COMPARISON' ? (
      <ComparisonBlock content={block.content} />
    ) : block.type === 'PROPHECY_CALCULATION' ? (
      <CalculationBlock content={block.content} />
    ) : block.type === 'REFLECTION_STUDY_ACTIVITY' ? (
      <StudyActivityBlock content={block.content} />
    ) : block.type === 'GUIDED_DISCOVERY_QUESTION' ? (
      <GuidedQuestionBlock content={block.content} />
    ) : block.type === 'CONTINUE_EXPLORING' ? (
      <ContinueExploringBlock lessonId={lessonId} blockId={block.blockId} level={level} contentHash={contentHash} content={block.content} />
    ) : block.type === 'NARRATIVE_SCENE' ? (
      <NarrativeSceneBlock lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'MEDIA_ANIMATION' ? (
      <AnimatedImageBlock lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'WORD_STUDY' ? (
      <WordStudyBlock content={block.content} />
    ) : block.type === 'SYMBOL_STUDY' ? (
      <SymbolStudyBlock lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'MAP' ? (
      <HotspotImage lessonId={lessonId} level={level} content={block.content} variant="map" onReveal={(y, height) => onRevealInBlock(block.blockId, y, height)} />
    ) : block.type === 'EXPLORE_DEEPER' ? (
      <ExploreDeeperBlock lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'SCRIPTURE_CONNECTION' ? (
      <ScriptureConnectionBlock content={block.content} />
    ) : block.type === 'CALLOUT' ? (
      <CalloutBlock content={block.content} />
    ) : block.type === 'HISTORICAL_EVIDENCE' ? (
      <EvidenceBlock lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'SCRIPTURE_PASSAGE' ? (
      <ScripturePassage content={block.content} />
    ) : block.type === 'TIMELINE' ? (
      <TimelineContent lessonId={lessonId} level={level} content={block.content} />
    ) : block.type === 'INTERACTIVE_IMAGE' ? (
      <HotspotImage lessonId={lessonId} level={level} content={block.content} onReveal={(y, height) => onRevealInBlock(block.blockId, y, height)} />
    ) : block.type === 'QUIZ' ? (
      <QuizContent content={block.content} lessonId={lessonId} lessonTitle={snapshotLesson.title} level={level} blockId={block.blockId} contentHash={contentHash} onStepChange={() => onBlockStep(block.blockId)} />
    ) : block.type === 'SUMMARY' ? (
      <SummaryContent content={block.content} />
    ) : (
      <RichTextContent content={block.content} />
    );

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

      {shown.map((block) => (
        // One wrapper per block reports where the block sits, so the reader can remember (and find again) the block being read. A quiz is keyed by its published version too, so its answers never carry over.
        <View
          key={block.type === 'QUIZ' ? `${block.blockId}:${contentHash}` : block.blockId}
          onLayout={(event) => onBlockLayout(block.blockId, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}>
          {renderBlock(block)}
        </View>
      ))}

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
