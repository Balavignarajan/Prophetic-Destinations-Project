'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  type LessonRevisionHistory,
  type LessonRevisionItem,
  type LessonRevisionRestoreResult,
  blocksText,
  revisionErrorDetail,
  revisionLevelsText,
  revisionSource,
  revisionTime,
} from '../lib/lesson-revisions';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  lessonId: string;
  /** Only Admins and Editors may restore; everyone with access can read the history. */
  canWrite: boolean;
  onClose: () => void;
  /** The server confirmed the restore. The page refreshes the lesson and says so. */
  onRestored: (result: LessonRevisionRestoreResult & { title: string }) => void;
}

function Body({ lessonId, canWrite, onClose, onRestored }: Omit<Props, 'isOpen'>) {
  const [history, setHistory] = useState<LessonRevisionHistory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LessonRevisionItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<{ message: string; problems: string[] } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setHistory(await api.request<LessonRevisionHistory>(`/admin/lessons/${lessonId}/revisions`));
    } catch (err: unknown) {
      setLoadError(revisionErrorDetail(err, 'The draft history could not be loaded.').message);
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async () => {
    if (!confirming || !history || restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      // `expectedContentRevision` is the state this history was loaded at: if anyone has changed the lesson since, the server refuses and nothing is restored.
      const result = await api.request<LessonRevisionRestoreResult>(`/admin/lessons/${lessonId}/revisions/${confirming.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedContentRevision: history.current.contentRevision }),
      });
      onRestored({ ...result, title: confirming.title });
    } catch (err: unknown) {
      setRestoreError(revisionErrorDetail(err, 'The draft could not be restored. Nothing was changed.'));
      setRestoring(false);
    }
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {loadError}
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
            Close
          </button>
          <button type="button" onClick={() => void load()} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!history) return <p role="status" className="text-sm text-slate-700">Loading the draft history…</p>;

  // The confirmation replaces the list (one window, no dialog on top of a dialog).
  if (confirming) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Restore revision {confirming.contentRevision}?</h3>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 space-y-0.5">
          <p>
            <strong>{confirming.title || 'Untitled lesson'}</strong> · {blocksText(confirming.blockCount)} · {revisionLevelsText(confirming.levels)}
          </p>
          <p className="text-xs text-slate-700">
            Saved {revisionTime(confirming.savedAt)} · {revisionSource(confirming)}
          </p>
        </div>
        <ul className="list-disc pl-5 text-sm text-slate-800 space-y-1">
          <li>This draft becomes the lesson&rsquo;s <strong>current draft</strong>: its details, tags, levels, blocks, level versions and related lessons are replaced by this revision&rsquo;s.</li>
          <li>The draft you have now is kept first, as revision {history.current.contentRevision}, so you can restore it again to undo this.</li>
          <li>The lesson goes back to <strong>Draft</strong> and must be reviewed, approved and published again as usual. <strong>Nothing is published</strong> by restoring, and the version learners have now is not changed.</li>
          <li>Learner progress and quiz results are not affected.</li>
          <li>If an image, quiz or lesson this draft uses has been deleted since, the restore is refused and nothing changes.</li>
        </ul>
        {restoreError && (
          <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900 space-y-1">
            <p>{restoreError.message}</p>
            {restoreError.problems.length > 0 && (
              <ul className="list-disc pl-5 text-xs">
                {restoreError.problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={restoring}
            onClick={() => {
              setConfirming(null);
              setRestoreError(null);
            }}
            className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Back to the history
          </button>
          <button
            type="button"
            disabled={restoring}
            aria-busy={restoring}
            onClick={() => void restore()}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {restoring && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
            Restore this draft
          </button>
        </div>
      </div>
    );
  }

  const earlier = history.items.filter((item) => !item.isCurrent);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        The lesson&rsquo;s earlier drafts are kept here. Restoring one makes it the current draft; the draft it replaces is kept too, so a restore can be undone. This never changes a
        published version and never publishes anything.
      </p>
      <p className="text-xs text-slate-700">
        Current draft: revision {history.current.contentRevision} · {history.current.status === 'DRAFT' ? 'Draft' : history.current.status.replace(/_/g, ' ').toLowerCase()} · changed {revisionTime(history.current.updatedAt)}
      </p>
      {earlier.length === 0 ? (
        <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
          No earlier drafts are stored yet. A draft is kept the first time the lesson is changed, so this list fills up as you edit.
        </p>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto pr-1 space-y-2" aria-label="Earlier drafts, newest first">
          {earlier.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">
                  Revision {item.contentRevision} <span className="font-normal text-slate-700">· saved {revisionTime(item.savedAt)}</span>
                </p>
                <p className="text-xs text-slate-800 break-words">
                  {item.title || 'Untitled lesson'} · {blocksText(item.blockCount)} · {revisionLevelsText(item.levels)}
                  {item.tags.length > 0 ? ` · Tags: ${item.tags.join(', ')}` : ''}
                </p>
                <p className="text-xs text-slate-700">{revisionSource(item)}</p>
              </div>
              {canWrite &&
                (item.restorable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRestoreError(null);
                      setConfirming(item);
                    }}
                    aria-label={`Restore revision ${item.contentRevision}`}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    Restore draft
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-slate-600">Cannot be restored (saved in an older format)</span>
                ))}
            </li>
          ))}
        </ul>
      )}
      {history.total > history.items.length && (
        <p className="text-xs text-slate-700">Showing the newest {history.items.length} of {history.total} stored drafts.</p>
      )}
      <div className="flex justify-end pt-3 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * "Draft history" of a lesson (CMS-029): earlier saved drafts, with Restore draft for Admins and Editors. The history is read from the server every time this opens, and a
 * restore is sent with the revision the list was loaded at, so a lesson changed meanwhile is never overwritten. The server restores in one transaction or not at all.
 */
export default function LessonRevisionsDialog({ isOpen, ...rest }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={rest.onClose} title="Draft history" description="Earlier saved drafts of this lesson." maxWidth="2xl">
      <Body {...rest} />
    </Modal>
  );
}
