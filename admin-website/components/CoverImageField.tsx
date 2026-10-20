'use client';

import React, { useState } from 'react';
import type { MediaAsset } from '../lib/types';
import ImageUploadPanel from './ImageUploadPanel';
import MediaBrowser from './MediaBrowser';
import MediaImage from './MediaImage';

interface Props {
  /** What this is the cover of, used in labels: "course" or "lesson". */
  subject: 'course' | 'lesson' | 'event' | 'evidence' | 'section' | 'symbol' | 'scene' | 'animation' | 'poster';
  /** The cover currently chosen in the form (a media asset id), or null. */
  value: string | null;
  /** Called with the chosen asset id, or null for "Remove cover". Nothing is saved here: the form's Save button saves it. */
  onChange: (mediaId: string | null, asset?: MediaAsset) => void;
  disabled?: boolean;
  /** Only offer library files of this exact type (an animated-WebP field accepts WebP only). The server still checks the file itself when the block is saved. */
  contentType?: 'image/webp';
}

const BTN = 'px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * "Cover image" part of a course or lesson form. It reuses the Media Library components (upload panel and browser) and only
 * edits the form's draft value; removing a cover never deletes the image from the library. The picker opens inside the form
 * (not as a second dialog) so keyboard focus stays in one place.
 */
export default function CoverImageField({ subject, value, onChange, disabled = false, contentType }: Props) {
  const isContent = subject !== 'course' && subject !== 'lesson';
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<'upload' | 'library'>('library');
  const [picked, setPicked] = useState<MediaAsset | null>(null);
  const [reload, setReload] = useState(0);

  const choose = (asset: MediaAsset) => {
    // The asset goes along so content fields (not covers) can offer its library alt text and credit where they are empty.
    onChange(asset.id, asset);
    setPicking(false);
    setPicked(null);
    setReload((n) => n + 1);
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">{subject === 'animation' ? 'Animated image (WebP)' : subject === 'poster' ? 'Poster still (optional)' : subject === 'scene' ? 'Visual (optional)' : subject === 'event' ? 'Event image (optional)' : subject === 'section' ? 'Picture (optional)' : subject === 'symbol' ? 'Illustration (optional)' : subject === 'evidence' ? 'Evidence image (optional)' : 'Cover image'}</legend>

      {value ? (
        <div className="flex items-start gap-4">
          <div className="w-40 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
            <MediaImage mediaId={value} alt={subject === 'animation' ? 'The animated image (shown still here)' : subject === 'poster' ? 'Poster for this animation' : subject === 'scene' ? 'Visual for this scene' : subject === 'event' ? 'Image for this event' : subject === 'section' ? 'Picture for this heading' : subject === 'symbol' ? 'Illustration for this symbol' : subject === 'evidence' ? 'Image for this evidence' : `Cover image of this ${subject}`} className="h-24 w-full" />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-600">
              {isContent
                ? 'Shown with this ' + (subject === 'event' ? 'event' : subject === 'section' ? 'heading' : subject === 'symbol' ? 'symbol' : subject === 'scene' ? 'scene' : subject === 'animation' || subject === 'poster' ? 'animation' : 'evidence') + '. Press Save on the form to keep a change; the image is only referenced, never copied.'
                : subject === 'course'
                ? 'Press Save to keep a change. Learners see a new or changed course cover only after the course is approved and published again; until then they keep seeing the published one.'
                : 'Press Save to keep a change. Learners see a new or changed lesson cover only after this lesson is published again (course lists pick it up from then); until then they keep seeing the published one.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} onClick={() => setPicking((open) => !open)} aria-expanded={picking}>
                Change image
              </button>
              <button type="button" className={BTN} onClick={() => { onChange(null); setPicking(false); }}>
                {isContent ? 'Remove image' : 'Remove cover'}
              </button>
            </div>
            <p className="text-xs text-slate-500">Removing {isContent ? 'the image' : 'the cover'} does not delete it from the Media Library.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
            {isContent ? 'No image' : 'No cover'}
          </div>
          <button type="button" className={BTN} onClick={() => setPicking((open) => !open)} aria-expanded={picking}>
            Choose image
          </button>
        </div>
      )}

      {picking && (
        <section aria-label="Choose a cover image" className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div role="tablist" aria-label="Where the image comes from" className="flex gap-2 border-b border-slate-200">
            {(
              [
                ['library', 'Choose from the Media Library'],
                ['upload', 'Upload a new image'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-sm font-semibold -mb-px border-b-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${tab === id ? 'border-amber-600 text-slate-900' : 'border-transparent text-slate-700 hover:text-slate-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'upload' ? (
            <div role="tabpanel" className="space-y-2">
              <p className="text-sm text-slate-700">The image is saved in the Media Library, so you can use it again elsewhere.</p>
              <ImageUploadPanel buttonLabel={subject === 'scene' ? 'Upload and use for this scene' : subject === 'animation' || subject === 'poster' ? 'Upload and use for this animation' : subject === 'event' ? 'Upload and use for this event' : subject === 'section' ? 'Upload and use for this heading' : subject === 'symbol' ? 'Upload and use for this symbol' : subject === 'evidence' ? 'Upload and use for this evidence' : 'Upload and use as cover'} onUploaded={choose} />
            </div>
          ) : (
            <div role="tabpanel" className="space-y-3">
              <div className="max-h-[40vh] overflow-y-auto pr-1">
                <MediaBrowser mode="select" canWrite={false} reloadToken={reload} selectedId={picked?.id ?? null} onSelect={setPicked} contentType={contentType} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className={BTN} onClick={() => { setPicking(false); setPicked(null); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!picked}
                  onClick={() => picked && choose(picked)}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  {subject === 'scene' ? 'Use for this scene' : subject === 'animation' || subject === 'poster' ? 'Use for this animation' : subject === 'event' ? 'Use for this event' : subject === 'section' ? 'Use for this heading' : subject === 'symbol' ? 'Use for this symbol' : subject === 'evidence' ? 'Use for this evidence' : 'Use as cover'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </fieldset>
  );
}
