'use client';

import React from 'react';
import MediaImage from './MediaImage';

/** A small, decorative cover thumbnail for list rows (the title next to it already names the item); neutral box when no cover is set. */
export default function CoverThumb({ mediaId }: { mediaId: string | null | undefined }) {
  if (!mediaId) {
    return <div aria-hidden="true" className="h-10 w-14 shrink-0 rounded-md border border-slate-200 bg-slate-100" />;
  }
  return (
    <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <MediaImage mediaId={mediaId} alt="" className="h-10 w-14 text-[0px]" />
    </div>
  );
}
