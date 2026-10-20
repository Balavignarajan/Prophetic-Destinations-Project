'use client';

import React, { useState } from 'react';
import { ALT_TEXT_MAX, CAPTION_MAX, SOURCE_MAX, buildImageContent, type ImageContent } from '../lib/image-block';
import { fillIfEmpty } from '../lib/media-api';
import type { LearningLevel, MediaAsset } from '../lib/types';
import ImageUploadPanel from './ImageUploadPanel';
import MediaBrowser from './MediaBrowser';
import MediaImage from './MediaImage';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  initial: ImageContent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, string>, levels: LearningLevel[]) => void;
}

const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1.5';
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

function Body({ mode, lessonLevels, initial, saving, error, onClose, onSave }: Omit<Props, 'isOpen'>) {
  const [draft, setDraft] = useState<ImageContent>(initial ?? { mediaId: '', altText: '', caption: '', source: '' });
  const [choosing, setChoosing] = useState(!initial?.mediaId);
  const [tab, setTab] = useState<'upload' | 'library'>('upload');
  const [picked, setPicked] = useState<MediaAsset | null>(null);
  const [reload, setReload] = useState(0);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);

  const use = (asset: MediaAsset) => {
    // The library's alt text and credit are offered only where these fields are still empty, and stay editable.
    setDraft((d) => ({ ...d, mediaId: asset.id, altText: fillIfEmpty(d.altText, asset.altText), caption: fillIfEmpty(d.caption, asset.caption), source: fillIfEmpty(d.source, asset.source) }));
    setChoosing(false);
    setPicked(null);
    setReload((n) => n + 1);
  };

  const needsAlt = draft.altText.trim().length === 0;
  const canSave = Boolean(draft.mediaId) && !needsAlt && !saving && (mode === 'edit' || levels.length > 0);

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error} Your lesson text and this form are unchanged.
        </p>
      )}

      {choosing ? (
        <section aria-label="Choose an image" className="space-y-4">
          <div role="tablist" aria-label="Where the image comes from" className="flex gap-2 border-b border-slate-200">
            {(
              [
                ['upload', 'Upload a new image'],
                ['library', 'Choose from the Media Library'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-3.5 py-2 text-sm font-semibold -mb-px border-b-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${tab === id ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-700 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'upload' ? (
            <div role="tabpanel" className="space-y-3">
              <p className="text-sm text-slate-700">The image is saved in the Media Library, so you can use it again in other lessons.</p>
              <ImageUploadPanel buttonLabel="Upload and use this image" onUploaded={use} />
            </div>
          ) : (
            <div role="tabpanel" className="space-y-3">
              <p className="text-sm text-slate-700">Choosing an image here does not upload anything: it uses the image that is already stored.</p>
              <div className="max-h-[46vh] overflow-y-auto pr-1">
                <MediaBrowser mode="select" canWrite={false} reloadToken={reload} selectedId={picked?.id ?? null} onSelect={setPicked} />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                {draft.mediaId && (
                  <button type="button" onClick={() => setChoosing(false)} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                    Keep the current image
                  </button>
                )}
                <button
                  type="button"
                  disabled={!picked}
                  onClick={() => picked && use(picked)}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  Use this image
                </button>
              </div>
            </div>
          )}
          {tab === 'upload' && draft.mediaId && (
            <button type="button" onClick={() => setChoosing(false)} className="text-sm font-medium text-amber-900 underline min-h-6">
              Keep the current image
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-full sm:w-64 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
              <MediaImage mediaId={draft.mediaId} alt={draft.altText || 'Selected image'} className="max-h-56 w-full" fit="contain" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-800">This image will appear in the lesson exactly like this, at the width of the learner’s screen.</p>
              <button type="button" onClick={() => setChoosing(true)} className="px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Replace image
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="image-alt" className={LABEL}>
              Alternative text <span className="text-rose-700">(required)</span>
            </label>
            <textarea
              id="image-alt"
              rows={2}
              maxLength={ALT_TEXT_MAX}
              value={draft.altText}
              onChange={(e) => setDraft({ ...draft, altText: e.target.value })}
              aria-describedby="image-alt-help"
              className={FIELD}
            />
            <p id="image-alt-help" className="text-xs text-slate-700 mt-1">
              Describe the image in a sentence for learners who cannot see it. It is also shown if the image cannot load.
            </p>
            {needsAlt && <p className="text-sm font-medium text-rose-700 mt-1">Write a short description of the image.</p>}
          </div>

          <div>
            <label htmlFor="image-caption" className={LABEL}>
              Caption (optional)
            </label>
            <input id="image-caption" type="text" maxLength={CAPTION_MAX} value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} className={FIELD} />
          </div>

          <div>
            <label htmlFor="image-source" className={LABEL}>
              Source or rights (optional)
            </label>
            <input id="image-source" type="text" maxLength={SOURCE_MAX} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="For example: Photo by …, used with permission" className={FIELD} />
          </div>

          {mode === 'create' && (
            <fieldset>
              <legend className={LABEL}>Show this image at</legend>
              <div className="flex flex-wrap gap-4">
                {lessonLevels.map((level) => (
                  <label key={level} className="inline-flex items-center gap-2 text-sm text-slate-800 min-h-6">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-amber-600"
                      checked={levels.includes(level)}
                      onChange={() => setLevels((current) => (current.includes(level) ? current.filter((l) => l !== level) : [...current, level]))}
                    />
                    {LEVEL_NAMES[level] ?? level}
                  </label>
                ))}
              </div>
              {levels.length === 0 && <p className="text-sm font-medium text-rose-700 mt-1">Choose at least one level.</p>}
            </fieldset>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave(buildImageContent(draft), levels)}
              aria-busy={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
              {mode === 'create' ? 'Add image to lesson' : 'Save image'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Adds or edits an image block without leaving the lesson. The form starts fresh each time it opens. */
export default function ImageBlockDialog({ isOpen, ...rest }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={rest.saving ? () => undefined : rest.onClose}
      title={rest.mode === 'create' ? 'Add an image' : 'Edit image'}
      description={rest.mode === 'create' ? 'Upload a new image or choose one that is already in the Media Library.' : 'Change the picture, its description or its caption.'}
      maxWidth="2xl"
    >
      <Body {...rest} />
    </Modal>
  );
}
