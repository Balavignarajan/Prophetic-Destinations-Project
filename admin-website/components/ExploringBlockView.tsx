'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { readExploring } from '../lib/continue-exploring';
import type { LearningLevel } from '../lib/types';
import { friendlyError } from '../lib/ui-messages';
import MediaImage from './MediaImage';

interface Target {
  id: string;
  title: string;
  status: string;
  courseTitle: string;
  moduleTitle: string | null;
}

interface PreviewCard {
  lessonId: string;
  label: string | null;
  title: string;
  subtitle: string | null;
  coverMediaId: string | null;
}

interface Preview {
  level: LearningLevel;
  lessonAvailableAtLevel: boolean;
  blockVisibleAtLevel: boolean;
  authoredLinks: number;
  cards: PreviewCard[];
  omitted: { lessonId: string; label: string | null; reason: string }[];
}

const LEVELS: LearningLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LEVEL_NAMES: Record<string, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };
const BTN = 'px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500';

const REASONS: Record<string, (level: string) => string> = {
  LESSON_DELETED: () => 'The linked lesson no longer exists. Remove this link.',
  LINK_HIDDEN_AT_LEVEL: (level) => `This link is set not to show at ${level}.`,
  NOT_PUBLISHED_AT_LEVEL: (level) => `The linked lesson is not published at ${level} (it may be a draft, withdrawn or not offered at this level).`,
  NOT_IN_PUBLISHED_CATALOG: () => 'The linked lesson is published but is not listed in its course’s published catalog.',
  NOT_AVAILABLE: () => 'The linked lesson’s published content could not be used.',
};

/** Ordered target details for the links of a block, fetched with ONE batch lookup (also reused by the preview below for author-only notes). */
function useTargets(ids: string[]): { targets: Map<string, Target> | null; error: boolean; retry: () => void } {
  const key = ids.join(',');
  const [targets, setTargets] = useState<Map<string, Target> | null>(ids.length === 0 ? new Map() : null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) {
      setTargets(new Map());
      return;
    }
    let cancelled = false;
    setError(false);
    api
      .request<{ items: Target[] }>(`/admin/lessons/lookup?ids=${key}`)
      .then((res) => !cancelled && setTargets(new Map(res.items.map((i) => [i.id.toLowerCase(), i]))))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);
  return { targets, error, retry: () => setAttempt((n) => n + 1) };
}

function StatusBadge({ target }: { target: Target | undefined }) {
  if (!target) return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900 border border-rose-200">Deleted</span>;
  return target.status === 'PUBLISHED' ? (
    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 border border-emerald-200">Published</span>
  ) : (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 border border-amber-200" title="Learners will not see this link until the lesson is published">
      Not published yet ({target.status.toLowerCase().replace(/_/g, ' ')})
    </span>
  );
}

/**
 * The WORKING preview of a Continue Exploring block, asked of the server for one level: the block's saved selection (not the source lesson's published one;
 * the source need not be published) with the learner delivery rules (link level, target active publication at the level, target in its course's active
 * catalog). Learner-style cards (published titles and covers only) are kept apart from author-only notes explaining why a link is left out. Nothing is
 * published, saved or changed by looking at it.
 */
