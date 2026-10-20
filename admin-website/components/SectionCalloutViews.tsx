import React from 'react';
import { calloutLabel, readCallout, readSection } from '../lib/section-callout';
import MediaImage from './MediaImage';

/** A section heading as the author or previewer sees it: a real heading, the optional subtitle, and the optional picture. */
export function SectionBlockView({ content }: { content: unknown }) {
  const s = readSection(content);
  if (!s.title && !s.subtitle && !s.mediaId) return <span className="text-slate-600 italic font-sans text-xs">(No section heading entered yet)</span>;
  return (
    <section className="font-sans space-y-1.5">
      <h3 className="text-xl font-bold text-slate-900 break-words">{s.title || <em className="font-normal text-slate-600">No title yet</em>}</h3>
      {s.subtitle && <p className="text-sm text-amber-900 break-words">{s.subtitle}</p>}
      {s.mediaId && (
        <figure className="max-w-md">
          <MediaImage mediaId={s.mediaId} alt={s.altText} className="block w-full h-auto max-h-56 rounded-lg border border-slate-200" fit="contain" />
          {!s.altText && <p className="mt-1 text-xs font-medium text-amber-800">No description yet: add one before publishing.</p>}
        </figure>
      )}
      {!s.title && <p className="text-xs font-medium text-amber-800">Needs a title before the lesson can be published.</p>}
    </section>
  );
}

/** A callout as the author or previewer sees it: the type is written out as a label, never shown by colour alone. */
export function CalloutBlockView({ content }: { content: unknown }) {
  const c = readCallout(content);
  if (!c.calloutType && !c.title && !c.body) return <span className="text-slate-600 italic font-sans text-xs">(No callout entered yet)</span>;
  const label = calloutLabel(c.calloutType);
  const missing = [!label && 'a type', !c.body.trim() && 'its text'].filter(Boolean);
  return (
    <aside className="font-sans border-l-[6px] border-amber-500 bg-amber-50/60 px-3 py-2 rounded-r-lg">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">{label || 'No type chosen yet'}</p>
      {c.title && <p className="text-sm font-semibold text-slate-900 break-words">{c.title}</p>}
      {c.body && <p className="text-sm text-slate-900 whitespace-pre-line break-words">{c.body}</p>}
      {missing.length > 0 && <p className="mt-1 text-xs font-medium text-amber-800">Needs {missing.join(' and ')} before the lesson can be published.</p>}
    </aside>
  );
}
