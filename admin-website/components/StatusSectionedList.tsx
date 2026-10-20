'use client';

import React, { useRef } from 'react';
import { EmptyState } from './ui';
import ReorderableList from './ReorderableList';

interface Props<T extends { id: string; status: string }> {
  /** ALL items of the parent, in the backend's order (position). */
  items: T[];
  canWrite: boolean;
  /** "module" or "lesson" (lower case, singular). */
  noun: string;
  listLabel: string;
  itemLabel: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Saves the COMPLETE order of all items; `previousIds` is the complete order last seen. Returns all items as stored. */
  save: (ids: string[], previousIds: string[]) => Promise<T[]>;
  /** Told all items as stored after a successful save. */
  onSaved: (items: T[]) => void;
  onReload: () => void;
  savedNote: string;
  onPublish?: () => void;
}

/**
 * The items of a module or lesson list split by their real status, like the course's direct lessons: Published (ordered by drag and drop), Waiting for
 * review or approved (only when there are any), and Draft. Only PUBLISHED items take part in the ordering. The backend wants the COMPLETE list, so a
 * save sends every item with each non-published one kept in its own slot (the published ones fill the published slots in the new order), plus the complete
 * order last seen; the server then refuses a stale order (409) or any move of a non-published item. Saving changes the authoring order only: nothing is
 * published, approved or edited. Learners see the order after the parent is published again.
 */
export default function StatusSectionedList<T extends { id: string; status: string }>({ items, canWrite, noun, listLabel, itemLabel, renderItem, save, onSaved, onReload, savedNote, onPublish }: Props<T>) {
  const published = items.filter((i) => i.status === 'PUBLISHED');
  const drafts = items.filter((i) => i.status === 'DRAFT');
  const inReview = items.filter((i) => i.status === 'READY_FOR_REVIEW' || i.status === 'APPROVED');
  const stored = useRef<T[]>(items);
  const plural = `${noun}s`;
  const notPublished = drafts.length + inReview.length;

  const plain = (list: T[]) => (
    <ul className="bg-white border border-slate-200 rounded-xl shadow-xs divide-y divide-slate-100 overflow-hidden">
      {list.map((item, index) => (
        <li key={item.id} className="px-4 py-4 hover:bg-slate-50/60 transition-colors">{renderItem(item, index)}</li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ Published */}
      <section aria-label={`Published ${plural}`} className="space-y-3">
        <div>
          <h3 className="font-serif text-lg font-bold text-slate-900">Published {plural[0].toUpperCase() + plural.slice(1)}</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            {published.length} published{notPublished > 0 ? ` · ${notPublished} not published` : ''}. Drag {plural} to set the order learners will follow.
          </p>
        </div>
        {published.length === 0 ? (
          <EmptyState title={`No published ${plural}`} description={`${noun[0].toUpperCase() + noun.slice(1)}s appear here once they are published. Others are listed below.`} />
        ) : (
          <ReorderableList
            items={published}
            canWrite={canWrite}
            listLabel={listLabel}
            itemLabel={itemLabel}
            renderItem={renderItem}
            save={async (ids) => {
              // Every non-published item keeps its slot; the published ones fill the published slots in the new order.
              const remaining = [...ids];
              const full = items.map((i) => (i.status === 'PUBLISHED' ? (remaining.shift() as string) : i.id));
              const all = await save(full, items.map((i) => i.id));
              stored.current = all;
              return all.filter((i) => i.status === 'PUBLISHED');
            }}
            onSaved={() => onSaved(stored.current)}
            onReload={onReload}
            savedNote={savedNote}
            onPublish={onPublish}
          />
        )}
      </section>

      {/* ------------------------------------------------------------ In review / approved */}
      {inReview.length > 0 && (
        <section aria-label={`${noun} waiting for review or approved`} className="space-y-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-slate-900">Waiting for Review or Approved</h3>
            <p className="text-xs text-slate-600 mt-0.5">{inReview.length} {inReview.length === 1 ? noun : plural} not published yet. They are not part of the published order.</p>
          </div>
          {plain(inReview)}
        </section>
      )}

      {/* ------------------------------------------------------------ Drafts */}
      <section aria-label={`Draft ${plural}`} className="space-y-3">
        <div>
          <h3 className="font-serif text-lg font-bold text-slate-900">Draft {plural[0].toUpperCase() + plural.slice(1)}</h3>
          <p className="text-xs text-slate-600 mt-0.5">{drafts.length} draft{drafts.length === 1 ? '' : 's'}. A {noun} edited after it was published returns to Draft here until it is published again.</p>
        </div>
        {drafts.length === 0 ? <EmptyState title={`No draft ${plural}`} description={`New ${plural} start as drafts.`} /> : plain(drafts)}
      </section>
    </div>
  );
}
