'use client';

import React, { useState } from 'react';
import { PICKER_GROUPS, filterPickerBlocks } from '../lib/block-picker';
import { REUSABLE_PICKER_KEY } from '../lib/reusable-blocks';
import { useScriptureInfo } from '../lib/scripture-info';
import { Modal } from './ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the internal type key. The caller closes this picker first and then opens the matching editor (never two dialogs at once). */
  onChoose: (type: string) => void;
}

/**
 * "Add content": one place to start every kind of content block. Built on the shared Modal, so Escape closes it, focus stays inside and
 * returns to the "Add content" button. Choosing a type only opens that type's own editor: nothing is created until that editor is saved.
 */
function Body({ onClose, onChoose }: Omit<Props, 'isOpen'>) {
  const [query, setQuery] = useState('');
  const scripture = useScriptureInfo();
  const results = filterPickerBlocks(query);

  const scriptureNote = (): string | null => {
    if (scripture.loading) return null;
    if (scripture.error) return 'We could not check whether the Bible text is installed. You can still add this block and save a draft.';
    if (!scripture.available) {
      return 'The Bible text is not installed yet, so you cannot choose a real passage for now. You can still add this block and save it as a draft, but it cannot be published until the Bible text is installed.';
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Not a content type: opens the reusable block library, where a block saved from another lesson is inserted as an independent copy. */}
      <button
        type="button"
        onClick={() => onChoose(REUSABLE_PICKER_KEY)}
        className="w-full text-left rounded-xl border border-amber-300 bg-amber-50/40 p-3.5 hover:border-amber-500 hover:bg-amber-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <span className="block text-sm font-semibold text-slate-900">Insert from reusable blocks</span>
        <span className="mt-0.5 block text-xs text-slate-700">Add a copy of a block you saved from another lesson. The copy is independent: changing it never changes the original.</span>
      </button>

      <div>
        <label htmlFor="add-content-search" className="block text-sm font-semibold text-slate-800 mb-1.5">
          Search content types
        </label>
        <input
          id="add-content-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="For example: image, quiz, timeline"
          autoComplete="off"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600"
        />
      </div>

      <p role="status" className="sr-only">
        {results.length === 0 ? 'No content types match your search.' : `${results.length} content ${results.length === 1 ? 'type' : 'types'} shown.`}
      </p>

      {results.length === 0 ? (
        <p className="p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700">
          No content type matches &ldquo;{query.trim()}&rdquo;. Try a shorter word, or clear the search to see everything you can add.
        </p>
      ) : (
        <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-5">
          {PICKER_GROUPS.map((group) => {
            const items = results.filter((block) => block.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`add-content-${group.replace(/\s+/g, '-')}`}>
                <h3 id={`add-content-${group.replace(/\s+/g, '-')}`} className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                  {group}
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((block) => {
                    const note = block.scripture === 'passage' ? scriptureNote() : null;
                    return (
                      <li key={block.type}>
                        <button
                          type="button"
                          onClick={() => onChoose(block.type)}
                          className="h-full w-full text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-amber-500 hover:bg-amber-50/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          <span className="block text-sm font-semibold text-slate-900">{block.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-700">{block.description}</span>
                          {note && <span className="mt-1.5 block text-xs text-amber-900">{note}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AddContentPicker({ isOpen, onClose, onChoose }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add content" description="Choose what to add to this lesson. You will fill in the details next." maxWidth="2xl">
      <Body onClose={onClose} onChoose={onChoose} />
    </Modal>
  );
}
