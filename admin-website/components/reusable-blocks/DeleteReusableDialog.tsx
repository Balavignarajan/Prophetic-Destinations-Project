'use client';

import React, { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { friendlyBlockName } from '../../lib/block-catalog';
import { reusableErrorMessage } from '../../lib/reusable-blocks';
import type { ReusableBlockSummary } from '../../lib/types';
import { Modal } from '../ui';
import BlockTypeIcon from './BlockTypeIcon';

/**
 * "Delete reusable block?" shows the block's name and says exactly what is and is not removed: only the template leaves the library; a copy that is already in a lesson is a separate block and is not
 * touched, and nothing in the Media Library is deleted. Cancel has the first focus, nothing is sent until "Delete Block" is pressed, a second press while the request runs is ignored, and a refusal keeps
 * the window open with the reason. Success is reported by the page only after the server has answered.
 */
export default function DeleteReusableDialog({ block, onClose, onDeleted }: { block: ReusableBlockSummary; onClose: () => void; onDeleted: (block: ReusableBlockSummary) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.request(`/admin/reusable-blocks/${block.id}`, { method: 'DELETE' });
      onDeleted(block);
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      // Already gone (deleted elsewhere): the library should agree, so the page is told it is deleted.
      if (status === 404) {
        onDeleted(block);
        return;
      }
      setError(`${reusableErrorMessage(err, 'Could not delete the reusable block.')} The block was not deleted.`);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Delete reusable block?" maxWidth="md">
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-800">
            <BlockTypeIcon type={block.type} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 wrap-break-word">{block.name}</p>
            <p className="text-xs text-slate-700">{friendlyBlockName(block.type)}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-800">Deleting this reusable block removes it from your library. Existing lesson copies will not be affected.</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
          <li>Lessons that already use a copy of it keep their copy exactly as it is.</li>
          <li>Images and other media it uses are not deleted.</li>
          <li>This cannot be undone. To use the content again, save the block from a lesson once more.</li>
        </ul>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            data-autofocus=""
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
            {busy ? 'Deleting…' : 'Delete Block'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
