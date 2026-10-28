'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { type UnsavedQuestion, registerUnsavedHost, resetAllUnsavedWork, saveAllUnsavedWork, subscribeUnsavedWork, unsavedWorkSnapshot, unsavedWorkSummary, useUnsavedGuard } from '../lib/unsaved-guard';
import { ConfirmDialog, Modal } from './ui';

const BUTTON = 'rounded-lg px-4 py-2 text-sm font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * The one place that guards unsaved ordering across the Admin. It is mounted once, by the layout, and does nothing until a list registers an unsaved order (lib/unsaved-guard.ts):
 *  - while any list has one, leaving the page (refresh or close, a link inside the Admin, the Back button) is held and asked about: Stay, or Leave and discard;
 *  - `guardUnsavedWork(action, run, scopes)` asks, before an action that would reload or change the list under the draft, whether to Save Order and continue, Discard the order and continue,
 *    or Cancel. It asks only about the lists the action concerns (`scopes`), so adding a module does not ask about the direct lessons' order.
 * Saving here saves those lists through each list's own Save Order (so its validation, its version check and its conflict handling are the ones the list already has); discarding resets them
 * (no request). Several lists on one page (a course's modules and its direct lessons) are therefore guarded by one question, not two.
 */
export default function UnsavedGuardHost() {
  const pathname = usePathname() ?? '';
  const snapshot = useSyncExternalStore(subscribeUnsavedWork, unsavedWorkSnapshot, () => '');
  const info = useMemo(() => (snapshot ? (JSON.parse(snapshot) as { labels: string[]; canSave: boolean; changes?: boolean }) : null), [snapshot]);
  const guard = useUnsavedGuard(info !== null, pathname);
  const [question, setQuestion] = useState<UnsavedQuestion | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => registerUnsavedHost(setQuestion), []);
  // Nothing is unsaved any more (it was saved or reset from the list itself): the question has nothing left to ask.
  useEffect(() => {
    if (!info && question) setQuestion(null);
  }, [info, question]);

  const what = info ? info.labels.join(', ') : '';
  // What the open question concerns: the lists the action changes, which may be fewer than all that are unsaved.
  const concerned = question ? unsavedWorkSummary(question.scopes) : { labels: [] as string[], canSave: true };

  return (
    // Above any editor window the page has open (the Quiz Builder is one): a question about leaving must never be hidden behind it.
    <div className="relative z-60">
      <ConfirmDialog
        isOpen={guard.held !== null}
        onClose={guard.stay}
        onConfirm={guard.leave}
        title={info?.changes ? 'Discard unsaved changes?' : 'Leave without saving the order?'}
        message={
          info?.changes
            ? `You have unsaved changes (${what}). If you leave now they are lost, and what is saved stays as it is. Stay on this page to keep editing and save them.`
            : `You have unsaved order changes (${what}). If you leave now they are lost, and the saved order stays as it is. Stay on this page to choose Save Order or Reset.`
        }
        confirmLabel="Leave and discard"
        cancelLabel="Stay on this page"
        isDestructive
      />

      {question && info && (
        <Modal isOpen onClose={() => (saving ? undefined : setQuestion(null))} title="You have unsaved order changes" description="Choose what happens to the new order first." maxWidth="md">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-700">
              {question.action} changes the list, and the list is then reloaded from the server, so the new order you have arranged ({concerned.labels.join(', ')}) would be lost. Save it first,
              discard it, or cancel and keep arranging.
            </p>
            {!concerned.canSave && <p className="text-sm font-medium text-rose-800">An order cannot be saved because someone else changed the list. Discard your arrangement to go on, or cancel and reload the latest order.</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" disabled={saving} onClick={() => setQuestion(null)} className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50`}>
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const asked = question;
                  setQuestion(null);
                  resetAllUnsavedWork(asked.scopes);
                  asked.run();
                }}
                className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50`}
              >
                Discard order and continue
              </button>
              <button
                type="button"
                disabled={saving || !concerned.canSave}
                aria-busy={saving}
                onClick={() => {
                  const asked = question;
                  setSaving(true);
                  void saveAllUnsavedWork(asked.scopes).then((saved) => {
                    setSaving(false);
                    setQuestion(null);
                    // A failed save leaves the draft and shows its reason in the list's own bar; the action is not run.
                    if (saved) asked.run();
                  });
                }}
                className={`${BUTTON} bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50`}
              >
                {saving ? 'Saving order…' : 'Save Order and continue'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
