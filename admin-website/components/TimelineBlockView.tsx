import React from 'react';
import { readTimelineContent } from '../lib/timeline-block';
import MediaImage from './MediaImage';
import ScriptureEntriesView from './ScriptureEntriesView';

/**
 * A timeline block as the author or previewer sees it: a numbered vertical list in the author's order (the numbers, not the line,
 * carry the order). Problems an author must fix before publishing are shown on the event itself instead of being hidden: a missing
 * date, title or explanation, an image without a description, and stored entries that are not usable events at all.
 */
export default function TimelineBlockView({ content }: { content: unknown }) {
  const timeline = readTimelineContent(content);
  if (!timeline.heading.trim() && timeline.events.length === 0 && timeline.malformed === 0) {
    return <span className="text-slate-600 italic font-sans text-xs">(No events yet)</span>;
  }
  return (
    <section className="font-sans">
      <h4 className="text-base font-semibold text-slate-900 break-words">{timeline.heading.trim() || 'Timeline'}</h4>
      {timeline.malformed > 0 && (
        <p role="alert" className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-900">
          {timeline.malformed === 1 ? 'One stored entry is' : `${timeline.malformed} stored entries are`} not a valid event and cannot be shown to learners. Open
          &ldquo;Edit Timeline&rdquo; and save to rebuild the list, or the lesson cannot be published.
        </p>
      )}
      <ol className="mt-3 space-y-4 border-l-2 border-slate-300 pl-4">
        {timeline.events.map((event, index) => {
          const missing = [!event.dateLabel.trim() && 'a date or period', !event.title.trim() && 'a title', !event.explanation.trim() && 'an explanation', event.mediaId && !event.altText.trim() && 'a description of its image'].filter(Boolean);
          return (
            <li key={event.id} className="relative">
              <span aria-hidden="true" className="absolute -left-[1.6rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                {index + 1}
              </span>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 break-words">
                <span className="sr-only">Event {index + 1}. </span>
                {event.dateLabel || <em className="normal-case font-normal text-slate-600">No date or period yet</em>}
              </p>
              <p className="text-sm font-semibold text-slate-900 break-words">{event.title || <em className="font-normal text-slate-600">No title yet</em>}</p>
              {event.explanation && <p className="mt-0.5 text-sm text-slate-800 whitespace-pre-line break-words">{event.explanation}</p>}
              <ScriptureEntriesView entries={event.scriptureRaw} />
              {event.mediaId && (
                <figure className="mt-2 max-w-md">
                  <MediaImage mediaId={event.mediaId} alt={event.altText} className="block w-full h-auto max-h-64 rounded-lg border border-slate-200" fit="contain" />
                  {event.caption && <figcaption className="mt-1 text-xs text-slate-800">{event.caption}</figcaption>}
                  {event.source && <p className="text-xs text-slate-600">Source: {event.source}</p>}
                </figure>
              )}
              {missing.length > 0 && <p className="mt-1 text-xs font-medium text-amber-800">Needs {missing.join(', ')} before the lesson can be published.</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
