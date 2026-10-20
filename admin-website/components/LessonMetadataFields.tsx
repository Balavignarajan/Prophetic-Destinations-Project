'use client';

import React from 'react';

/**
 * The optional descriptive fields of a lesson (workbook CMS-006: short title, subtitle, introduction, estimated study time), shared by the two lesson CREATE
 * forms (directly in a course, and in a module) and the Edit lesson details form, so their labels, limits and checks cannot drift apart. The title and the levels
 * are required and stay in each form. All four fields are optional; a blank one is saved as "none". The text limits are the backend's (LIMITS in
 * lesson-rules.ts); the duration is a whole number of minutes from 1, as in the edit form.
 */
export interface LessonMetadataValues {
  shortTitle: string;
  subtitle: string;
  introduction: string;
  /** Kept as typed so an invalid entry can be shown and fixed. */
  estimatedMinutes: string;
}

export const EMPTY_LESSON_METADATA: LessonMetadataValues = { shortTitle: '', subtitle: '', introduction: '', estimatedMinutes: '' };

const LIMITS = { shortTitle: 100, subtitle: 300, introduction: 5000, maxMinutes: 600 } as const;

/** Whether any field holds something (for unsaved-change detection). */
export const lessonMetadataTouched = (v: LessonMetadataValues) => Boolean(v.shortTitle.trim() || v.subtitle.trim() || v.introduction.trim() || v.estimatedMinutes.trim());

/** What is wrong with the duration, or null. Blank is fine (optional). */
export function durationProblem(value: string): string | null {
  const text = value.trim();
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxMinutes) return `Enter a whole number of minutes from 1 to ${LIMITS.maxMinutes}, or leave it empty.`;
  return null;
}

/** The values as the API takes them: trimmed, blank = null, duration a whole number. Same meaning as the edit form's save. */
export function lessonMetadataPayload(v: LessonMetadataValues): { shortTitle: string | null; subtitle: string | null; introduction: string | null; estimatedMinutes: number | null } {
  return {
    shortTitle: v.shortTitle.trim() || null,
    subtitle: v.subtitle.trim() || null,
    introduction: v.introduction.trim() || null,
    estimatedMinutes: v.estimatedMinutes.trim() ? parseInt(v.estimatedMinutes, 10) : null,
  };
}

const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5';
const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60';

interface Props {
  /** Makes the element ids unique when two of these forms exist on one page. */
  idPrefix: string;
  values: LessonMetadataValues;
  onChange: (next: LessonMetadataValues) => void;
  disabled?: boolean;
}

export default function LessonMetadataFields({ idPrefix, values, onChange, disabled = false }: Props) {
  const patch = (changes: Partial<LessonMetadataValues>) => onChange({ ...values, ...changes });
  const duration = durationProblem(values.estimatedMinutes);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-short`} className={LABEL}>Short title (optional)</label>
        <input id={`${idPrefix}-short`} type="text" maxLength={LIMITS.shortTitle} value={values.shortTitle} disabled={disabled} onChange={(e) => patch({ shortTitle: e.target.value })} className={FIELD} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-subtitle`} className={LABEL}>Subtitle (optional)</label>
        <input id={`${idPrefix}-subtitle`} type="text" maxLength={LIMITS.subtitle} value={values.subtitle} disabled={disabled} onChange={(e) => patch({ subtitle: e.target.value })} className={FIELD} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-intro`} className={LABEL}>Introduction (optional)</label>
        <textarea id={`${idPrefix}-intro`} rows={3} maxLength={LIMITS.introduction} value={values.introduction} disabled={disabled} onChange={(e) => patch({ introduction: e.target.value })} placeholder="Multi-paragraph orientation to the lesson theme..." className={FIELD} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-minutes`} className={LABEL}>Estimated duration in minutes (optional)</label>
        <input
          id={`${idPrefix}-minutes`}
          type="number"
          min={1}
          max={LIMITS.maxMinutes}
          step={1}
          inputMode="numeric"
          value={values.estimatedMinutes}
          disabled={disabled}
          onChange={(e) => patch({ estimatedMinutes: e.target.value })}
          placeholder="e.g. 30"
          aria-invalid={duration !== null}
          aria-describedby={duration ? `${idPrefix}-minutes-error` : undefined}
          className={FIELD}
        />
        {duration && <p id={`${idPrefix}-minutes-error`} role="alert" className="mt-1 text-xs font-medium text-rose-700">{duration}</p>}
      </div>
    </div>
  );
}
