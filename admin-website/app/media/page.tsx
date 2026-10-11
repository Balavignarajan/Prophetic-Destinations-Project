'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api, API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { MediaAsset } from '../../lib/types';
import { LoadingSpinner, EmptyState, Modal, ConfirmDialog } from '../../components/ui';

export default function MediaLibraryPage() {
  const { user } = useAuth();
  const [mediaList, setMediaList] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Asset Preview modal
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);

  // Delete state
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.request<{ items: MediaAsset[]; total: number }>(
        '/admin/media?limit=100'
      );
      setMediaList(res.items);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load media assets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic client-side sanity check: 5 MiB default limit
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('File size exceeds the 5 MiB upload limit.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = api.getAccessToken();
      const res = await fetch(`${API_BASE_URL}/admin/media`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.message || `Upload failed with status code ${res.status}`
        );
      }

      setUploadModalOpen(false);
      setSelectedFile(null);
      fetchMedia();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setUploadError(e.message || 'Failed to upload media asset.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAssetId) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await api.request(`/admin/media/${deleteAssetId}`, {
        method: 'DELETE',
      });
      setDeleteAssetId(null);
      if (previewAsset?.id === deleteAssetId) {
        setPreviewAsset(null);
      }
      fetchMedia();
    } catch (err: unknown) {
      const e = err as { payload?: { message?: string }; message?: string };
      setDeleteError(e.payload?.message || e.message || 'Failed to delete asset.');
    } finally {
      setDeleting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">
            Media Library
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Strictly validated authenticated media assets. No public links or external URLs.
          </p>
        </div>

        {canWrite && (
          <button
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2.5 text-sm font-medium bg-slate-950 hover:bg-slate-800 text-white rounded-lg shadow-xs transition-colors flex items-center gap-2 self-start sm:self-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Media Asset
          </button>
        )}
      </div>

      {deleteError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-rose-500 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {error}
        </div>
      )}

      {/* Media Grid / Table */}
      {loading ? (
        <LoadingSpinner text="Retrieving media library..." />
      ) : mediaList.length === 0 ? (
        <EmptyState
          title="No Media Assets"
          description="Upload PNG, JPEG, or WEBP image assets to store them securely."
          action={
            canWrite ? (
              <button
                onClick={() => setUploadModalOpen(true)}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg"
              >
                Upload First Asset
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {mediaList.map((asset) => (
            <div
              key={asset.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:border-slate-300 transition-all flex flex-col"
            >
              {/* Thumbnail / Preview Area */}
              <div
                onClick={() => setPreviewAsset(asset)}
                className="h-40 bg-slate-900/5 flex items-center justify-center cursor-pointer relative group overflow-hidden border-b border-slate-100"
              >
                {asset.contentType.startsWith('image/') ? (
                  /* Authenticated image preview: fetched via token on demand in the modal */
                  <div className="text-center p-4">
                    <svg className="w-10 h-10 text-slate-400 mx-auto mb-1 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      Click to Preview
                    </span>
                  </div>
                ) : (
                  <div className="text-center p-4">
                    <svg className="w-10 h-10 text-slate-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs text-slate-500 font-mono">{asset.contentType}</span>
                  </div>
                )}
              </div>

              {/* Metadata Details */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4
                    className="text-xs font-semibold text-slate-900 truncate"
                    title={asset.originalFilename}
                  >
                    {asset.originalFilename}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span>{formatBytes(asset.sizeBytes)}</span>
                    <span>•</span>
                    <span className="font-mono">{asset.contentType.split('/')[1]?.toUpperCase()}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate mt-2" title={`ID: ${asset.id}`}>
                    ID: {asset.id}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </span>

                  {canWrite && (
                    <button
                      onClick={() => setDeleteAssetId(asset.id)}
                      className="text-xs font-medium text-rose-600 hover:text-rose-800 p-1 rounded-sm"
                      title="Delete asset"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Media Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Media Asset"
        description="Select an image file (PNG, JPEG, WEBP up to 5 MiB). Files are verified by content bytes."
      >
        <form onSubmit={handleUpload} className="space-y-4">
          {uploadError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {uploadError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Select File *
            </label>
            <input
              type="file"
              required
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
            />
            <p className="text-[11px] text-slate-400 mt-2">
              Allowed types: image/png, image/jpeg, image/webp. SVG or executable formats are strictly rejected by the server.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setUploadModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {uploading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Asset Preview Modal with Authenticated Stream */}
      <Modal
        isOpen={Boolean(previewAsset)}
        onClose={() => setPreviewAsset(null)}
        title={previewAsset?.originalFilename || 'Media Asset Details'}
        maxWidth="lg"
      >
        {previewAsset && (
          <div className="space-y-4">
            {/* Authenticated image preview fetch */}
            <div className="w-full max-h-80 bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center p-2 border border-slate-800">
              {/* Authenticated Image Renderer Component */}
              <AuthenticatedImageRenderer mediaId={previewAsset.id} alt={previewAsset.originalFilename} />
            </div>

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Media ID:</span>
                <span className="font-mono text-slate-900">{previewAsset.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">MIME Content Type:</span>
                <span className="font-mono text-slate-900">{previewAsset.contentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Size:</span>
                <span>{formatBytes(previewAsset.sizeBytes)} ({previewAsset.sizeBytes.toLocaleString()} bytes)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">SHA-256 Hash:</span>
                <span className="font-mono text-[10px] text-slate-800 truncate max-w-xs">{previewAsset.sha256}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Created At:</span>
                <span>{new Date(previewAsset.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Close Preview
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteAssetId)}
        onClose={() => setDeleteAssetId(null)}
        onConfirm={handleDelete}
        title="Delete Media Asset"
        message="Are you sure you want to permanently delete this media asset? The stored file will be removed from local storage immediately."
        confirmLabel="Delete Asset"
        isDestructive
        isLoading={deleting}
      />
    </div>
  );
}

/** Component to stream authenticated media content bytes into an object URL */
function AuthenticatedImageRenderer({ mediaId, alt }: { mediaId: string; alt: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    async function loadImage() {
      try {
        const token = api.getAccessToken();
        const res = await fetch(`${API_BASE_URL}/admin/media/${mediaId}/content`, {
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) throw new Error('Failed to load image');

        const blob = await res.blob();
        if (active) {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadImage();

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mediaId]);

  if (loading) {
    return <span className="text-xs text-slate-400 animate-pulse">Loading authenticated bytes...</span>;
  }

  if (loadError || !blobUrl) {
    return <span className="text-xs text-slate-500">Preview not available for this asset type.</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={blobUrl}
      alt={alt}
      className="max-h-72 max-w-full object-contain rounded-lg"
    />
  );
}
