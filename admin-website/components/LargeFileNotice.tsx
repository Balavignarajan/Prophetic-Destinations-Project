'use client';

import React, { useEffect, useId, useRef } from 'react';
import { type LargeFileWarning, largeFileAdvice, warningSizeText } from '../lib/media-size-warning';

interface Props {
  warning: LargeFileWarning;
  /** Do not upload this file (the author can choose another). */
  onCancel: () => void;
  /** Upload it anyway. */
  onContinue: () => void;
}

/**
 * "Large file selected": shown BEFORE an upload starts, with the file's name and size, why it matters and two clear choices. Nothing has been sent when this is on screen. It
 * sits in the upload panel (rather than as another window over the dialog the panel is in), and focus goes to Cancel so Enter never uploads by accident.
 */
export default function LargeFileNotice({ warning, onCancel, onContinue }: Props) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return (
    <section role="alertdialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-3">
      <h4 id={`${id}-title`} className="text-sm font-semibold text-amber-950">
        Large file selected
      </h4>
      <p id={`${id}-text`} className="text-sm text-amber-950">
        <span className="font-semibold break-all">{warning.fileName}</span> is {warningSizeText(warning)}. {largeFileAdvice(warning.kind)}
      </p>
      <p className="text-xs text-amber-900">Nothing has been uploaded yet. You can still upload it as it is, or cancel and choose a smaller file. The file will not be changed.</p>
      <div className="flex flex-wrap justify-end gap-3">
        <button ref={cancel} type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          Cancel
        </button>
        <button type="button" onClick={onContinue} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          Upload anyway
        </button>
      </div>
    </section>
  );
}
