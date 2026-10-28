'use client';

import React, { useId, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { friendlyBlockName } from '../../lib/block-catalog';
import { useUnsavedWork } from '../../lib/unsaved-guard';
import { LIBRARY_LEVELS } from '../../lib/reusable-library';
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX, canEditContentInLibrary, levelName, reusableErrorMessage, shortDate } from '../../lib/reusable-blocks';
import type { ReusableBlock } from '../../lib/types';
import ReusableBlockView from '../ReusableBlockView';
import ReusableContentDialog from '../ReusableContentDialog';
import { ConfirmDialog, Modal } from '../ui';
import BlockTypeIcon from './BlockTypeIcon';

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:border-amber-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 disabled:bg-slate-50 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-900';

/**
 * "Edit Block": the name and description of a reusable block, what kind of block it is, the learning levels it is available to, and its content, in one window.
 *
 *  - NAME and DESCRIPTION are edited here and saved with "Save Changes" (one request, with the version this window last saw, so a change made elsewhere is refused instead of overwritten).
 *  - The CONTENT is edited in the block's OWN editor (the same dialogs the lesson editor uses; nothing is edited as raw text), opened from "Edit content" and saved by that editor straight to the
 *    reusable block, for the types whose content can be edited in the library. The window then carries on with the new version, and anything typed above is kept. For every other type the content is
 *    changed in a lesson and saved again as a new reusable block, as before.
 *  - The LEARNING LEVELS are shown, not edited: they are fixed when a block is saved from a lesson (the server has no way to change them for an existing block, and a level may carry its own text that
 *    unchecking would destroy). They say which lessons the block can be inserted into; they never publish or hide a copy that is already in a lesson.
 *
 * Changing or deleting a template never changes a lesson that already holds a copy. Closing with unsaved name or description changes asks first (Continue Editing / Discard Changes), and so does
 * leaving the page.
 */
