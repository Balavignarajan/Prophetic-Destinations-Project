import React from 'react';
import { animationReadiness, readAnimation, readScene, sceneReadiness } from '../lib/scene-media';
import MediaImage from './MediaImage';
import ScriptureEntriesView from './ScriptureEntriesView';

const Needs = ({ items }: { items: string[] }) => (items.length > 0 ? <p className="mt-2 text-xs font-medium text-amber-800">Before the lesson can be published: {items.join(' ')}</p> : null);

/** A narrative scene as learners meet it: optional picture, title, the author's narrative, then Scripture apart from it. Still: no effect is applied. */
export function SceneView({ content }: { content: unknown }) {
  const c = readScene(content);
  if (!c.title && !c.mediaId && !c.narrative && !(Array.isArray(c.scriptureRaw) && c.scriptureRaw.length > 0)) return <span className="text-slate-600 italic font-sans text-xs">(No scene entered yet)</span>;
  return (
    <section className="font-sans">
      {c.mediaId && <MediaImage mediaId={c.mediaId} alt={c.altText} className="block w-full h-auto max-h-64 rounded-lg border border-slate-200" fit="contain" />}
      {c.title && <h4 className="mt-2 text-base font-semibold text-slate-900 break-words">{c.title}</h4>}
      {c.narrative && <p className="mt-1 text-sm text-slate-900 whitespace-pre-line break-words">{c.narrative}</p>}
      <ScriptureEntriesView entries={c.scriptureRaw} />
      <Needs items={sceneReadiness(c)} />
    </section>
  );
}

/**
 * An animated image for the author. It never autoplays here: the poster is shown if there is one, otherwise a text placeholder. Learners press Play in
 * the app. (The file itself is only used in the app; the admin does not play it.)
 */
export function AnimationView({ content }: { content: unknown }) {
  const c = readAnimation(content);
  if (!c.mediaId && !c.altText && !c.caption) return <span className="text-slate-600 italic font-sans text-xs">(No animated image chosen yet)</span>;
  return (
    <figure className="font-sans space-y-1">
      {c.posterMediaId ? (
        <MediaImage mediaId={c.posterMediaId} alt={c.altText} className="block w-full h-auto max-h-64 rounded-lg border border-slate-200" fit="contain" />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">{c.mediaId ? 'Animated image (no poster chosen). Learners press Play in the app.' : 'No animated image chosen yet.'}</div>
      )}
      {c.caption && <figcaption className="text-sm text-slate-800">{c.caption}</figcaption>}
      {c.altText && <p className="text-xs text-slate-600">Accessibility text: {c.altText}</p>}
      <Needs items={animationReadiness(c)} />
    </figure>
  );
}
