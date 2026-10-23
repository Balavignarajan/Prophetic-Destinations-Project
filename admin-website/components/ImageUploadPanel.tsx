'use client';

import React, { useEffect, useState } from 'react';
import { IMAGE_MAX_BYTES, checkImageFile, fileKindLabel, formatBytes, friendlyMediaError } from '../lib/image-block';
import { getUploadRules, uploadMedia } from '../lib/media-api';
import { type UploadKind, type UploadRules, acceptFor, checkMediaFile, kindLabel } from '../lib/media-kinds';
import type { MediaAsset } from '../lib/types';

interface Props {
  /** Called once with the stored asset after a successful upload. The file is uploaded exactly once. */
  onUploaded: (asset: MediaAsset) => void;
  buttonLabel?: string;
  /** What is being uploaded: a picture (the default), an MP4 video or a Lottie animation. The server decides in the end; this only checks and explains first. */
  kind?: UploadKind;
}

const KIND_TEXT: Record<UploadKind, { label: string; help: (rules: UploadRules | null) => string }> = {
  image: { label: 'Image file', help: () => `PNG, JPEG or WEBP, up to ${formatBytes(IMAGE_MAX_BYTES)}. The server checks the file itself, not only its name.` },
  video: {
    label: 'Video file (MP4)',
    help: (rules) =>
      `MP4 only${rules ? `, up to ${formatBytes(rules.maxBytes)} on this server` : ''}. The server checks the file itself, not only its name. Videos are played over the internet and are not saved for offline reading.`,
  },
  lottie: {
    label: 'Lottie animation (JSON)',
    help: () => 'A Lottie animation saved as a plain .json file, up to 2 MB, without expressions or links to other files. The server checks the file itself.',
  },
};

/**
 * Choose a file, see it, upload it through the shared media API. A failure keeps the chosen file and says why in plain words, so
 * the author can try again without losing anything else on the page.
 */
export default function ImageUploadPanel({ onUploaded, buttonLabel = 'Upload image', kind = 'image' }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What this server accepts, for video and Lottie (images are always allowed). Not being able to ask is not a reason to refuse a file: the server decides.
  const [rules, setRules] = useState<UploadRules | null>(null);

  useEffect(() => {
    if (kind === 'image') return;
    let cancelled = false;
    getUploadRules()
      .then((found) => !cancelled && setRules(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const problemWith = (chosen: File): string | null => (kind === 'image' ? checkImageFile(chosen) : checkMediaFile(kind, chosen, rules));

  useEffect(() => {
    if (!file || kind !== 'image') return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [file, kind]);

  // The same file is checked again once the server's rules arrive (they may say it is not accepted).
  const shownProblem = problem ?? (file ? problemWith(file) : null);

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setProblem(null);
  };

  const upload = async () => {
    if (!file || busy || shownProblem) return;
    setBusy(true);
    setProblem(null);
    try {
      onUploaded(await uploadMedia(file));
    } catch (e) {
      setProblem(friendlyMediaError(e, 'The upload did not work. Check your connection and try again.'));
      setBusy(false);
    }
  };

  const id = `media-upload-file-${kind}`;
  const text = KIND_TEXT[kind];
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-slate-800 mb-1.5">
          {text.label}
        </label>
        <input
          id={id}
          type="file"
          accept={acceptFor(kind)}
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-describedby={`${id}-help`}
          className="w-full text-sm text-slate-800 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
        />
        <p id={`${id}-help`} className="text-xs text-slate-700 mt-1.5">
          {text.help(rules)}
        </p>
      </div>

      {shownProblem && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {shownProblem}
        </p>
      )}

      {file && !shownProblem && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {kind === 'image' && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Preview of the chosen file" className="h-20 w-28 rounded-lg object-cover bg-white border border-slate-200" />
          ) : null}
          <p className="text-sm text-slate-800">
            <span className="font-semibold break-all">{file.name}</span>
            <br />
            <span className="text-xs text-slate-700">
              {kind === 'image' ? fileKindLabel(file.type) : kindLabel(kind === 'video' ? 'video/mp4' : 'application/json')} · {formatBytes(file.size)}
            </span>
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void upload()}
          disabled={!file || busy || Boolean(shownProblem)}
          aria-busy={busy}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {busy ? 'Uploading…' : buttonLabel}
        </button>
      </div>
    </div>
  );
}
