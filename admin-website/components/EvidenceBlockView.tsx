import React from 'react';
import { isHttpUrl, readEvidence } from '../lib/evidence-block';
import MediaImage from './MediaImage';

/**
 * A historical-evidence block as the author or previewer sees it. The author's explanation, the quoted source text and the source
 * attribution are shown as three distinct parts. Anything an author must still add before publishing is shown on the block itself.
 */
export default function EvidenceBlockView({ content }: { content: unknown }) {
  const e = readEvidence(content);
  if (!e.title && !e.dateLabel && !e.explanation && !e.quote && !e.citation && !e.mediaId) {
    return <span className="text-slate-600 italic font-sans text-xs">(No evidence entered yet)</span>;
  }
  const missing = [!e.title.trim() && 'a title', !e.dateLabel.trim() && 'a date or period', !e.explanation.trim() && 'an explanation', !e.citation.trim() && 'a source', e.mediaId && !e.altText.trim() && 'a description of its image'].filter(Boolean);
  return (
    <section className="font-sans space-y-2">
      {e.malformed && (
        <p role="alert" className="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-900">
          Part of this block is stored in an unexpected form and cannot be shown to learners. Open &ldquo;Edit Evidence&rdquo; and save to rebuild it.
        </p>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 break-words">{e.dateLabel || <em className="normal-case font-normal text-slate-600">No date or period yet</em>}</p>
      <h4 className="text-base font-semibold text-slate-900 break-words">{e.title || <em className="font-normal text-slate-600">No title yet</em>}</h4>
      {e.explanation && <p className="text-sm text-slate-800 whitespace-pre-line break-words">{e.explanation}</p>}
      {e.quote && (
        <blockquote className="border-l-4 border-slate-400 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Source quotation</p>
          <p className="text-sm italic text-slate-900 whitespace-pre-line break-words">{e.quote}</p>
        </blockquote>
      )}
      {(e.citation || e.url) && (
        <p className="text-xs text-slate-800 break-words">
          <span className="font-semibold">Source:</span> {e.citation || <em>no source named yet</em>}
          {e.url && (isHttpUrl(e.url) ? (
            <>
              {' '}
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline text-amber-900">
                Open the source website (external link)
              </a>
            </>
          ) : (
            <span className="ml-1 text-rose-800">(the source link is not a valid web address)</span>
          ))}
        </p>
      )}
      {e.mediaId && (
        <figure className="max-w-md">
          <MediaImage mediaId={e.mediaId} alt={e.altText} className="block w-full h-auto max-h-64 rounded-lg border border-slate-200" fit="contain" />
          {e.caption && <figcaption className="mt-1 text-xs text-slate-800">{e.caption}</figcaption>}
          {e.credit && <p className="text-xs text-slate-600">Credit: {e.credit}</p>}
        </figure>
      )}
      {missing.length > 0 && <p className="text-xs font-medium text-amber-800">Needs {missing.join(', ')} before the lesson can be published.</p>}
    </section>
  );
}
