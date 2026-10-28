'use client';

import React from 'react';
import { useAuth } from '../../lib/auth';
import MediaLibrary from '../../components/media-library/MediaLibrary';

/**
 * The Media Library page. The library itself (tabs, search, sort, grid and list, the details drawer and the upload dialog) lives in components/media-library; the pickers inside the lesson and
 * course editors keep using components/MediaBrowser and components/ImageUploadPanel, which are unchanged.
 */
export default function MediaLibraryPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  return <MediaLibrary canWrite={canWrite} />;
}
