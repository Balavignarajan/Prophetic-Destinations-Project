'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { courseCountText } from '../lib/home-entries';
import { HOME_LEVELS, HOME_LEVEL_NAMES, type Visibility, levelsLabel, orderedLevels, selectedLevelsWithoutContent, visibilityLabel } from '../lib/home-visibility';
import type { HomeEntry, LearningLevel } from '../lib/types';
import MediaImage from './MediaImage';
import { useDismiss } from './RowMenu';
import { StatusBadge } from './ui';

/** A small picture frame with a calm placeholder for the three cases without a picture (none chosen, still loading, could not be shown), so it is never an empty grey box. */
function Placeholder({ failed }: { failed: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
      {failed ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v14H4z" />
          <path d="M4 16l4.5-4.5 3.5 3.5 3-3 5 5" />
          <path d="M3 3l18 18" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M4.5 17l5-4.5 3.5 3 3-2.5 3.5 3" />
        </svg>
      )}
    </div>
  );
}

/**
 * The picture of a Home Entry in the list: the entry's own card picture; or, when it has none, the cover of its first published course (exactly what the app shows then), marked as such;
 * or a placeholder. Decorative (the title beside it names the entry). A picture that is loading or cannot be shown is replaced by the placeholder, never by the Media Library's error text.
 */
export function HomeEntryThumb({ mediaId, fallbackMediaId }: { mediaId: string | null; fallbackMediaId: string | null }) {
  const shownId = mediaId ?? fallbackMediaId;
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  return (
    <div
      className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      title={!shownId ? 'No picture chosen' : mediaId ? undefined : "No picture of its own: the app shows the cover of this entry's first published course"}
    >
      {shownId && (
        <div className={status === 'ready' ? '' : 'invisible'} aria-hidden="true">
          <MediaImage key={shownId} mediaId={shownId} alt="" className="h-11 w-16 text-[0px]" onStatus={setStatus} />
        </div>
      )}
      {(!shownId || status !== 'ready') && <Placeholder failed={Boolean(shownId) && status === 'failed'} />}
      {shownId && !mediaId && status === 'ready' && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-slate-900/70 text-center text-[9px] font-medium leading-4 text-white">
          Course cover
        </span>
      )}
    </div>
  );
}

/** Enabled or Disabled: the entry's own switch. This says nothing about whether learners see it (see `VisibilityBadge`). */
export function EntryStateBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

