'use client';

import React, { useRef, useState } from 'react';
import { TIMELINE_LIMITS, type TimelineContent, buildTimelineContent, newEventId } from '../lib/timeline-block';
import type { LearningLevel } from '../lib/types';
import { hasEmptyLevelChoice } from '../lib/item-levels';
import { fillIfEmpty } from '../lib/media-api';
import CoverImageField from './CoverImageField';
import ItemLevelsField from './ItemLevelsField';
import ScriptureRefList from './ScriptureRefList';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: TimelineContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const SMALL = 'block text-xs font-semibold text-slate-800';
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

interface BodyProps extends Omit<Props, 'isOpen' | 'onClose'> {
  requestClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}

function Body({ mode, lessonLevels, initial, saving, error, onSave, requestClose, dirtyRef }: BodyProps) {
  const start: TimelineContent = initial ?? { heading: '', events: [] };
  const [heading, setHeading] = useState(start.heading);
  const [events, setEvents] = useState(start.events);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);

  dirtyRef.current = JSON.stringify(buildTimelineContent({ heading, events })) !== JSON.stringify(buildTimelineContent(start));
  const canSave = !saving && !hasEmptyLevelChoice(events) && (mode === 'edit' || levels.length > 0);

  const patch = (id: string, changes: Partial<TimelineContent['events'][number]>) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  const move = (index: number, delta: -1 | 1) =>
    setEvents((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(buildTimelineContent({ heading, events }), levels);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} What you typed here is unchanged.
        </p>
      )}

      <div>
        <label htmlFor="timeline-heading" className={LABEL}>Heading (optional)</label>
        <input id="timeline-heading" type="text" maxLength={TIMELINE_LIMITS.heading} value={heading} disabled={saving} onChange={(e) => setHeading(e.target.value)} className={FIELD} />
        <p className="text-xs text-slate-700 mt-1">If left empty, learners see the title &ldquo;Timeline&rdquo;.</p>
      </div>

      <fieldset className="space-y-3" disabled={saving}>
        <legend className={LABEL}>Events, in the order learners read them</legend>
        <p className="text-xs text-slate-700">
          Events are shown exactly in this order. Nothing is sorted or calculated from the dates, and a date or period is plain text, so you can write
          &ldquo;605 BC&rdquo;, &ldquo;c. 538 BC&rdquo;, &ldquo;AD 70&rdquo; or a named period.
        </p>
        {events.length === 0 ? (
          <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">No events yet. Add the first event of this timeline.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((event, index) => (
              <li key={event.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{index + 1}</span>
                    Event {index + 1}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" className={BTN} aria-label={`Move event ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
                    <button type="button" className={BTN} aria-label={`Move event ${index + 1} down`} disabled={index === events.length - 1} onClick={() => move(index, 1)}>Down</button>
                    <button type="button" className={BTN} aria-label={`Remove event ${index + 1}`} onClick={() => setEvents((list) => list.filter((e) => e.id !== event.id))}>Remove</button>
                  </div>
                </div>
                <div>
                  <label htmlFor={`tl-date-${event.id}`} className={SMALL}>Date or period {index + 1}</label>
                  <input id={`tl-date-${event.id}`} type="text" maxLength={TIMELINE_LIMITS.dateLabel} value={event.dateLabel} onChange={(e) => patch(event.id, { dateLabel: e.target.value })} className={FIELD} />
                </div>
                <div>
                  <label htmlFor={`tl-title-${event.id}`} className={SMALL}>Title {index + 1}</label>
                  <input id={`tl-title-${event.id}`} type="text" maxLength={TIMELINE_LIMITS.title} value={event.title} onChange={(e) => patch(event.id, { title: e.target.value })} className={FIELD} />
                </div>
                <div>
                  <label htmlFor={`tl-expl-${event.id}`} className={SMALL}>Explanation {index + 1}</label>
                  <textarea id={`tl-expl-${event.id}`} rows={3} maxLength={TIMELINE_LIMITS.explanation} value={event.explanation} onChange={(e) => patch(event.id, { explanation: e.target.value })} className={FIELD} />
                </div>
                <CoverImageField
                  subject="event"
                  value={event.mediaId || null}
                  onChange={(mediaId, asset) => patch(event.id, mediaId ? { mediaId, altText: fillIfEmpty(event.altText, asset?.altText), caption: fillIfEmpty(event.caption, asset?.caption), source: fillIfEmpty(event.source, asset?.source) } : { mediaId: '', altText: '', caption: '', source: '' })}
                  disabled={saving}
                />
                {event.mediaId && (
                  <div className="space-y-2">
                    <div>
                      <label htmlFor={`tl-alt-${event.id}`} className={SMALL}>
                        Image description {index + 1} <span className="text-rose-700">(required before publishing)</span>
                      </label>
                      <textarea id={`tl-alt-${event.id}`} rows={2} maxLength={TIMELINE_LIMITS.altText} value={event.altText} onChange={(e) => patch(event.id, { altText: e.target.value })} className={FIELD} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`tl-cap-${event.id}`} className={SMALL}>Image caption {index + 1} (optional)</label>
                        <input id={`tl-cap-${event.id}`} type="text" maxLength={TIMELINE_LIMITS.caption} value={event.caption} onChange={(e) => patch(event.id, { caption: e.target.value })} className={FIELD} />
                      </div>
                      <div>
                        <label htmlFor={`tl-src-${event.id}`} className={SMALL}>Image source or rights {index + 1} (optional)</label>
                        <input id={`tl-src-${event.id}`} type="text" maxLength={TIMELINE_LIMITS.source} value={event.source} onChange={(e) => patch(event.id, { source: e.target.value })} className={FIELD} />
                      </div>
                    </div>
                  </div>
                )}
                <ScriptureRefList
                  itemLabel={`Event ${index + 1}`}
                  idPrefix={`tl-sc-${event.id}`}
                  entries={event.scripture}
                  onChange={(scripture) => patch(event.id, { scripture })}
                  disabled={saving}
                />
                <ItemLevelsField idPrefix={`tl-lv-${event.id}`} itemLabel={`Event ${index + 1}`} plural="events" value={event.levels} onChange={(next) => patch(event.id, { levels: next })} disabled={saving} />
              </li>
            ))}
          </ol>
        )}
        <button type="button" className={BTN} disabled={events.length >= TIMELINE_LIMITS.maxEvents} onClick={() => setEvents((list) => [...list, { id: newEventId(list), dateLabel: '', title: '', explanation: '', mediaId: '', altText: '', caption: '', source: '', scripture: [], levels: null }])}>
          Add event
        </button>
        {events.length >= TIMELINE_LIMITS.maxEvents && <p className="text-xs text-slate-700">A timeline can have at most {TIMELINE_LIMITS.maxEvents} events.</p>}
        <p className="text-xs text-slate-700">A draft can be saved incomplete. Publishing needs at least one event, and every event needs a date or period, a title and an explanation.</p>
      </fieldset>

      {mode === 'create' && (
        <fieldset disabled={saving}>
          <legend className={LABEL}>Show this timeline at</legend>
          <div className="flex flex-wrap gap-4">
            {lessonLevels.map((level) => (
              <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={levels.includes(level)} onChange={() => setLevels((c) => (c.includes(level) ? c.filter((l) => l !== level) : [...c, level]))} />
                {LEVEL_NAMES[level] ?? level}
              </label>
            ))}
          </div>
          {levels.length === 0 && <p className="text-sm font-medium text-rose-700 mt-1">Choose at least one level.</p>}
        </fieldset>
      )}

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={requestClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={!canSave} aria-busy={saving} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {mode === 'create' ? 'Add timeline to lesson' : 'Save timeline'}
        </button>
      </div>
    </form>
  );
}

/** Adds or edits a timeline block without leaving the lesson. The form starts fresh each time it opens. */
export default function TimelineBlockDialog({ isOpen, onClose, ...rest }: Props) {
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (rest.saving) return;
    if (dirtyRef.current && !window.confirm('Discard your unsaved changes?')) return;
    dirtyRef.current = false;
    onClose();
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={rest.mode === 'create' ? 'Add a timeline' : 'Edit timeline'}
      description="Plain text: an optional heading and events in the order learners should read them."
      maxWidth="2xl"
    >
      <Body {...rest} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
