'use client';

import React, { useState } from 'react';
import { useAuth } from '../../lib/auth';
import ImageUploadPanel from '../../components/ImageUploadPanel';
import MediaBrowser from '../../components/MediaBrowser';
import { Modal } from '../../components/ui';

export default function MediaLibraryPage() {
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Media Library</h1>
          <p className="text-sm text-slate-700 mt-0.5">
            Every image stored for the curriculum. You are managing the library here. To put an image in a lesson, open the lesson and use <strong>Add Image</strong>: you can upload there or pick from this library.
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
            Upload image
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-sm text-emerald-950">
          {notice}
        </p>
      )}

      <MediaBrowser mode="manage" canWrite={canWrite} reloadToken={reload} />

      <Modal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload an image" description="PNG, JPEG or WEBP, up to 5 MB.">
        <ImageUploadPanel
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
