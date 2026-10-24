'use client';

import React from 'react';
import { readImageContent } from '../lib/image-block';
import MediaImage from './MediaImage';

/** An image block as the author sees it in the lesson: the picture, its caption and source, and a note when it has no description yet. */
export default function ImageBlockView({ content }: { content: unknown }) {
  const image = readImageContent(content);
  if (!image.mediaId) {
    return <span className="text-slate-600 italic font-sans text-xs">(No image chosen yet)</span>;
  }
  return (
    <figure className="font-sans">
      <MediaImage mediaId={image.mediaId} alt={image.altText} className="max-h-72 w-full rounded-lg border border-slate-200" fit="contain" />
      {image.caption && <figcaption className="mt-2 text-sm text-slate-800">{image.caption}</figcaption>}
      {image.source && <p className="text-xs text-slate-600">Source: {image.source}</p>}
      {!image.altText && <p className="mt-1 text-xs font-medium text-amber-800">No description yet: add alternative text before publishing.</p>}
    </figure>
  );
}
