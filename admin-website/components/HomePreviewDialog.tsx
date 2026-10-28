'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { courseCountText, homeEntryErrorMessage } from '../lib/home-entries';
import { HOME_LEVELS, HOME_LEVEL_NAMES, type LearnerHomeCourse, type LearnerHomeEntry, fetchLearnerHome, fetchLearnerHomeCourses } from '../lib/home-visibility';
import type { HomeEntry, LearningLevel } from '../lib/types';
import MediaImage from './MediaImage';
import { Modal } from './ui';

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: LearnerHomeEntry[] };
type CoursesState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; courses: LearnerHomeCourse[] };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Beginner / Intermediate / Advanced as one choice (a radio group): the arrow keys move between them, Tab goes on to the preview. */
function LevelSelector({ value, onChange }: { value: LearningLevel; onChange: (level: LearningLevel) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeys = (event: React.KeyboardEvent, index: number) => {
    const count = HOME_LEVELS.length;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % count : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(HOME_LEVELS[next]);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Learning level" className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
      {HOME_LEVELS.map((level, index) => (
        <button
          key={level}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === level}
          tabIndex={value === level ? 0 : -1}
          onClick={() => onChange(level)}
          onKeyDown={(event) => onKeys(event, index)}
          className={`min-h-9 rounded-md px-3.5 py-1.5 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
            value === level ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          {HOME_LEVEL_NAMES[level]}
        </button>
      ))}
    </div>
  );
}

/** The card's picture, 16:9 like the app's. While it loads there is a dark placeholder; if it cannot be shown the card is simply plain (as the app's is without a picture). */
function CardImage({ mediaId }: { mediaId: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  if (status === 'failed') return null;
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-[#1A2235] ${status === 'loading' ? 'animate-pulse motion-reduce:animate-none' : ''}`}>
      <div className={status === 'ready' ? '' : 'invisible'} aria-hidden="true">
        <MediaImage mediaId={mediaId} alt="" className="aspect-video w-full text-[0px]" onStatus={setStatus} />
      </div>
    </div>
  );
}

/** One topic card, as the app draws it (picture, title, description, "3 courses · 12 lessons"). Pressing it lists the courses a learner can open in it, like opening the topic does. */
function TopicCard({ entry, open, courses, onToggle, onRetry }: { entry: LearnerHomeEntry; open: boolean; courses: CoursesState | undefined; onToggle: () => void; onRetry: () => void }) {
  const panelId = useId();
  const imageId = entry.imageMediaId ?? entry.coverMediaId;
  return (
    <div className="grow basis-[9rem] self-start overflow-hidden rounded-2xl border border-[#2A344B] bg-[#131825] shadow-md">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onToggle}
        className="block w-full text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5C842]"
      >
        {imageId ? <CardImage key={imageId} mediaId={imageId} /> : null}
        <span className="block space-y-2 p-3">
          <span className="line-clamp-3 block font-serif text-base leading-snug text-[#F0E8D0]">{entry.title}</span>
          {entry.description && <span className="line-clamp-3 block text-xs leading-relaxed text-[#B4BFCE]">{entry.description}</span>}
          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#F5C842]">
            <span>
              {plural(entry.courseCount, 'course')} · {plural(entry.lessonCount, 'lesson')}
            </span>
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-2 border-t border-[#1F283B] p-3 text-xs text-[#B4BFCE]">
          {!courses || courses.status === 'loading' ? (
            <p role="status">Loading the courses…</p>
          ) : courses.status === 'error' ? (
            <div role="alert" className="space-y-2">
              <p>{courses.message}</p>
              <button type="button" onClick={onRetry} className="rounded-md border border-[#2A344B] px-2.5 py-1 font-medium text-[#F5C842] hover:bg-white/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F5C842]">
                Try again
              </button>
            </div>
          ) : courses.courses.length === 0 ? (
            <p>No courses are available in this topic any more. Close the preview and open it again to refresh.</p>
          ) : (
            <ul aria-label={`Courses in ${entry.title}`} className="space-y-2">
              {courses.courses.map((course) => (
                <li key={course.courseId} className="rounded-lg border border-[#1F283B] bg-[#0D1117] p-2">
                  <span className="block font-medium text-[#E8E0D0]">{course.title}</span>
                  <span className="block text-[#8A9BB0]">
                    {plural(course.moduleCount, 'module')} · {plural(course.lessonCount, 'lesson')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Preview Home": the topics section of the learner Home screen ("Browse by topic") as a learner at the chosen learning level gets it, in a phone-shaped frame. It shows what the SERVER gives the
 * app right now (the same answer: GET /home-entries?level=, and GET /home-entries/:id/courses?level= when a card is opened), so it respects, with no rules of its own, which entries are enabled,
 * which courses are published, which have published lessons at the level, and the saved order. Draft content never appears. It shows only the topics and their courses (not the rest of
 * Home), it is read-only (cards open to list their courses; nothing can be edited, published or deleted here) and it asks the server only while it is open: a new level cancels the
 * requests for the old one, so a slow answer can never replace a newer one.
 */
export default function HomePreviewDialog({ entries, onClose }: { entries: HomeEntry[]; onClose: () => void }) {
  const [level, setLevel] = useState<LearningLevel>('BEGINNER');
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Record<string, CoursesState>>({});
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    controllers.current.add(controller);
    setList({ status: 'loading' });
    setOpenId(null);
    setCourses({});
    fetchLearnerHome(level, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setList({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setList({ status: 'error', message: homeEntryErrorMessage(error, 'The learner Home could not be loaded.') });
      });
    return () => {
      // Everything still on its way for the old level (the list and any course lists) is cancelled.
      controllers.current.forEach((pending) => pending.abort());
      controllers.current.clear();
    };
  }, [level, attempt]);

  const loadCourses = (entryId: string) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    setCourses((current) => ({ ...current, [entryId]: { status: 'loading' } }));
    fetchLearnerHomeCourses(entryId, level, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setCourses((current) => ({ ...current, [entryId]: { status: 'ready', courses: found } }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCourses((current) => ({ ...current, [entryId]: { status: 'error', message: homeEntryErrorMessage(error, 'The courses could not be loaded.') } }));
      });
  };

  const toggleCard = (entryId: string) => {
    if (openId === entryId) {
      setOpenId(null);
      return;
    }
    setOpenId(entryId);
    if (!courses[entryId] || courses[entryId].status === 'error') loadCourses(entryId);
  };

  const levelName = HOME_LEVEL_NAMES[level];
  const emptyMessage =
    entries.length === 0
      ? 'There are no Home Entries yet, so learners see no topics.'
      : entries.every((entry) => !entry.isEnabled)
        ? 'Every Home Entry is disabled, so learners see no topics.'
        : `No Home Entries are available for the ${levelName} learning level.`;

  return (
    <Modal isOpen onClose={onClose} title="Preview Home" description="How the Home Entries look to learners in the mobile app." maxWidth="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Learning level</p>
            <LevelSelector value={level} onChange={setLevel} />
          </div>
          <p className="max-w-[16rem] text-xs text-slate-600">Read-only. This is what the server gives the app right now, in your saved order.</p>
        </div>

        <div className="mx-auto w-full max-w-[23.5rem] rounded-[2rem] border-4 border-slate-800 bg-slate-800 p-1.5 shadow-xl">
          <div
            role="region"
            aria-label={`Preview of the Browse by topic section of the learner Home screen, ${levelName} level`}
            aria-busy={list.status === 'loading'}
            tabIndex={0}
            className="max-h-[min(34rem,58vh)] overflow-y-auto rounded-[1.5rem] bg-[#07090F] px-4 py-5 text-[#E8E0D0] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F5C842]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F5C842]">Prophetic Destinations</p>
            <h3 className="mt-1 font-serif text-xl text-[#F0E8D0]">Browse by topic</h3>
            <p className="text-xs text-[#8A9BB0]">{levelName} level</p>

            <div className="mt-4">
              {list.status === 'loading' && (
                <p role="status" className="py-8 text-center text-sm text-[#B4BFCE]">
                  Loading what learners see…
                </p>
              )}
              {list.status === 'error' && (
                <div role="alert" className="space-y-3 rounded-xl border border-[#2A344B] bg-[#131825] p-4 text-center text-sm text-[#E8E0D0]">
                  <p>{list.message}</p>
                  <button type="button" onClick={() => setAttempt((count) => count + 1)} className="rounded-md border border-[#2A344B] px-3 py-1.5 text-xs font-semibold text-[#F5C842] hover:bg-white/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#F5C842]">
                    Try again
                  </button>
                </div>
              )}
              {list.status === 'ready' && list.items.length === 0 && (
                <div className="space-y-2 rounded-xl border border-dashed border-[#2A344B] p-4 text-center text-sm">
                  <p className="font-medium text-[#E8E0D0]">{emptyMessage}</p>
                  <p className="text-xs text-[#8A9BB0]">A topic appears once it is enabled and has a published course with published lessons at that level.</p>
                </div>
              )}
              {list.status === 'ready' && list.items.length > 0 && (
                <div className="flex flex-wrap items-start gap-3">
                  {list.items.map((entry) => (
                    <TopicCard key={entry.entryId} entry={entry} open={openId === entry.entryId} courses={courses[entry.entryId]} onToggle={() => toggleCard(entry.entryId)} onRetry={() => loadCourses(entry.entryId)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          {list.status === 'ready' && list.items.length > 0 ? `${plural(list.items.length, 'topic')} shown at the ${levelName} level (${courseCountText(list.items.reduce((total, item) => total + item.courseCount, 0))} in all). ` : ''}
          Only the topics and their courses are previewed, not the rest of the Home screen. Press a card to list its courses, as opening the topic does.
        </p>
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