function ExploringPreviewPanel({ lessonId, blockId, level, targets, refreshKey }: { lessonId: string; blockId: string; level: LearningLevel; targets: Map<string, Target> | null; refreshKey: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; data: Preview }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .request<Preview>(`/admin/lessons/${lessonId}/blocks/${blockId}/exploring-preview?level=${level}`)
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [lessonId, blockId, level, attempt, refreshKey]);

  const name = LEVEL_NAMES[level];
  if (state.status === 'loading') return <p role="status" className="text-sm text-slate-700">Checking which lessons would be offered at {name}…</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-rose-900">
        The preview could not be loaded. <button type="button" className="underline font-medium" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </p>
    );
  }
  const { data } = state;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-amber-900">Working copy preview for {name}: this is what learners would see once the lesson is published. Nothing here is published.</p>
      {!data.lessonAvailableAtLevel && <p className="text-xs text-amber-900">This lesson is not offered at {name}, so no learner there would see this block.</p>}
      {data.lessonAvailableAtLevel && !data.blockVisibleAtLevel && <p className="text-xs text-amber-900">This block is not set visible at {name} (see the block&rsquo;s levels), so learners there would not see it.</p>}

      {data.cards.length > 0 ? (
        <ul className="space-y-2" aria-label={`Links a ${name} learner would see`}>
          {data.cards.map((c) => (
            <li key={c.lessonId} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
              {c.coverMediaId && <MediaImage mediaId={c.coverMediaId} alt="" className="h-10 w-14 rounded" fit="cover" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 break-words">{c.label?.trim() || c.title}</span>
                {c.label?.trim() && <span className="block text-xs text-slate-600 break-words">Lesson: {c.title}</span>}
                {c.subtitle && <span className="block text-xs text-slate-700 break-words">{c.subtitle}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : data.authoredLinks === 0 ? (
        <p className="text-sm text-slate-700">No lessons are chosen yet, so learners would see nothing here.</p>
      ) : (
        <p className="text-sm text-slate-700">None of the {data.authoredLinks} chosen {data.authoredLinks === 1 ? 'lesson' : 'lessons'} would be shown at {name}; learners would see no section at all.</p>
      )}

      {data.omitted.length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5">
          <p className="text-xs font-semibold text-slate-800">Author notes (not shown to learners): left out at {name}</p>
          <ul className="mt-1 space-y-1">
            {data.omitted.map((o) => {
              const target = targets?.get(o.lessonId.toLowerCase());
              return (
                <li key={o.lessonId} className="text-xs text-slate-800 break-words">
                  <strong>{o.label?.trim() || target?.title || 'A lesson'}</strong>
                  {o.label?.trim() && target ? ` (lesson: ${target.title})` : ''}: {(REASONS[o.reason] ?? REASONS.NOT_AVAILABLE)(name)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface Props {
  content: unknown;
  lessonId: string;
  blockId: string;
  /** 'working': the block in the working list (target details, preview on request). 'preview': inside the lesson preview for `level` (learner-style cards shown directly). */
  mode: 'working' | 'preview';
  level?: LearningLevel;
}

/**
 * A Continue Exploring block for the author: every chosen lesson in the author's order with its title, course and module, optional label, link levels
 * and whether it is deleted, not published yet or published (one batch lookup for all links), plus the working preview. These are the BLOCK's links;
 * the lesson's metadata “Related lessons” are a separate list.
 */
export default function ExploringBlockView({ content, lessonId, blockId, mode, level = 'BEGINNER' }: Props) {
  const c = readExploring(content);
  const { targets, error, retry } = useTargets(c.links.map((l) => l.lessonId));
  const [previewLevel, setPreviewLevel] = useState<LearningLevel>(level);
  const [open, setOpen] = useState(false);
  const refreshKey = JSON.stringify(c.links);

  if (!c.title && c.links.length === 0 && c.malformed === 0) return <span className="text-slate-600 italic font-sans text-xs">(No lessons chosen yet)</span>;
  const levelsText = (levels: string[] | null) => (levels ? levels.map((l) => LEVEL_NAMES[l] ?? l).join(', ') : 'every level');

  return (
    <section className="font-sans rounded-lg border border-slate-300 bg-white p-3 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Continue exploring</p>
      <h4 className="text-sm font-semibold text-slate-900 break-words">{c.title || 'Continue exploring'}</h4>
      {c.malformed > 0 && (
        <p role="alert" className="text-xs text-rose-900">
          {c.malformed === 1 ? 'One stored entry is' : `${c.malformed} stored entries are`} not a valid link and will not be shown to learners. Open the editor and save to rebuild the list.
        </p>
      )}

      {mode === 'working' && (
        <>
          {c.links.length === 0 ? (
            <p className="text-xs font-medium text-amber-800">Before the lesson can be published: choose at least one lesson.</p>
          ) : error ? (
            <p role="alert" className="text-xs text-rose-900">
              The chosen lessons&rsquo; details could not be loaded. <button type="button" className="underline font-medium" onClick={retry}>Try again</button>
            </p>
          ) : targets === null ? (
            <p role="status" className="text-xs text-slate-700">Loading the chosen lessons…</p>
          ) : (
            <ol className="space-y-1.5">
              {c.links.map((l, i) => {
                const t = targets.get(l.lessonId);
                return (
                  <li key={l.id || i} className="text-sm text-slate-900 break-words">
                    <span className="font-medium">{i + 1}. {t ? t.title : 'A lesson that no longer exists'}</span> <StatusBadge target={t} />
                    {t && <span className="block text-xs text-slate-600">{[t.courseTitle, t.moduleTitle ?? 'Directly in the course'].join(' › ')}</span>}
                    <span className="block text-xs text-slate-700">
                      {l.label ? `Shown to learners as: ${l.label}` : 'Shown to learners with the lesson’s own published title'} · link shown at {levelsText(l.levels)}
                    </span>
                    {!t && <span className="block text-xs font-medium text-rose-800">This link will not be shown and blocks publishing until it is removed.</span>}
                  </li>
                );
              })}
            </ol>
          )}
          <p className="text-xs text-slate-700">Learners see only the linked lessons that are published for their level. These links are separate from the lesson&rsquo;s Related lessons.</p>

          {c.links.length > 0 && (
            <div className="pt-1">
              <button type="button" className={BTN} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide learner preview' : 'Preview as a learner (working copy)'}
              </button>
              {open && (
                <div className="mt-2 space-y-2">
                  <fieldset>
                    <legend className="text-xs font-semibold text-slate-800">Preview at level</legend>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {LEVELS.map((lv) => (
                        <label key={lv} className="inline-flex items-center gap-1.5 text-sm text-slate-800">
                          <input type="radio" name={`ce-level-${blockId}`} className="accent-amber-600" checked={previewLevel === lv} onChange={() => setPreviewLevel(lv)} />
                          {LEVEL_NAMES[lv]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <ExploringPreviewPanel lessonId={lessonId} blockId={blockId} level={previewLevel} targets={targets} refreshKey={refreshKey} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'preview' && <ExploringPreviewPanel lessonId={lessonId} blockId={blockId} level={level} targets={targets} refreshKey={refreshKey} />}
    </section>
  );
}
