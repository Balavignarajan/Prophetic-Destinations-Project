'use client';

import React from 'react';

import { COURSE_BOOK_OPTIONS, type CourseBook } from '../lib/types';

interface Props {
  value: CourseBook | null;
  onChange: (value: CourseBook | null) => void;
  disabled?: boolean;
  /** Makes the element id unique when the field is on a page with another copy of it. */
  id?: string;
}

/**
 * Which dedicated Home entry (Daniel or Revelation) a course is the destination of. Optional: most courses have none. This is what the learner app
 * uses to find "the Daniel course" and "the Revelation course"; it never looks at titles.
 */
export default function CourseBookField({ value, onChange, disabled = false, id = 'course-book' }: Props) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
        Home entry (Optional)
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as CourseBook))}
        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60"
      >
        <option value="">None (an ordinary course)</option>
        {COURSE_BOOK_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-slate-600">
        Choose Daniel or Revelation to make this course the destination of that button on the learner Home screen. Learners only reach it while it is published at their level; if several courses
        use the same choice, the first one in the course order is used.
      </p>
    </div>
  );
}
