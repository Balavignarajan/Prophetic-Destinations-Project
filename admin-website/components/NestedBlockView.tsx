'use client';

import React from 'react';
import { nestedLabel } from '../lib/explore-deeper';
import { readImageContent } from '../lib/image-block';
import EvidenceBlockView from './EvidenceBlockView';
import MediaImage from './MediaImage';
import RichTextView, { hasRichTextContent } from './RichTextView';
import ScriptureBlockView from './ScriptureBlockView';
import ScriptureConnectionView from './ScriptureConnectionView';
import { CalloutBlockView } from './SectionCalloutViews';
import { SymbolStudyView, WordStudyView } from './WordSymbolViews';

/**
 * A block nested inside an Explore Deeper section, as the author or previewer sees it: the SAME view the lesson uses for that block type (the lesson list,
 * the working preview and the level preview all show a nested block with it). Content the view cannot read shows a short note, never a broken block.
 */
export default function NestedBlockView({ type, content }: { type: string; content: unknown }) {
  switch (type) {
    case 'RICH_TEXT':
      return hasRichTextContent(content) ? <RichTextView content={content} className="font-serif text-sm leading-relaxed text-slate-800" /> : <span className="text-slate-600 italic font-sans text-xs">(No text yet)</span>;
    case 'CALLOUT':
      return <CalloutBlockView content={content} />;
    case 'SCRIPTURE_PASSAGE':
      return <ScriptureBlockView content={content} />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionView content={content} />;
    case 'IMAGE': {
      const image = readImageContent(content);
      if (!image.mediaId) return <span className="text-slate-600 italic font-sans text-xs">(No image chosen yet)</span>;
      return (
        <figure className="font-sans">
          <MediaImage mediaId={image.mediaId} alt={image.altText} className="max-h-72 w-full rounded-lg border border-slate-200" fit="contain" />
          {image.caption && <figcaption className="mt-2 text-sm text-slate-800">{image.caption}</figcaption>}
          {image.source && <p className="text-xs text-slate-600">Source: {image.source}</p>}
        </figure>
      );
    }
    case 'WORD_STUDY':
      return <WordStudyView content={content} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyView content={content} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlockView content={content} />;
    default:
      return <span className="text-slate-600 italic font-sans text-xs">({nestedLabel(type)} cannot be shown here)</span>;
  }
}
