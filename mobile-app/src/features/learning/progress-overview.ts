import { useMemo } from 'react';

import { LEVEL_LABELS, type LearningLevel } from '@/learning/levels';

import { useIsUnavailable, useContinueTarget } from './continue-target';
import { useLearningProgress } from './learning-provider';
import { isProgressUnavailable } from './progress-notice';
import {
  type CompletedEntry,
  type ProgressSummary,
  type QuizResult,
  type ResumeEntry,
  completedLessons,
  quizResultsList,
  summarise,
  unfinishedLessons,
} from './progress-model';
import type { SessionStatus } from './progress-session';

/**
 * Everything Home and Progress show about the learner's progress, worked out once and in one place so the two screens can never disagree: the same saved
 * progress goes in, the same counts come out. It adds no rule and changes nothing that is stored.
 *
 * What it does NOT contain, on purpose: an overall percentage. The documents ask for "overall progress" but do not say what it is a percentage of (all
 * published lessons? at one level? lessons or lessons plus quizzes?), so none is invented here (decision C-14). What is shown instead is what the saved
 * progress and the published catalog actually say: lessons completed, lessons in progress, quizzes taken, and, when the catalog is known, how many lessons
 * remain at the chosen level.
 */
export type ProgressOverview = {
  /** `ready` only when the saved progress was read; otherwise the numbers below are empty placeholders and must not be shown as "zero". */
  status: SessionStatus;
  unavailable: boolean;
  summary: ProgressSummary;
  /** Quiz results kept on this device (the latest of each quiz block), most recent first. */
  quizzes: QuizResult[];
  /** The lesson "Continue learning" opens: the most recent unfinished lesson that is still published. */
  resume: ResumeEntry | null;
  /** Every other unfinished lesson (the history is kept, also for lessons that are no longer published). */
  others: ResumeEntry[];
  done: CompletedEntry[];
  hasAnything: boolean;
  /** True for a lesson the backend has said is no longer published. Unknown (not asked yet, or offline) is never reported as unavailable. */
  isUnavailable: (lesson: { lessonId: string; level: LearningLevel }) => boolean;
};

/** "Beginner level: 3 completed · 12 remaining of 15 available". The remaining part is left out when the published total is unknown. */
export function levelProgressLine(level: LearningLevel, summary: ProgressSummary, totalAtLevel: number | null): string {
  const remaining = summary.remainingAtLevel !== null ? ` · ${summary.remainingAtLevel} remaining of ${totalAtLevel} available` : '';
  return `${LEVEL_LABELS[level]} level: ${summary.completedAtLevel} completed${remaining}`;
}

/** "3 lessons completed · 1 in progress · 2 quizzes taken" (quizzes only once one has been taken). */
export function progressCountsLine(summary: ProgressSummary, quizCount: number): string {
  const lessons = summary.completed === 1 ? 'lesson' : 'lessons';
  const quizzes = quizCount > 0 ? ` · ${quizCount} ${quizCount === 1 ? 'quiz' : 'quizzes'} taken` : '';
  return `${summary.completed} ${lessons} completed · ${summary.inProgress} in progress${quizzes}`;
}

/**
 * `totalAtLevel` is the number of published lessons at the chosen level from the catalog the screen has already loaded (live or its saved copy), or null when
 * unknown. `verifyAll` is for a screen that lists the unfinished lessons: each is checked, so those no longer published can be labelled.
 */
export function useProgressOverview(level: LearningLevel, totalAtLevel: number | null, { verifyAll = false }: { verifyAll?: boolean } = {}): ProgressOverview {
  const { progress, status } = useLearningProgress();
  const resume = useContinueTarget({ verifyAll });
  const isUnavailable = useIsUnavailable();

  return useMemo(() => {
    const unfinished = unfinishedLessons(progress);
    const done = completedLessons(progress);
    const quizzes = quizResultsList(progress.quizResults);
    return {
      status,
      unavailable: isProgressUnavailable(status),
      summary: summarise(progress, level, totalAtLevel),
      quizzes,
      resume,
      others: resume ? unfinished.filter((entry) => entry.lessonId !== resume.lessonId || entry.level !== resume.level) : unfinished,
      done,
      hasAnything: unfinished.length + done.length + quizzes.length > 0,
      isUnavailable,
    };
  }, [progress, status, level, totalAtLevel, resume, isUnavailable]);
}
