'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { friendlyBlockName } from '../../lib/block-catalog';
import { LIBRARY_LEVELS, contentForLevel, firstPreviewLevel } from '../../lib/reusable-library';
import { levelName, reusableErrorMessage, shortDate } from '../../lib/reusable-blocks';
import type { LearningLevel, ReusableBlock } from '../../lib/types';
import { Choice } from '../lesson-preview/Choice';
import BlockPhone from '../lesson-preview/BlockPhone';
import type { PreviewBlock } from '../lesson-preview/LessonPhone';
import { PREVIEW_THEME_NAMES, type PreviewTheme } from '../lesson-preview/theme';
import ReusableBlockView from '../ReusableBlockView';
import { LoadingSpinner, Modal } from '../ui';
import BlockTypeIcon from './BlockTypeIcon';
import { LevelBadges } from './ReusableBlockItems';

type View = 'phone' | 'details';
const VIEW_NAMES: Record<View, string> = { phone: 'Mobile preview', details: 'Content details' };
const LEVEL_NAMES: Record<LearningLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

/**
 * "Preview Block": a reusable block as a learner would meet a copy of it in the mobile app, in a phone-shaped frame (the Lesson Preview's own block components and theme, so a timeline event, a
 * hotspot, an expandable explanation, Scripture or a 3D model behave as they do in a lesson), or as the editor lists it ("Content details": the shared content and each level's own version).
 *
 * The learning level and the theme are a SIMULATION for this window only. The level shows what a lesson at that level would receive when the block is inserted (the level's own version if it has one, else
 * the shared content; nothing if the block was not saved as visible at that level); it never changes which levels the block is saved with. Reading only: nothing is saved, published or sent, no learner
 * progress is touched, and a copy already in a lesson is a separate block that this window cannot reach.
 */
export default function BlockPreviewDialog({ id, name, canWrite, onClose, onEdit }: { id: string; name: string; canWrite: boolean; onClose: () => void; onEdit: (block: ReusableBlock) => void }) {
  const [block, setBlock] = useState<ReusableBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [level, setLevel] = useState<LearningLevel>('BEGINNER');
  const [theme, setTheme] = useState<PreviewTheme>('dark');
  const [view, setView] = useState<View>('phone');

  // Read the whole block (the list never carries content). A new window always starts from what the server holds now.
  useEffect(() => {
    let cancelled = false;
    setBlock(null);
    setError(null);
    api
      .request<ReusableBlock>(`/admin/reusable-blocks/${id}`)
      .then((found) => {
        if (cancelled) return;
        setBlock(found);
        setLevel(firstPreviewLevel(found));
      })
      .catch((err: unknown) => !cancelled && setError(reusableErrorMessage(err, 'Could not open this reusable block.')));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const chosen = useMemo(() => (block ? contentForLevel(block, level) : null), [block, level]);
  const phoneBlock = useMemo<PreviewBlock | null>(() => {
    if (!block || !chosen || !chosen.available || chosen.content === null) return null;
    return { blockId: block.id, type: block.type, ordinal: 0, source: chosen.ownVersion ? 'VARIANT' : 'SHARED', content: chosen.content };
  }, [block, chosen]);

  const unavailable = chosen && !chosen.available ? { title: `Not available at the ${LEVEL_NAMES[level]} level`, message: `This reusable block was not saved as visible at the ${LEVEL_NAMES[level]} level, so inserting it into a lesson at that level would leave it out.` } : { title: 'Nothing to show', message: 'This block has no content to show.' };

  return (
    <Modal isOpen onClose={onClose} title={block?.name ?? name} description="Reusable block preview. Reading only: nothing is saved or published." maxWidth="5xl">
      {error ? (
        <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p>{error}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-rose-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Try again
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
              Close
            </button>
          </div>
        </div>
      ) : !block || !chosen ? (
        <LoadingSpinner text="Opening the block..." />
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <aside aria-label="Block details and preview controls" className="w-full shrink-0 space-y-5 md:w-72">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
                  <BlockTypeIcon type={block.type} className="h-4 w-4" />
                </span>
                {friendlyBlockName(block.type)}
              </p>
              {block.description && <p className="text-xs text-slate-800 wrap-break-word">{block.description}</p>}
              <LevelBadges levels={block.levels.map((entry) => ({ level: entry.level, hasVariant: entry.content !== null }))} />
              <p className="text-xs text-slate-700">Updated {shortDate(block.updatedAt)}</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">View</p>
              <Choice label="Preview view" value={view} options={['phone', 'details'] as const} names={VIEW_NAMES} onChange={setView} />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Preview level</p>
              <Choice label="Preview level" value={level} options={LIBRARY_LEVELS} names={LEVEL_NAMES} onChange={setLevel} />
              <p className="text-xs text-slate-700" aria-live="polite">
                {chosen.available ? (chosen.savedWithoutLevels ? 'This block was saved with no levels, so its shared content is shown at every level.' : chosen.ownVersion ? `Showing the ${levelName(level)} version of this block.` : `Showing the shared content (the ${levelName(level)} level has no version of its own).`) : unavailable.message}
              </p>
              <p className="text-xs text-slate-600">A preview setting only. It does not change which levels this block is available to.</p>
            </div>

            {view === 'phone' && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">Theme</p>
                <Choice label="Reading theme" value={theme} options={['dark', 'light'] as const} names={PREVIEW_THEME_NAMES} onChange={setTheme} />
                <p className="text-xs text-slate-600">Dark is the app&rsquo;s default. This only changes the preview.</p>
              </div>
            )}

            <ul className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-700">
              <li>
                <span className="font-semibold text-slate-900">A template, not a lesson.</span> Inserting it adds an independent copy; changing or deleting this block never changes a copy in a lesson.
              </li>
              <li>
                <span className="font-semibold text-slate-900">Not published.</span> Learners never see a reusable block itself.
              </li>
            </ul>

            <div className="flex flex-wrap gap-2">
              {canWrite && (
                <button type="button" onClick={() => onEdit(block)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                  Edit Block
                </button>
              )}
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
                Close
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 justify-center">
            {view === 'phone' ? (
              <div className="h-[min(42rem,68dvh)] min-h-[26rem] w-full max-w-[24.5rem]">
                <BlockPhone key={level} theme={theme} level={level} block={phoneBlock} unavailable={unavailable} />
              </div>
            ) : (
              <div className="w-full space-y-5">
                <section aria-labelledby="rb-pv-shared" className="space-y-2">
                  <h4 id="rb-pv-shared" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Shared content
                  </h4>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-serif text-sm text-slate-800">
                    <ReusableBlockView type={block.type} content={block.sharedContent} />
                  </div>
                </section>
                {block.levels
                  .filter((entry) => entry.content !== null)
                  .map((entry) => (
                    <section key={entry.level} aria-label={`${levelName(entry.level)} version`} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-800">{levelName(entry.level)} version</h4>
                      <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4 font-serif text-sm text-slate-800">
                        <ReusableBlockView type={block.type} content={entry.content} />
                      </div>
                    </section>
                  ))}
                <p className="text-xs text-slate-700">When it is inserted into a lesson, only the levels that lesson is available at are used.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
