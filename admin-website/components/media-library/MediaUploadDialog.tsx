'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, fileKindLabel, formatBytes, friendlyMediaError } from '../../lib/image-block';
import { getUploadRules, uploadMedia } from '../../lib/media-api';
import { GLB_DEFAULT_MAX_BYTES, LOTTIE_MAX_BYTES, type UploadKind, type UploadRules, checkMediaFile, kindLabel, uploadContentType } from '../../lib/media-kinds';
import { type LargeFileWarning, largeFileAdvice, largeFileWarning } from '../../lib/media-size-warning';
import type { MediaAsset } from '../../lib/types';
import { Modal } from '../ui';
import Icon, { type IconName } from './icons';

/**
 * "Upload Media": drag files in or browse for them, see each one checked before anything is sent, upload them, and retry the ones that fail.
 *
 * WHAT IS CHECKED. Each file is sorted into a kind by its type and name (image, MP4 video, Lottie JSON or GLB model), then checked with the same helpers the upload panels of the lesson editor use
 * (lib/image-block.ts, lib/media-kinds.ts) against the limits THIS SERVER reports (GET /admin/media/settings): they are quoted, never assumed, and when the server cannot be asked the dialog says the
 * server will decide. A JSON file is also parsed here and must have the shape of a Lottie animation (layers, frame rate, size) before it is offered; that only saves a failed upload. Every check here is
 * a courtesy: the server decides from the file's own bytes (including the Lottie and GLB validation), and a refusal is shown in its words.
 *
 * UPLOADING. There is one upload route, for one file, so several files are sent as separate requests, two at a time. The route reports no progress, so none is shown: a file being sent has an
 * indeterminate bar, never a made-up percentage. A file that fails stays in the list with the reason and a Retry button; files that were uploaded stay uploaded. A file is never sent twice by one press,
 * and the dialog cannot be closed while a file is being sent. Uploading only adds files to the library: no lesson, course or cover is changed.
 */
const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4,.mp4,application/json,.json,model/gltf-binary,.glb';
const CONCURRENCY = 2;

interface QueueItem {
  id: string;
  file: File;
  kind: UploadKind | null;
  status: 'idle' | 'queued' | 'uploading' | 'done' | 'failed';
  error: string | null;
  /** Lottie only: undefined while the JSON is being read, null when it looks like a Lottie animation, otherwise why it does not. */
  lottieProblem: string | null | undefined;
}

function kindOf(file: File): UploadKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.glb')) return 'model';
  if (file.type === 'video/mp4' || name.endsWith('.mp4')) return 'video';
  if (file.type === 'application/json' || name.endsWith('.json')) return 'lottie';
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) return 'image';
  return null;
}

/** Why the server would not take this file, as far as can be known without asking it; null when it looks fine. */
function problemOf(file: File, kind: UploadKind | null, rules: UploadRules | null): string | null {
  if (kind === null) return 'This file type is not supported. Use a JPG, PNG or WebP image, an MP4 video, a Lottie .json file or a GLB 3D model.';
  if (file.size <= 0) return 'This file is empty.';
  if (kind === 'image') {
    const limit = rules?.maxBytes ?? IMAGE_MAX_BYTES;
    return file.size > limit ? `This image is larger than ${formatBytes(limit)}. Choose a smaller one.` : null;
  }
  return checkMediaFile(kind, file, rules);
}

/** A Lottie animation is a JSON object with layers, a frame rate and a size. Anything else is refused before it is sent (the server still verifies the file). */
async function lottieShapeProblem(file: File): Promise<string | null> {
  const notLottie = 'This JSON file does not look like a Lottie animation, so it cannot be used. Export the animation from your animation tool as Lottie JSON.';
  try {
    const data: unknown = JSON.parse(await file.text());
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return notLottie;
    const shape = data as Record<string, unknown>;
    return Array.isArray(shape.layers) && typeof shape.fr === 'number' && typeof shape.w === 'number' && typeof shape.h === 'number' ? null : notLottie;
  } catch {
    return 'This file is not valid JSON.';
  }
}

