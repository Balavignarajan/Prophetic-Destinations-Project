'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { friendlyError } from '../lib/ui-messages';
import { Modal } from './ui';

const TITLE_MAX = 200;

interface DuplicateLessonDialogProps {
  /** The lesson to copy; null keeps the dialog closed. */
  lesson: { id: string; title: string } | null;
  /** Human-readable destination, e.g. the course title or "Module X in Course Y". */
  destination: string;
  onClose: () => void;
}

/** The one duplication flow, shared by the course, module and lesson pages. On success it opens the new draft. */
export default function DuplicateLessonDialog({ lesson, destination, onClose }: DuplicateLessonDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lesson) {
      setTitle(`Copy of ${lesson.title}`.slice(0, TITLE_MAX));
      setError(null);
      setSubmitting(false);
    }
  }, [lesson]);

  const close = () => {
    if (!submitting) onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson || submitting) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Enter a title for the copy.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.request<{ id: string }>(`/admin/lessons/${lesson.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      // Keep the dialog (and its disabled state) in place while the new draft opens.
      router.push(`/lessons/${created.id}?duplicated=1`);
    } catch (err: unknown) {
      setError(friendlyError(err, 'Failed to duplicate the lesson. Nothing was copied.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(lesson)}
      onClose={close}
      title="Duplicate lesson"
      description={lesson ? `Original lesson: ${lesson.title}` : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}
        <p className="text-sm text-slate-600 leading-relaxed">
          This creates a separate draft using the lesson&apos;s saved content. The original lesson stays unchanged.
          Changes you have not saved yet are not included; cancel and save them first if you want them in the copy. Quiz blocks in the copy use the same quizzes as the original (quizzes are shared, not duplicated).
        </p>
        <div>
          <label htmlFor="duplicate-lesson-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
            Title of the copy *
          </label>
          <input
            id="duplicate-lesson-title"
            type="text"
            required
            maxLength={TITLE_MAX}
            value={title}
            disabled={submitting}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60"
          />
        </div>
        <p className="text-xs text-slate-500">
          Destination: <span className="font-medium text-slate-700">{destination}</span> (added at the end of the lesson list)
        </p>
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Duplicate lesson
          </button>
        </div>
      </form>
    </Modal>
  );
}