export default function ReusableBlockEditDialog({ block, onClose, onChanged }: { block: ReusableBlock; onClose: () => void; onChanged: (updated: ReusableBlock, what: 'details' | 'content') => void }) {
  const nameId = useId();
  const descriptionId = useId();
  const [current, setCurrent] = useState(block);
  const [name, setName] = useState(block.name);
  const [description, setDescription] = useState(block.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentOpen, setContentOpen] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentSaved, setContentSaved] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const busy = useRef(false);

  const dirty = name !== current.name || description !== (current.description ?? '');
  const canSubmit = dirty && name.trim() !== '' && !saving && !savingContent;
  const editableContent = canEditContentInLibrary(current.type);

  const save = async (): Promise<boolean> => {
    if (busy.current || !dirty || name.trim() === '') return false;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.request<ReusableBlock>(`/admin/reusable-blocks/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description.trim() ? description : null, version: current.version }),
      });
      onChanged(updated, 'details');
      return true;
    } catch (err: unknown) {
      setError(reusableErrorMessage(err, 'Could not save the changes.'));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const saveContent = async (content: Record<string, unknown>) => {
    if (savingContent || busy.current) return;
    setSavingContent(true);
    setContentError(null);
    try {
      const updated = await api.request<ReusableBlock>(`/admin/reusable-blocks/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedContent: content, version: current.version }),
      });
      // Carry on with the new version and content; the name and description typed above are kept as they are.
      setCurrent(updated);
      setContentOpen(false);
      setContentSaved(true);
      onChanged(updated, 'content');
    } catch (err: unknown) {
      setContentError(reusableErrorMessage(err, 'Could not save the content.'));
    } finally {
      setSavingContent(false);
    }
  };

  const requestClose = () => {
    if (saving || savingContent) return;
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  // Leaving the page with unsaved changes is asked about once, by the Admin's single guard.
  useUnsavedWork('reusable-block-edit', dirty, {
    label: 'Reusable block',
    kind: 'changes',
    canSave: name.trim() !== '',
    save,
    reset: onClose,
  });

  return (
    <>
      <Modal isOpen onClose={requestClose} title="Edit Block" description="Changes apply to this reusable block only. Lessons that already use a copy are not changed." maxWidth="2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void save();
          }}
          className="space-y-5"
        >
          {error && (
            <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              {error} What you typed here is unchanged.
            </p>
          )}
          {contentSaved && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Content saved. Lessons that already use a copy are not changed.
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={nameId} className={LABEL}>
                Name <span className="text-rose-700">*</span>
              </label>
              <span className="text-xs tabular-nums text-slate-600" aria-hidden="true">
                {name.length} / {TEMPLATE_NAME_MAX}
              </span>
            </div>
            <input id={nameId} type="text" maxLength={TEMPLATE_NAME_MAX} value={name} disabled={saving} data-autofocus="" onChange={(event) => setName(event.target.value)} aria-invalid={name.trim() === '' || undefined} className={FIELD} />
            {name.trim() === '' && <p className="text-xs font-medium text-rose-800">Give the block a name.</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={descriptionId} className={LABEL}>
                Description <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <span className="text-xs tabular-nums text-slate-600" aria-hidden="true">
                {description.length} / {TEMPLATE_DESCRIPTION_MAX}
              </span>
            </div>
            <textarea id={descriptionId} rows={3} maxLength={TEMPLATE_DESCRIPTION_MAX} value={description} disabled={saving} onChange={(event) => setDescription(event.target.value)} className={FIELD} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className={LABEL}>Block type</p>
              <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                <BlockTypeIcon type={current.type} className="h-4 w-4 text-amber-800" />
                {friendlyBlockName(current.type)}
              </p>
              <p className="text-xs text-slate-700">The type of a reusable block cannot be changed.</p>
            </div>

            <fieldset className="space-y-1.5">
              <legend className={LABEL}>Available to Learning Levels</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {LIBRARY_LEVELS.map((level) => {
                  const entry = current.levels.find((item) => item.level === level);
                  return (
                    <label key={level} className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <input type="checkbox" checked={Boolean(entry)} disabled readOnly aria-label={`${levelName(level)}: ${entry ? 'available' : 'not available'}`} className="h-4 w-4 rounded border-slate-400 text-amber-600" />
                      {levelName(level)}
                      {entry?.content !== null && entry !== undefined && <span className="text-xs font-normal text-purple-800">(own version)</span>}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-slate-700">
                {current.levels.length === 0 ? 'Saved with no levels. ' : ''}Set when the block was saved from a lesson, so they are shown here but cannot be changed. To use different levels, save the block again from a lesson. They decide which lessons it can be inserted into; they never change a copy that is already in a lesson.
              </p>
            </fieldset>
          </div>

          <section aria-labelledby={`${nameId}-content`} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${nameId}-content`} className="text-sm font-semibold text-slate-900">
                Content
              </h3>
              {editableContent && (
                <button
                  type="button"
                  onClick={() => {
                    setContentError(null);
                    setContentOpen(true);
                  }}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Edit content
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-serif text-sm text-slate-800">
              <ReusableBlockView type={current.type} content={current.sharedContent} />
            </div>
            <p className="text-xs text-slate-700">
              {editableContent
                ? 'Edit content opens this block’s own editor. It saves the content to this reusable block straight away; the name and description above are saved with Save Changes.'
                : 'The content of this kind of block is changed in a lesson: edit the block there and save it again as a new reusable block.'}
            </p>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-600">Last updated {shortDate(current.updatedAt)}</p>
            <div className="flex gap-3">
              <button type="button" onClick={requestClose} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                aria-busy={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* The block's own editor for the shared content. It has its own Save and Cancel (and asks before discarding); it sits above this window. */}
      {contentOpen && (
        <ReusableContentDialog
          template={current}
          saving={savingContent}
          error={contentError}
          onClose={() => {
            if (!savingContent) setContentOpen(false);
          }}
          onSave={(content) => void saveContent(content)}
        />
      )}

      <ConfirmDialog
        isOpen={askDiscard}
        onClose={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        message="The changes to the name or description of this reusable block have not been saved and will be lost."
        confirmLabel="Discard Changes"
        cancelLabel="Continue Editing"
        isDestructive
        safeFocus
      />
    </>
  );
}
