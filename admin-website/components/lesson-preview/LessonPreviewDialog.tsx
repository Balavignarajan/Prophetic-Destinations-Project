'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { LearningLevel, LessonSummary, WorkflowState } from '../../lib/types';
import { friendlyError } from '../../lib/ui-messages';
import { Modal } from '../ui';
import LessonPhone, { type PhoneState, type PreviewBlock, type PreviewLesson } from './LessonPhone';
import { PREVIEW_THEME_NAMES, type PreviewTheme } from './theme';

/**
 * "Preview Lesson": the lesson as a learner reads it in the mobile app, in a phone-shaped frame, for one learning level. It shows the lesson's WORKING COPY (what the server holds now, including
 * changes that are not published yet; learners see only the published version) as the server would deliver it: the same block order, the same level rules and the same frozen Scripture and quiz
 * content, drawn with the app's own theme, type and block designs (see LessonPhone). Everything in it is read-only: the reading position, quiz answers, hotspots, 3D views and media are
 * preview-only and are never saved or sent, nothing is published, and no learner progress is written. The level and theme chosen here belong to the preview alone: they change neither the lesson
 * nor any setting of the app. Closing the preview (or changing the level) cancels what is still loading and releases every viewer, download and media file it opened.
 */
const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LEVEL_NAMES: Record<LearningLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
const THEMES: PreviewTheme[] = ['dark', 'light'];

/** A small radio group: the arrow keys move between the choices, Tab goes on. */
function Choice<T extends string>({ label, value, options, names, onChange }: { label: string; value: T; options: readonly T[]; names: Record<T, string>; onChange: (value: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = options.length;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % count : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next]);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-slate-100 p-0.5">
      {options.map((option, index) => (
        <button
          key={option}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(event) => onKeys(event, index)}
          className={`min-h-9 rounded-md px-3.5 py-1.5 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${value === option ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'}`}
        >
          {names[option]}
        </button>
      ))}
    </div>
  );
}

interface PreviewResponse {
  level: LearningLevel;
  blocks: PreviewBlock[];
}

export default function LessonPreviewDialog({
  lessonId,
  lesson,
  initialLevel,
  workflow,
  orderUnsaved,
  onClose,
}: {
  lessonId: string;
  lesson: LessonSummary;
  initialLevel: LearningLevel;
  workflow: WorkflowState | null;
  /** The block order has changes that are not saved yet (the preview shows the saved order). */
  orderUnsaved: boolean;
  onClose: () => void;
}) {
  const levels = useMemo(() => {
    const offered = LEVELS.filter((level) => lesson.levels.includes(level));
    return offered.length > 0 ? offered : LEVELS;
  }, [lesson.levels]);
  const [level, setLevel] = useState<LearningLevel>(levels.includes(initialLevel) ? initialLevel : levels[0]);
  const [theme, setTheme] = useState<PreviewTheme>('dark');
  const [resets, setResets] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // What the server last said, and for which level and attempt it said it: an answer for another level is never drawn under this one, not even for a moment.
  const [loaded, setLoaded] = useState<{ level: LearningLevel; attempt: number; phone: PhoneState } | null>(null);
  const state: PhoneState = loaded && loaded.level === level && loaded.attempt === attempt ? loaded.phone : { status: 'loading' };

  // The working copy at the chosen level, asked of the server. A new level (or Retry) cancels the request for the old one, so a slow answer can never replace a newer one.
  useEffect(() => {
    const controller = new AbortController();
    api
      .request<PreviewResponse>(`/admin/lessons/${lessonId}/preview?level=${level}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setLoaded({ level, attempt, phone: { status: 'ready', blocks: Array.isArray(response?.blocks) ? response.blocks : [] } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ level, attempt, phone: { status: 'error', message: friendlyError(error, 'Failed to load the lesson preview.') } });
      });
    return () => controller.abort();
  }, [lessonId, level, attempt]);

  const previewLesson = useMemo<PreviewLesson>(
    () => ({ title: lesson.title, shortTitle: lesson.shortTitle, subtitle: lesson.subtitle, introduction: lesson.introduction, estimatedMinutes: lesson.estimatedMinutes, coverMediaId: lesson.coverMediaId }),
    [lesson.title, lesson.shortTitle, lesson.subtitle, lesson.introduction, lesson.estimatedMinutes, lesson.coverMediaId],
  );
  const published = workflow?.activePublication ? `Version ${workflow.activePublication.version} is live for learners` : 'Not published yet';

  return (
    <Modal isOpen onClose={onClose} variant="workspace" title="Preview Lesson" description="See how this lesson appears to learners in the mobile app.">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="min-w-0 space-y-1.5">
          <div>
            <h3 id="modal-title" className="truncate text-lg font-semibold text-slate-900">
              Preview Lesson
            </h3>
            <p className="text-sm text-slate-600">See how this lesson appears to learners in the mobile app.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-slate-800">{LEVEL_NAMES[level]} level</span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-amber-950">Working copy{workflow?.contentRevision ? ` · revision ${workflow.contentRevision}` : ''}</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-slate-800">{published}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close preview" title="Close (Escape)" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 lg:overflow-hidden">
        <div className="flex flex-col gap-5 p-4 lg:h-full lg:flex-row lg:p-6">
          <aside aria-label="Preview controls" className="w-full shrink-0 space-y-5 lg:w-72 lg:overflow-y-auto lg:pr-1">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Learning level</p>
              <Choice label="Learning level" value={level} options={levels} names={LEVEL_NAMES} onChange={setLevel} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Theme</p>
              <Choice label="Reading theme" value={theme} options={THEMES} names={PREVIEW_THEME_NAMES} onChange={setTheme} />
              <p className="text-xs text-slate-600">Dark is the app&rsquo;s default. This only changes the preview, not any setting of the app.</p>
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setResets((count) => count + 1)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Reset preview
              </button>
              <p className="text-xs text-slate-600">Scrolls back to the top and forgets what was opened, answered or played.</p>
            </div>

            {orderUnsaved && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <span className="font-semibold">You have unsaved order changes.</span> This preview shows the <strong>saved</strong> order of the blocks. Choose Save Order to apply the new one.
              </p>
            )}

            <ul className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-700">
              <li>
                <span className="font-semibold text-slate-900">Working copy.</span> This is the saved content as it is now, including changes that are not published yet. Learners see only the published version. Edits you have not saved are not included.
              </li>
              <li>
                <span className="font-semibold text-slate-900">Read-only.</span> The reading position, quiz answers, hotspots and 3D views are for the preview only. Nothing is saved, published or counted as learner progress, and media only plays when you press Play.
              </li>
              <li>
                <span className="font-semibold text-slate-900">Not in the preview.</span> Bookmarks, saved progress, opening the Bible and moving to other lessons belong to the app itself.
              </li>
            </ul>
          </aside>

          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="h-[min(46rem,78dvh)] min-h-[26rem] w-full max-w-[24.5rem] lg:h-full lg:max-h-[54rem]">
              <LessonPhone key={`${level}:${resets}`} theme={theme} level={level} lessonId={lessonId} lesson={previewLesson} state={state} onRetry={() => setAttempt((count) => count + 1)} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
