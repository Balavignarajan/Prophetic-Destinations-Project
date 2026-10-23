import { useMemo } from 'react';

import type { LearningLevel } from '@/learning/levels';

import { type LevelProgress, type PublishedLessons, levelProgressOf } from './catalog-progress';
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
 * published lessons? at one level? lessons or lessons plus quizzes? how are courses or quizzes weighted?), so none is invented here (decision C-14). What is
 * shown instead is what the saved progress and the published catalog actually say: lessons completed, lessons in progress, quizzes taken and, when the
 * catalog is known, how many of the lessons available at the chosen level are completed and how many remain (see catalog-progress.ts).
 */
export type ProgressOverview = {
  /** `ready` only when the saved progress was read; otherwise the numbers below are empty placeholders and must not be shown as "zero". */
  status: SessionStatus;
  unavailable: boolean;
  summary: ProgressSummary;
  /** Lessons completed against lessons available at the chosen level; counts only, never a percentage. */
  levelProgress: LevelProgress;
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

/** "3 lessons completed · 1 in progress · 2 quizzes taken" (quizzes only once one has been taken). */
export function progressCountsLine(summary: ProgressSummary, quizCount: number): string {
  const lessons = summary.completed === 1 ? 'lesson' : 'lessons';
  const quizzes = quizCount > 0 ? ` · ${quizCount} ${quizCount === 1 ? 'quiz' : 'quizzes'} taken` : '';
  return `${summary.completed} ${lessons} completed · ${summary.inProgress} in progress${quizzes}`;
}

/**
 * `published` is the lessons the catalog already loaded for the chosen level lists (live or its saved copy; see `publishedLessonsOf`), or null when that is not
 * known. `verifyAll` is for a screen that lists the unfinished lessons: each is checked, so those no longer published can be labelled.
 */
export function useProgressOverview(level: LearningLevel, published: PublishedLessons | null, { verifyAll = false }: { verifyAll?: boolean } = {}): ProgressOverview {
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
      summary: summarise(progress, level, published?.total ?? null),
      levelProgress: levelProgressOf(done, level, published),
      quizzes,
      resume,
      others: resume ? unfinished.filter((entry) => entry.lessonId !== resume.lessonId || entry.level !== resume.level) : unfinished,
      done,
      hasAnything: unfinished.length + done.length + quizzes.length > 0,
      isUnavailable,
    };
  }, [progress, status, level, published, resume, isUnavailable]);
}
