'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { IMPLEMENTED_BLOCKS, friendlyBlockName } from '../lib/block-catalog';
import { insertionHint, leftOutFromError, levelName, levelsText, reusableErrorMessage, reusableTypeProblem, versionsText } from '../lib/reusable-blocks';
import type { LearningLevel, LessonBlock, ReusableBlock, ReusableBlockSummary } from '../lib/types';
import ReusableBlockView from './ReusableBlockView';
import { Modal } from './ui';

const FIELD = 'w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const FILTER_TYPES = IMPLEMENTED_BLOCKS.filter((block) => reusableTypeProblem(block.type) === null);

interface LeftOutItem {
  level: string;
  hadVariant: boolean;
  reason: string;
}

interface Props {
  isOpen: boolean;
  lessonId: string;
  /** The levels the lesson is available at. */
  lessonLevels: LearningLevel[];
  /** The lesson's blocks in order, to choose the place of the new block. */
  blocks: LessonBlock[];
  onClose: () => void;
  /** The server confirmed the insertion: the new block, and what (if anything) was not carried over. */
  onInserted: (result: { block: LessonBlock; leftOut: LeftOutItem[]; templateName: string }) => void;
}

/** Why a level is left out, in words. */
function leftOutText(item: LeftOutItem): string {
  if (item.reason === 'VARIANTS_NOT_SUPPORTED') return `its own ${levelName(item.level)} version (this kind of block no longer supports level versions; the ${levelName(item.level)} level will use the shared content)`;
  return `the ${levelName(item.level)} level${item.hadVariant ? ' and its own version' : ''} (this lesson is not available at that level, and its levels are not changed)`;
}

