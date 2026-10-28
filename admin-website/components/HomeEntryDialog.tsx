'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { HOME_ENTRY_DESCRIPTION_MAX, HOME_ENTRY_TITLE_MAX, courseCountText, homeEntryErrorMessage } from '../lib/home-entries';
import type { HomeEntry } from '../lib/types';
import CoverImageField from './CoverImageField';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  /** The entry being edited, or null to add a new one. */
  entry: HomeEntry | null;
  /** How many entries there are now: a new entry can be placed from 1 to this + 1. */
  entryCount: number;
  onClose: () => void;
  /** Called once with the saved entry; the page refreshes its list and shows the confirmation. */
  onSaved: (saved: HomeEntry, created: boolean) => void;
  /** Called when the entry was changed by someone else: the page reloads the list. */
  onReload: () => void;
}

const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5';

/**
 * Add or edit one Home Entry: the title and optional description of the topic, an optional card picture, whether it is shown and (when adding) where it goes. There is NO course field:
 * an entry holds no course of its own, courses join it from the course form, and an entry can be saved with none. The form only edits a draft: nothing is saved until Save. Closing
 * with unsaved changes asks first, a reload or tab close warns, and a conflicting edit by someone else keeps what was typed and says so. The order is not set here when editing (the
 * list's drag handles, arrow keys and Move up / Move down do that); a new entry can be placed anywhere, and is added at the end by default.
 */
export default function HomeEntryDialog({ isOpen, entry, entryCount, onClose, onSaved, onReload }: Props) {
  const editing = entry !== null;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageMediaId, setImageMediaId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // A fresh form each time the dialog opens (or a different entry is opened). The list reloading behind an open dialog must not wipe what is being typed.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(entry?.title ?? '');
    setDescription(entry?.description ?? '');
    setImageMediaId(entry?.imageMediaId ?? null);
    setEnabled(entry?.isEnabled ?? true);
    setPosition('');
    setSaving(false);
    setError(null);
    setConflict(false);
  }, [isOpen, entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = isOpen && (editing
    ? title !== entry.title || description !== (entry.description ?? '') || imageMediaId !== entry.imageMediaId || enabled !== entry.isEnabled
    : Boolean(title.trim() || description.trim() || imageMediaId || position.trim() || !enabled));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const close = () => {
    if (saving) return;
    if (!dirty || window.confirm('Discard your unsaved changes?')) onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setConflict(false);
    if (!title.trim()) {
      setError('Give the Home Entry a title.');
      return;
    }
    let place: number | undefined;
    if (!editing && position.trim()) {
      place = Number(position);
      if (!Number.isInteger(place) || place < 1 || place > entryCount + 1) {
        setError(`Position must be a whole number from 1 to ${entryCount + 1}, or left empty to add the entry at the end.`);
        return;
      }
    }

    setSaving(true);
    try {
      const saved = editing
        ? await api.request<HomeEntry>(`/admin/home-entries/${entry.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || null,
              imageMediaId,
              isEnabled: enabled,
              version: entry.version,
            }),
          })
        : await api.request<HomeEntry>('/admin/home-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || null,
              ...(imageMediaId ? { imageMediaId } : {}),
              isEnabled: enabled,
              ...(place !== undefined ? { position: place } : {}),
            }),
          });
      onSaved(saved, !editing);
    } catch (err: unknown) {
      setConflict((err as { status?: number } | null)?.status === 409);
      setError(homeEntryErrorMessage(err, editing ? 'Could not save the Home Entry.' : 'Could not add the Home Entry.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      maxWidth="xl"
      title={editing ? 'Edit Home Entry' : 'Add Home Entry'}
      description="A topic on the learner Home screen, such as Daniel or Bible History. Courses are added to it from the course form."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm space-y-2">
            <p>{error}</p>
            {conflict && editing && (
              <p>
                Your changes are still in this form.{' '}
                <button
                  type="button"
                  onClick={() => {
                    onReload();
                    onClose();
                  }}
                  className="font-semibold underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Close this form and reload the list
                </button>{' '}
                to see the latest version first.
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="home-entry-title" className={LABEL}>
            Title *
          </label>
          <input
            id="home-entry-title"
            type="text"
            required
            maxLength={HOME_ENTRY_TITLE_MAX}
            value={title}
            disabled={saving}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Daniel"
            aria-describedby="home-entry-title-help"
            className={FIELD}
          />
          <p id="home-entry-title-help" className="mt-1.5 text-xs text-slate-600">
            What the entry is called on the Home screen and in the course form. Each title can be used once. {title.length}/{HOME_ENTRY_TITLE_MAX}
          </p>
        </div>

        <div>
          <label htmlFor="home-entry-description" className={LABEL}>
            Description (Optional)
          </label>
          <textarea
            id="home-entry-description"
            rows={3}
            maxLength={HOME_ENTRY_DESCRIPTION_MAX}
            value={description}
            disabled={saving}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Explore the prophecies in the Book of Daniel."
            aria-describedby="home-entry-description-help"
            className={FIELD}
          />
          <p id="home-entry-description-help" className="mt-1.5 text-xs text-slate-600">
            A short line under the title, also shown above the entry&apos;s courses. {description.length}/{HOME_ENTRY_DESCRIPTION_MAX}
          </p>
        </div>

        <CoverImageField subject="home" mode={editing ? 'edit' : 'create'} saveLabel="Save" value={imageMediaId} onChange={setImageMediaId} disabled={saving} />
        <p className="text-xs text-slate-600 -mt-2">Without a card image the Home screen shows the cover of the entry&apos;s first published course that has one.</p>

        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div>
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-900">
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-400 text-amber-600 focus:ring-amber-500"
              />
              Enabled
            </label>
            <p className="mt-1 text-xs text-slate-600">A disabled entry is kept here, with its courses, but not shown to learners.</p>
          </div>

          {editing ? (
            <div>
              <p className={LABEL}>Position on Home</p>
              <p className="text-sm text-slate-900">{entry.position}</p>
              <p className="mt-1 text-xs text-slate-600">Change the order with the arrows in the list.</p>
            </div>
          ) : (
            <div>
              <label htmlFor="home-entry-position" className={LABEL}>
                Position on Home (Optional)
              </label>
              <input
                id="home-entry-position"
                type="number"
                inputMode="numeric"
                min={1}
                max={entryCount + 1}
                value={position}
                disabled={saving}
                onChange={(e) => setPosition(e.target.value)}
                placeholder={String(entryCount + 1)}
                aria-describedby="home-entry-position-help"
                className={`${FIELD} w-28`}
              />
              <p id="home-entry-position-help" className="mt-1 text-xs text-slate-600">
                1 is first. Empty adds the entry at the end ({entryCount + 1}). You can reorder later.
              </p>
            </div>
          )}
        </div>

        {editing && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
            {entry.courseCount === 0
              ? 'No courses are assigned to this entry yet. Assign a course by choosing this entry in the course form.'
              : `${courseCountText(entry.courseCount)} assigned. To move a course in or out, edit that course and change its Home Entry.`}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button type="button" onClick={close} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
            {editing ? 'Save Changes' : 'Add Home Entry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
