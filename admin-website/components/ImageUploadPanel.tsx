'use client';

import React, { useEffect, useState } from 'react';
import { IMAGE_MAX_BYTES, checkImageFile, fileKindLabel, formatBytes, friendlyMediaError } from '../lib/image-block';
import { uploadMedia } from '../lib/media-api';
import type { MediaAsset } from '../lib/types';

interface Props {
  /** Called once with the stored asset after a successful upload. The file is uploaded exactly once. */
  onUploaded: (asset: MediaAsset) => void;
  buttonLabel?: string;
}

/**
 * Choose a file, see it, upload it through the shared media API. A failure keeps the chosen file and says why in plain words, so
 * the author can try again without losing anything else on the page.
 */
export default function ImageUploadPanel({ onUploaded, buttonLabel = 'Upload image' }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [file]);

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setProblem(chosen ? checkImageFile(chosen) : null);
  };

  const upload = async () => {
    if (!file || busy || problem) return;
    setBusy(true);
    setProblem(null);
    try {
      onUploaded(await uploadMedia(file));
    } catch (e) {
      setProblem(friendlyMediaError(e, 'The upload did not work. Check your connection and try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="image-upload-file" className="block text-sm font-semibold text-slate-800 mb-1.5">
          Image file
        </label>
        <input
          id="image-upload-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-describedby="image-upload-help"
          className="w-full text-sm text-slate-800 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
        />
        <p id="image-upload-help" className="text-xs text-slate-700 mt-1.5">
          PNG, JPEG or WEBP, up to {formatBytes(IMAGE_MAX_BYTES)}. The server checks the file itself, not only its name.
        </p>
      </div>

      {problem && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {problem}
        </p>
      )}

      {file && previewUrl && !checkImageFile(file) && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Preview of the chosen file" className="h-20 w-28 rounded-lg object-cover bg-white border border-slate-200" />
          <p className="text-sm text-slate-800">
            <span className="font-semibold break-all">{file.name}</span>
            <br />
            <span className="text-xs text-slate-700">
              {fileKindLabel(file.type)} · {formatBytes(file.size)}
            </span>
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void upload()}
          disabled={!file || busy || Boolean(problem)}
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