const TONES: Record<Visibility['kind'], string> = {
  checking: 'border-slate-200 bg-slate-50 text-slate-600',
  unknown: 'border-slate-300 bg-slate-50 text-slate-700',
  disabled: 'border-slate-300 bg-slate-100 text-slate-700',
  hidden: 'border-amber-300 bg-amber-50 text-amber-900',
  visible: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

/** A selected level where nothing is published yet: the same family as "hidden", so it reads as "check this" rather than as success. */
const PARTIAL_TONE = 'border-amber-200 bg-amber-50/70 text-amber-900';

/**
 * Which learning levels see this entry. While the entry is visible the badge names the levels the administrators SELECTED in the form ("Beginner only", "Beginner + Intermediate", "All 3 levels"); it
 * is amber when a selected level has nothing published to show yet. Otherwise it says why learners do not see the entry ("Hidden — Disabled", "Hidden — No eligible published courses"). It is a
 * button: pressing it (or Enter) opens the details, which keep two things apart for each level: whether the level is SELECTED (the administrators' choice) and whether a published course with lessons
 * is there to show (what the server works out). The details are plain text on the page, not a tooltip, and Escape or pressing elsewhere closes them. An entry's own switch (Enabled/Disabled) is a
 * separate badge: an enabled entry can still be hidden.
 */
export function VisibilityBadge({ visibility, selectedLevels, onOpenChange }: { visibility: Visibility; selectedLevels: readonly LearningLevel[]; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  useDismiss(open, () => change(false), wrapRef);
  const selected = orderedLevels(selectedLevels);
  const label = visibilityLabel(visibility, selected);
  const empty = selectedLevelsWithoutContent(visibility, selected);
  const tone = visibility.kind === 'visible' && empty.length > 0 ? PARTIAL_TONE : TONES[visibility.kind];
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => change(!open)}
        title={visibility.kind === 'visible' && empty.length > 0 ? 'Some selected levels have no published lessons yet' : undefined}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs font-semibold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${tone}`}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visibility.kind === 'visible' ? (
            <>
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
              <circle cx="12" cy="12" r="2.8" />
            </>
          ) : (
            <>
              <path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .4 4.2 1.1M21.5 12S18 18.5 12 18.5c-1.6 0-3-.4-4.2-1.1" />
              <path d="M4 4l16 16" />
            </>
          )}
        </svg>
        <span>{label}</span>
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={`Learner visibility: ${label}`} className="absolute right-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p>
            <span className="font-semibold text-slate-900">Selected levels: </span>
            {levelsLabel(selected)}.{' '}
            <span className="text-slate-600">
              Chosen in the Edit form.{selected.length < HOME_LEVELS.length ? ' Learners at the other levels never see this entry.' : ''}
            </span>
          </p>
          {visibility.kind === 'disabled' && <p>This entry is switched off, so learners do not see it at any learning level. Nothing is deleted and its courses stay assigned. Enable it from the More actions menu.</p>}
          {visibility.kind === 'hidden' && (
            <>
              <p>The learner app does not show this entry at any learning level right now.</p>
              <p className="font-medium text-amber-900">{visibility.why}</p>
              <p>An entry appears once it is enabled and has a published course with published lessons at a learner&rsquo;s level.</p>
            </>
          )}
          {visibility.kind === 'unknown' && <p>What learners see could not be checked just now. The entry itself is unaffected. Use &ldquo;Check again&rdquo; at the top of the list.</p>}
          {visibility.kind === 'checking' && <p>Asking the server what learners see&hellip;</p>}
          {visibility.kind === 'visible' && (
            <>
              <ul className="space-y-1">
                {HOME_LEVELS.map((level) => {
                  const found = visibility.perLevel[level];
                  const isSelected = selected.includes(level);
                  return (
                    <li key={level} className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-slate-900">{HOME_LEVEL_NAMES[level]}</span>
                      <span className={!isSelected ? 'text-slate-600' : found ? 'text-emerald-800' : 'text-amber-900'}>
                        {!isSelected
                          ? 'Not selected — hidden'
                          : found
                            ? `Visible — ${courseCountText(found.courses)}, ${found.lessons} ${found.lessons === 1 ? 'lesson' : 'lessons'}`
                            : 'Selected — nothing published yet'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {empty.length > 0 && <p>At a selected level with nothing published yet, none of its published courses has published lessons there.</p>}
            </>
          )}
          <p className="border-t border-slate-100 pt-2 text-slate-600">Worked out by the same server rules the learner app uses. Course status badges show the courses&rsquo; own publishing state.</p>
        </div>
      )}
    </div>
  );
}

const SHOWN_COURSES = 3;

/** The courses assigned to an entry: how many, then the first few with their publishing status (each a link to the course), and a "View all" control when there are more. Nothing is hidden for good. */
export function CoursesBlock({ entry }: { entry: HomeEntry }) {
  const [all, setAll] = useState(false);
  const listId = useId();
  if (entry.courses.length === 0) {
    return <p className="text-xs text-slate-600">No courses assigned. Choose this entry in a course&rsquo;s form to put the course in it.</p>;
  }
  const shown = all ? entry.courses : entry.courses.slice(0, SHOWN_COURSES);
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{courseCountText(entry.courses.length)}</p>
      <ul id={listId} aria-label={`Courses assigned to ${entry.title}`} className="space-y-1">
        {shown.map((course) => (
          <li key={course.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <Link href={`/courses/${course.id}`} className="min-w-0 font-medium text-slate-900 underline-offset-2 wrap-break-word hover:text-amber-700 hover:underline">
              {course.title}
            </Link>
            <StatusBadge status={course.status} />
          </li>
        ))}
      </ul>
      {entry.courses.length > SHOWN_COURSES && (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((value) => !value)}
          className="rounded text-xs font-medium text-amber-800 underline-offset-2 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {all ? 'Show fewer courses' : `View all ${entry.courses.length} courses`}
        </button>
      )}
    </div>
  );
}
