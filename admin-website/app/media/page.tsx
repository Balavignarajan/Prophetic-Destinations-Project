'use client';

import React, { useState } from 'react';
import { useAuth } from '../../lib/auth';
import ImageUploadPanel from '../../components/ImageUploadPanel';
import type { UploadKind } from '../../lib/media-kinds';
import MediaBrowser from '../../components/MediaBrowser';
import { Modal } from '../../components/ui';

export default function MediaLibraryPage() {
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<UploadKind>('image');
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Media Library</h1>
          <p className="text-sm text-slate-700 mt-0.5">
            Every image, MP4 video and Lottie animation stored for the curriculum. You are managing the library here. To put an image in a lesson, open the lesson and use <strong>Add Image</strong>: you can upload there or pick from this library.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setUploadOpen(true);
            }}
            className="px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors self-start sm:self-auto"
          >
            Upload file
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-sm text-emerald-950">
          {notice}
        </p>
      )}

      <MediaBrowser mode="manage" canWrite={canWrite} reloadToken={reload} />

      <Modal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload a file" description="A picture, an MP4 video or a Lottie animation. The server says which of these it accepts.">
        <div role="radiogroup" aria-label="Kind of file" className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ['image', 'Image'],
              ['video', 'MP4 video'],
              ['lottie', 'Lottie animation'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={uploadKind === value}
              onClick={() => setUploadKind(value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${uploadKind === value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <ImageUploadPanel
          key={uploadKind}
          kind={uploadKind}
          buttonLabel={uploadKind === 'image' ? 'Upload image' : uploadKind === 'video' ? 'Upload video' : 'Upload animation'}
          onUploaded={(asset) => {
            setUploadOpen(false);
            setNotice(`“${asset.originalFilename}” was added to the library.`);
            setReload((n) => n + 1);
          }}
        />
      </Modal>
    </div>
  );
}