const ICON_OF: Record<UploadKind, IconName> = { image: 'image', video: 'video', lottie: 'animation', model: 'cube' };

export default function MediaUploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: (assets: MediaAsset[]) => void }) {
  const inputId = useId();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rules, setRules] = useState<UploadRules | null>(null);
  const [rulesFailed, setRulesFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const runningRef = useRef(false);
  const nextId = useRef(0);
  const reading = useRef(new Set<string>());
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    getUploadRules()
      .then((found) => !cancelled && setRules(found))
      .catch(() => !cancelled && setRulesFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // A JSON file is read once, to see whether it looks like a Lottie animation.
  useEffect(() => {
    for (const item of items) {
      if (item.kind !== 'lottie' || item.lottieProblem !== undefined || reading.current.has(item.id)) continue;
      reading.current.add(item.id);
      const tooBig = item.file.size > LOTTIE_MAX_BYTES || item.file.size <= 0;
      void (tooBig ? Promise.resolve(null) : lottieShapeProblem(item.file)).then((problem) => setItems((current) => current.map((i) => (i.id === item.id ? { ...i, lottieProblem: problem } : i))));
    }
  }, [items]);

  const patch = (id: string, change: Partial<QueueItem>) => setItems((current) => current.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const addFiles = (list: FileList | File[] | null) => {
    const incoming = list ? Array.from(list) : [];
    if (incoming.length === 0 || runningRef.current) return;
    setConfirmLarge(false);
    setItems((current) => {
      const next = [...current];
      for (const file of incoming) {
        // The same file chosen twice is listed once.
        if (next.some((i) => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)) continue;
        const kind = kindOf(file);
        next.push({ id: `file-${nextId.current++}`, file, kind, status: 'idle', error: null, lottieProblem: kind === 'lottie' ? undefined : null });
      }
      return next;
    });
  };

  const view = items.map((item) => {
    const settled = item.status === 'done';
    const problem = settled ? null : (problemOf(item.file, item.kind, rules) ?? (item.kind === 'lottie' && item.lottieProblem ? item.lottieProblem : null));
    const checking = !settled && !problem && item.kind === 'lottie' && item.lottieProblem === undefined;
    const warning: LargeFileWarning | null = !settled && !problem && item.kind ? largeFileWarning(item.kind, item.file) : null;
    const uploadable = !problem && !checking && (item.status === 'idle' || item.status === 'failed');
    return { item, problem, checking, warning, uploadable };
  });
  const toUpload = view.filter((v) => v.uploadable);
  const failed = view.filter((v) => v.item.status === 'failed');
  const doneCount = view.filter((v) => v.item.status === 'done').length;
  const largeOnes = toUpload.filter((v) => v.warning);

  /** Uploads what is ready (or, with `pick`, only the files it chooses: one retry, or all retries). Files that were asked about large size already are not asked again. */
  const upload = async (pick?: (v: (typeof view)[number]) => boolean) => {
    if (runningRef.current) return;
    const targets = pick ? toUpload.filter(pick) : toUpload;
    if (targets.length === 0) return;
    if (!pick && !confirmLarge && targets.some((v) => v.warning)) {
      setConfirmLarge(true);
      return;
    }
    setConfirmLarge(false);
    runningRef.current = true;
    setRunning(true);
    const ids = new Set(targets.map((v) => v.item.id));
    setItems((current) => current.map((i) => (ids.has(i.id) ? { ...i, status: 'queued', error: null } : i)));
    const waiting = targets.map((v) => v.item);
    const uploaded: MediaAsset[] = [];
    let didNotUpload = 0;
    const worker = async () => {
      for (;;) {
        const next = waiting.shift();
        if (!next) return;
        patch(next.id, { status: 'uploading' });
        try {
          const asset = await uploadMedia(next.file);
          uploaded.push(asset);
          patch(next.id, { status: 'done' });
        } catch (e) {
          didNotUpload += 1;
          patch(next.id, { status: 'failed', error: friendlyMediaError(e, 'The upload did not work. Check your connection and try again.') });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    runningRef.current = false;
    setRunning(false);
    if (uploaded.length > 0) onUploadedRef.current(uploaded);
    // Everything in the list is now in the library: nothing is left to do here.
    const leftOver = view.some((v) => !ids.has(v.item.id) && v.item.status !== 'done');
    if (didNotUpload === 0 && !leftOver) onCloseRef.current();
  };

  const remove = (id: string) => setItems((current) => current.filter((i) => i.id !== id));
  const handleClose = () => {
    if (runningRef.current) return;
    onClose();
  };

  const allowed = (mime: string) => !rules || rules.allowedTypes.includes(mime);
  const FORMATS: { kind: UploadKind; label: string; detail: string; enabled: boolean }[] = [
    { kind: 'image', label: 'Images', detail: `JPG, PNG and WebP (still or animated)${rules ? `, up to ${formatBytes(rules.maxBytes)}` : ''}`, enabled: true },
    { kind: 'video', label: 'Video', detail: `MP4${rules ? `, up to ${formatBytes(rules.maxBytes)}` : ''}`, enabled: allowed(uploadContentType('video')) },
    { kind: 'lottie', label: 'Animations', detail: `Lottie JSON, up to ${formatBytes(LOTTIE_MAX_BYTES)}`, enabled: allowed(uploadContentType('lottie')) },
    { kind: 'model', label: '3D models', detail: `GLB, up to ${formatBytes(rules?.glbMaxBytes ?? GLB_DEFAULT_MAX_BYTES)}${rules ? '' : ' by default'}`, enabled: allowed(uploadContentType('model')) },
  ];

  const summary = running
    ? `Uploading. ${doneCount} of ${items.length} finished.`
    : failed.length > 0
      ? `${failed.length} ${failed.length === 1 ? 'file' : 'files'} did not upload${doneCount > 0 ? `; ${doneCount} uploaded` : ''}.`
      : doneCount > 0
        ? `${doneCount} ${doneCount === 1 ? 'file' : 'files'} uploaded.`
        : items.length > 0
          ? `${toUpload.length} of ${items.length} ${items.length === 1 ? 'file' : 'files'} ready to upload.`
          : '';

  return (
    <Modal isOpen onClose={handleClose} title="Upload Media" description="Add images, videos, animations or 3D models to your Media Library." maxWidth="2xl">
      <div
        className="space-y-5"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          // A file dropped outside the box must not make the browser open it instead.
          event.preventDefault();
        }}
      >
        <section aria-label="Supported files" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {FORMATS.map((format) => (
              <li key={format.kind} className="flex items-start gap-2">
                <Icon name={ICON_OF[format.kind]} className="mt-0.5 h-4 w-4 text-slate-600" />
                <span>
                  <span className="font-semibold text-slate-900">{format.label}</span>
                  <span className="block text-xs text-slate-700">{format.detail}</span>
                  {!format.enabled && <span className="block text-xs font-semibold text-amber-900">Not enabled on this server</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-700">
            {rules ? 'These are the limits this server reports.' : rulesFailed ? 'This server’s limits could not be read, so the server will decide.' : 'Checking this server’s limits…'} The server also checks what is inside every file, not just its name.
          </p>
        </section>

        <label
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-amber-500 motion-reduce:transition-none ${dragging ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-white hover:bg-slate-50'} ${running ? 'pointer-events-none opacity-60' : ''}`}
        >
          <Icon name="upload" className="h-8 w-8 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">{dragging ? 'Drop to add these files' : 'Drag files here, or click to browse'}</span>
          <span className="text-xs text-slate-700">You can choose several files at once.</span>
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={running}
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              // The same file can be chosen again after it was removed.
              event.target.value = '';
            }}
          />
        </label>

        {confirmLarge && largeOnes.length > 0 && !running && (
          <section role="alertdialog" aria-modal="false" aria-label="Large files selected" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h4 className="text-sm font-semibold text-amber-950">{largeOnes.length === 1 ? 'Large file selected' : 'Large files selected'}</h4>
            <ul className="space-y-1.5 text-sm text-amber-950">
              {largeOnes.map((v) => (
                <li key={v.item.id}>
                  <span className="font-semibold break-all">{v.item.file.name}</span> is {formatBytes(v.item.file.size)}. {v.warning && largeFileAdvice(v.warning.kind)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-900">Nothing has been uploaded yet. You can upload them as they are, or go back and choose smaller files. The files will not be changed.</p>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setConfirmLarge(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Go back
              </button>
              <button type="button" onClick={() => void upload()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Upload anyway
              </button>
            </div>
          </section>
        )}

        {items.length > 0 && (
          <ul aria-label="Files to upload" className="space-y-2">
            {view.map(({ item, problem, checking, warning }) => (
              <li key={item.id} className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 ${problem || item.status === 'failed' ? 'border-rose-300 bg-rose-50/50' : item.status === 'done' ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon name={item.kind ? ICON_OF[item.kind] : 'file'} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-all text-sm font-semibold text-slate-900">{item.file.name}</p>
                  <p className="text-xs text-slate-700">
                    {item.kind === 'image' ? fileKindLabel(item.file.type) : item.kind ? kindLabel(uploadContentType(item.kind)) : 'Unsupported'} · {formatBytes(item.file.size)}
                  </p>
                  {problem ? (
                    <p className="flex items-start gap-1.5 text-sm font-medium text-rose-900">
                      <Icon name="alert" className="mt-0.5 h-4 w-4" />
                      <span>{problem}</span>
                    </p>
                  ) : item.status === 'failed' ? (
                    <p className="flex items-start gap-1.5 text-sm font-medium text-rose-900">
                      <Icon name="alert" className="mt-0.5 h-4 w-4" />
                      <span>Not uploaded. {item.error}</span>
                    </p>
                  ) : item.status === 'done' ? (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-900">
                      <Icon name="check" className="h-4 w-4" />
                      Uploaded
                    </p>
                  ) : item.status === 'uploading' ? (
                    <div className="space-y-1">
                      <p className="text-sm text-slate-800">Uploading…</p>
                      <div role="progressbar" aria-label={`Uploading ${item.file.name}`} className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full w-full animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" />
                      </div>
                    </div>
                  ) : item.status === 'queued' ? (
                    <p className="text-sm text-slate-700">Waiting to upload…</p>
                  ) : checking ? (
                    <p className="text-sm text-slate-700">Checking the file…</p>
                  ) : (
                    <p className="text-sm text-slate-800">
                      Ready to upload.
                      {warning && <span className="font-semibold text-amber-900"> Large file: you will be asked to confirm.</span>}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status === 'failed' && !problem && (
                    <button type="button" onClick={() => void upload((v) => v.item.id === item.id)} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                      <Icon name="retry" />
                      Retry
                    </button>
                  )}
                  {item.status !== 'uploading' && item.status !== 'queued' && item.status !== 'done' && (
                    <button type="button" onClick={() => remove(item.id)} disabled={running} aria-label={`Remove ${item.file.name} from the list`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {summary}
        </p>

        <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3">
          <p className="text-xs text-slate-700" aria-hidden="true">
            {summary}
          </p>
          <div className="ml-auto flex flex-wrap justify-end gap-3">
            <button type="button" onClick={handleClose} disabled={running} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              {doneCount > 0 ? 'Done' : 'Cancel'}
            </button>
            {failed.length > 1 && !running && (
              <button type="button" onClick={() => void upload((v) => v.item.status === 'failed')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                <Icon name="retry" />
                Retry failed ({failed.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => void upload()}
              disabled={running || toUpload.length === 0 || confirmLarge}
              aria-busy={running}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
              {running ? 'Uploading…' : toUpload.length > 1 ? `Upload ${toUpload.length} files` : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