function Body({ lessonId, lessonLevels, blocks, onClose, onInserted }: Omit<Props, 'isOpen'>) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [items, setItems] = useState<ReusableBlockSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const [selected, setSelected] = useState<ReusableBlockSummary | null>(null);
  const [detail, setDetail] = useState<ReusableBlock | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [position, setPosition] = useState('end');
  const [agreed, setAgreed] = useState(false);
  const [serverLeftOut, setServerLeftOut] = useState<LeftOutItem[] | null>(null);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mine = (requestRef.current += 1);
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams({ limit: '50' });
        if (search.trim()) params.set('q', search.trim());
        if (typeFilter) params.set('type', typeFilter);
        setListError(null);
        api
          .request<{ items: ReusableBlockSummary[] }>(`/admin/reusable-blocks?${params.toString()}`)
          .then((res) => {
            if (mine === requestRef.current) setItems(res.items);
          })
          .catch((err: unknown) => {
            if (mine !== requestRef.current) return;
            setItems([]);
            setListError(reusableErrorMessage(err, 'Could not load the reusable blocks.'));
          });
      },
      search ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [search, typeFilter]);

  const choose = (item: ReusableBlockSummary) => {
    setSelected(item);
    setDetail(null);
    setDetailError(null);
    setAgreed(false);
    setServerLeftOut(null);
    setError(null);
    const mine = (detailRequestRef.current += 1);
    api
      .request<ReusableBlock>(`/admin/reusable-blocks/${item.id}`)
      .then((found) => {
        if (mine === detailRequestRef.current) setDetail(found);
      })
      .catch((err: unknown) => {
        if (mine === detailRequestRef.current) setDetailError(reusableErrorMessage(err, 'Could not open this reusable block.'));
      });
  };

  const hint = selected ? insertionHint(selected.levels, lessonLevels) : null;
  // What would be left out: what the lesson's levels say now, or what the server said when it refused (it has the last word).
  const leftOut: LeftOutItem[] = serverLeftOut ?? (hint ? hint.leftOut.map((entry) => ({ ...entry, reason: 'LESSON_NOT_AVAILABLE_AT_LEVEL' })) : []);
  const noCommonLevel = Boolean(selected && selected.levels.length > 0 && hint && hint.carried.length === 0);
  const needsAgreement = leftOut.length > 0;
  const canInsert = Boolean(selected) && !noCommonLevel && !inserting && (!needsAgreement || agreed);

  const insert = async () => {
    if (!selected || !canInsert) return;
    setInserting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { lessonId, acknowledgeLeftOut: needsAgreement && agreed };
      if (position !== 'end') body.position = Number(position);
      const result = await api.request<{ block: LessonBlock; leftOut: LeftOutItem[] }>(`/admin/reusable-blocks/${selected.id}/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onInserted({ block: result.block, leftOut: result.leftOut ?? [], templateName: selected.name });
    } catch (err: unknown) {
      const fromServer = leftOutFromError(err);
      if (fromServer) {
        // The server found something that would not be carried over that this screen did not show: it is shown now and nothing was inserted.
        setServerLeftOut(fromServer);
        setAgreed(false);
        setError('Before this can be inserted, please review what would be left out below and confirm.');
      } else {
        setError(reusableErrorMessage(err, 'Could not insert the reusable block.'));
      }
    } finally {
      setInserting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        Inserting adds an <strong>independent copy</strong> to this lesson as a new block. Changing the copy never changes the reusable block, and changing or deleting the reusable block never
        changes the copy. The lesson becomes a draft edit; nothing is published.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="rb-insert-search" className="sr-only">
            Search reusable blocks by name
          </label>
          <input id="rb-insert-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" autoComplete="off" className={FIELD} />
        </div>
        <div className="sm:w-56">
          <label htmlFor="rb-insert-type" className="sr-only">
            Filter by block type
          </label>
          <select id="rb-insert-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={FIELD}>
            <option value="">All block types</option>
            {FILTER_TYPES.map((block) => (
              <option key={block.type} value={block.type}>
                {block.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {listError && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {listError}
        </p>
      )}

      {items === null ? (
        <p role="status" className="text-sm text-slate-700">
          Loading reusable blocks…
        </p>
      ) : items.length === 0 ? (
        !listError && (
          <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
            {search.trim() || typeFilter ? 'No reusable block matches. Try a shorter word, or clear the search and the block type.' : 'There are no reusable blocks yet. Use Save as reusable block on a block in a lesson to add one.'}
          </p>
        )
      ) : (
        <ul className="max-h-56 overflow-y-auto pr-1 space-y-2" aria-label="Reusable blocks">
          {items.map((item) => {
            const isSelected = selected?.id === item.id;
            const versions = versionsText(item.levels);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => choose(item)}
                  aria-pressed={isSelected}
                  className={`w-full text-left rounded-xl border p-3 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isSelected ? 'border-amber-500 bg-amber-50/50' : 'border-slate-200 bg-white hover:border-amber-400'
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-900">{item.name}</span>
                  <span className="block text-xs text-slate-700">
                    {friendlyBlockName(item.type)} · {levelsText(item.levels)}
                    {versions && <span className="text-purple-800"> · {versions}</span>}
                  </span>
                  {item.description && <span className="block text-xs text-slate-700 mt-0.5">{item.description}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <section aria-label={`About ${selected.name}`} className="space-y-3 pt-3 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{selected.name}</h3>
          <p className="text-xs text-slate-700">
            {friendlyBlockName(selected.type)} · visible at: {levelsText(selected.levels)}. This lesson is available at: {lessonLevels.length > 0 ? lessonLevels.map(levelName).join(', ') : 'no level yet'}.
          </p>
          {detailError ? (
            <p role="alert" className="text-xs text-rose-800">
              {detailError}
            </p>
          ) : detail && detail.id === selected.id ? (
            <div className="max-h-40 overflow-y-auto p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 font-serif">
              <ReusableBlockView type={detail.type} content={detail.sharedContent} />
            </div>
          ) : (
            <p className="text-xs text-slate-600">Loading preview…</p>
          )}

          {noCommonLevel && (
            <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
              This reusable block is not visible at any level this lesson is available at, so it would be hidden from every learner. It can be inserted into a lesson that offers one of its
              levels. The lesson&rsquo;s levels are never changed by an insertion.
            </p>
          )}

          {!noCommonLevel && needsAgreement && (
            <div role="alert" className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
              <p className="font-semibold">Part of this block will not be carried over:</p>
              <ul className="list-disc pl-5">
                {leftOut.map((item) => (
                  <li key={`${item.level}-${item.reason}`}>{leftOutText(item)}</li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-600" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={inserting} />
                <span>I understand, insert it without these.</span>
              </label>
            </div>
          )}

          <div>
            <label htmlFor="rb-insert-position" className="block text-sm font-semibold text-slate-800 mb-1">
              Where in the lesson
            </label>
            <select id="rb-insert-position" value={position} disabled={inserting} onChange={(e) => setPosition(e.target.value)} className={FIELD}>
              <option value="end">At the end of the lesson</option>
              {blocks.map((block, index) => (
                <option key={block.id} value={String(index + 1)}>
                  Before block {index + 1} ({friendlyBlockName(block.type)})
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
        <button type="button" onClick={onClose} disabled={inserting} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void insert()}
          disabled={!canInsert}
          aria-busy={inserting}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {inserting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          Insert into this lesson
        </button>
      </div>
    </div>
  );
}

/**
 * "Insert from reusable blocks": browse or search the library, see a block's type, levels and content, and add an independent copy to this lesson. The server decides
 * and creates the block through the normal block creation path; this screen only shows what it will do (the levels this lesson cannot carry, which need the author's
 * agreement) and reports success only after the server confirms. The form starts fresh each time it opens.
 */
export default function InsertReusableBlockDialog({ isOpen, ...rest }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={rest.onClose} title="Insert from reusable blocks" description="Choose a reusable block to add to this lesson." maxWidth="2xl">
      <Body {...rest} />
    </Modal>
  );
}
