import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { ApiError } from '@/api/errors';
import { loadNavigation } from '@/features/offline/offline-api';
import type { LearningLevel } from '@/learning/levels';

import { useLearningProgress } from './learning-provider';
import { type ResumeEntry, lessonKey, unfinishedLessons } from './progress-model';

/**
 * "Continue learning": the most recently read UNFINISHED lesson that is still a place the learner can go.
 *
 * The saved progress is the history: it is never changed here. A lesson the backend has CONFIRMED is no longer published (it answers
 * 404 with its own error body) is not offered as the place to continue; the next most recent unfinished lesson is, exactly as the
 * ordering of `unfinishedLessons` says. Nothing else decides this:
 *  - no answer at all (offline, a timeout, a server problem) says nothing about the lesson, so it stays offered;
 *  - when offline, a lesson whose previous/next information was saved on this device is as usable as it ever was (that copy is
 *    returned as the answer), so it stays offered too.
 * The progress screen still lists every unfinished lesson (opening an unpublished one explains that it is no longer available).
 *
 * How it is known: the lightweight "navigation" request of the lesson (the same saved-copy loader the lesson screen uses). The answers are kept
 * in memory for this session only and re-checked after RECHECK_AFTER_MS, whenever the screen is shown. Nothing is written to storage.
 */
const RECHECK_AFTER_MS = 5 * 60 * 1000;
/** After a check that got no answer, wait this long before asking again (so an offline learner does not trigger a request on every render). */
const RETRY_AFTER_MS = 30 * 1000;
/** How many of the most recent unfinished lessons are looked at. */
const MAX_CANDIDATES = 6;

type Known = { available: boolean; at: number };

const known = new Map<string, Known>();
const noAnswerAt = new Map<string, number>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const listener of [...listeners]) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getVersion = () => version;

const keyOf = (lesson: { lessonId: string; level: LearningLevel }) => lessonKey(lesson.lessonId, lesson.level);

/** Records what is now known about a lesson (the lesson screen reports what it found when it was opened). */
export function noteLessonAvailability(lessonId: string, level: LearningLevel, available: boolean): void {
  const key = lessonKey(lessonId, level);
  const wasAvailable = known.get(key)?.available ?? true; // nothing known counts as available
  known.set(key, { available, at: Date.now() });
  noAnswerAt.delete(key);
  if (wasAvailable !== available) notify();
}

async function verify(entry: ResumeEntry): Promise<void> {
  const key = keyOf(entry);
  inFlight.add(key);
  try {
    await loadNavigation(entry.lessonId, entry.level);
    noteLessonAvailability(entry.lessonId, entry.level, true);
  } catch (error) {
    // Only the backend's own "not available" answer counts. Anything else (no connection, a timeout, a server problem, an error page)
    // leaves what was known as it was.
    if (error instanceof ApiError && error.isUnavailable && error.code !== 'ERROR') noteLessonAvailability(entry.lessonId, entry.level, false);
    else noAnswerAt.set(key, Date.now());
  } finally {
    inFlight.delete(key);
  }
}

function ensureChecked(entry: ResumeEntry): void {
  const key = keyOf(entry);
  if (inFlight.has(key)) return;
  const now = Date.now();
  const state = known.get(key);
  if (state && now - state.at < RECHECK_AFTER_MS) return;
  const tried = noAnswerAt.get(key);
  if (tried !== undefined && now - tried < RETRY_AFTER_MS) return;
  void verify(entry);
}

/** The lesson "Continue learning" should open, or null when there is nothing to continue. Waits for the saved progress to be known. */
export function useContinueTarget(): ResumeEntry | null {
  const { progress, status } = useLearningProgress();
  const seen = useSyncExternalStore(subscribe, getVersion, getVersion);
  const candidates = useMemo(() => (status === 'ready' ? unfinishedLessons(progress).slice(0, MAX_CANDIDATES) : []), [progress, status]);
  const resume = candidates.find((entry) => known.get(keyOf(entry))?.available !== false) ?? null;

  // Check, most recent first, every lesson up to the first one that is not known to be unavailable: the ones known to be unavailable are
  // re-checked now and then (they may have been published again), and the one that will be offered is confirmed.
  const check = useCallback(() => {
    for (const entry of candidates) {
      ensureChecked(entry);
      if (known.get(keyOf(entry))?.available !== false) break;
    }
  }, [candidates, seen]);
  useFocusEffect(check);

  return resume;
}
