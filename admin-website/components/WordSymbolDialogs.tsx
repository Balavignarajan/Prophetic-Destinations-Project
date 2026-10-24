'use client';

import React, { useRef, useState } from 'react';
import {
  EMPTY_SYMBOL,
  EMPTY_WORD,
  SYMBOL_LIMITS,
  type SymbolContent,
  WORD_LIMITS,
  type WordContent,
  buildSymbol,
  buildWord,
  symbolReadiness,
  wordReadiness,
} from '../lib/word-symbol';
import type { LearningLevel } from '../lib/types';
import { versionWording } from '../lib/level-version';
import { fillIfEmpty } from '../lib/media-api';
import CoverImageField from './CoverImageField';
import ScriptureRefList from './ScriptureRefList';
import { Actions, LevelChoice, useGuardedClose } from './SectionCalloutDialogs';
import { Modal } from './ui';

const FIELD = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-slate-800 mb-1';
const HELP = 'text-xs text-slate-700 mt-1';

interface CommonProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  /** Levels the lesson is available at (a new block starts visible at all of them). */
  lessonLevels: LearningLevel[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: Record<string, unknown>, levels: LearningLevel[]) => void;
  /** Set (with mode 'edit') when the dialog edits ONE level's version of the block instead of its shared content, e.g. "Beginner". */
  levelLabel?: string;
}

type BodyProps = Omit<CommonProps, 'isOpen' | 'onClose'> & { requestClose: () => void; dirtyRef: React.MutableRefObject<boolean> };

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
      {error} What you typed here is unchanged.
    </p>
  );
}

function Missing({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p role="status" className="text-xs text-slate-700">
      A draft can be saved incomplete. Before publishing it still needs: {items.join(', ')}.
    </p>
  );
}

// ------------------------------------------------------------------------------------------------------------------------ word study

function WordBody({ mode, lessonLevels, initial, saving, error, onSave, levelLabel, requestClose, dirtyRef }: BodyProps & { initial: WordContent | null }) {
  const start = initial ?? EMPTY_WORD;
  const [draft, setDraft] = useState<WordContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<WordContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildWord(draft)) !== JSON.stringify(buildWord(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildWord(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Word study</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ws-english" className={LABEL}>English word</label>
            <input id="ws-english" type="text" maxLength={WORD_LIMITS.word} value={draft.englishWord} onChange={(e) => patch({ englishWord: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="ws-original" className={LABEL}>Original-language word</label>
            <input id="ws-original" type="text" dir="auto" maxLength={WORD_LIMITS.word} value={draft.originalWord} onChange={(e) => patch({ originalWord: e.target.value })} className={FIELD} />
            <p className={HELP}>Type or paste it exactly as it should appear (Greek or Hebrew). Nothing is looked up for you.</p>
          </div>
          <div>
            <label htmlFor="ws-translit" className={LABEL}>Transliteration</label>
            <input id="ws-translit" type="text" maxLength={WORD_LIMITS.transliteration} value={draft.transliteration} onChange={(e) => patch({ transliteration: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="ws-strong" className={LABEL}>Strong number (optional)</label>
            <input id="ws-strong" type="text" maxLength={WORD_LIMITS.strongNumber} value={draft.strongNumber} onChange={(e) => patch({ strongNumber: e.target.value })} className={FIELD} />
            <p className={HELP}>For example G3056. It is shown as written and is not linked to a concordance.</p>
          </div>
        </div>
        <div>
          <label htmlFor="ws-definition" className={LABEL}>Definition</label>
          <textarea id="ws-definition" rows={4} maxLength={WORD_LIMITS.definition} value={draft.definition} onChange={(e) => patch({ definition: e.target.value })} className={FIELD} />
          <p className={HELP}>Your own curated definition. Learners see it as your words, apart from the Scripture.</p>
        </div>
        <ScriptureRefList
          itemLabel="the word study"
          idPrefix="ws-verse"
          max={1}
          title="Verse (required before publishing)"
          emptyMessage="No verse chosen yet. You can save a draft without it, but the lesson cannot be published until one is chosen."
          entries={draft.verse}
          onChange={(verse) => patch({ verse })}
          disabled={saving}
        />
        <ScriptureRefList
          itemLabel="the word study"
          idPrefix="ws-refs"
          title="More references (optional)"
          emptyMessage="No further references. The word study is published as it is without them."
          entries={draft.references}
          onChange={(references) => patch({ references })}
          disabled={saving}
        />
      </fieldset>
      <Missing items={wordReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this word study at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add word study to lesson" editLabel={versionWording(levelLabel, 'word study')?.save ?? 'Save word study'} mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function WordStudyDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: WordContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  const version = versionWording(rest.levelLabel, 'word study');
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a word study' : version?.title ?? 'Edit word study'} description={version?.description ?? 'A word, its original-language form and your own definition, tied to a verse.'} maxWidth="2xl">
      <WordBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------- symbol study

function SymbolBody({ mode, lessonLevels, initial, saving, error, onSave, levelLabel, requestClose, dirtyRef }: BodyProps & { initial: SymbolContent | null }) {
  const start = initial ?? EMPTY_SYMBOL;
  const [draft, setDraft] = useState<SymbolContent>(start);
  const [levels, setLevels] = useState<LearningLevel[]>(lessonLevels);
  const patch = (changes: Partial<SymbolContent>) => setDraft((d) => ({ ...d, ...changes }));
  dirtyRef.current = JSON.stringify(buildSymbol(draft)) !== JSON.stringify(buildSymbol(start));
  const canSave = !saving && (mode === 'edit' || levels.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(buildSymbol(draft), levels);
      }}
      className="space-y-5"
    >
      <ErrorNote error={error} />
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="sr-only">Symbol study</legend>
        <div>
          <label htmlFor="ss-symbol" className={LABEL}>Symbol</label>
          <input id="ss-symbol" type="text" maxLength={SYMBOL_LIMITS.symbol} value={draft.symbol} onChange={(e) => patch({ symbol: e.target.value })} className={FIELD} />
        </div>
        <div className="space-y-3">
          <CoverImageField subject="symbol" value={draft.mediaId || null} onChange={(mediaId, asset) => patch(mediaId ? { mediaId, altText: fillIfEmpty(draft.altText, asset?.altText) } : { mediaId: '', altText: '' })} disabled={saving} />
          {draft.mediaId && (
            <div>
              <label htmlFor="ss-alt" className={LABEL}>Illustration description <span className="text-rose-700">(required before publishing)</span></label>
              <textarea id="ss-alt" rows={2} maxLength={SYMBOL_LIMITS.altText} value={draft.altText} onChange={(e) => patch({ altText: e.target.value })} className={FIELD} />
              <p className={HELP}>Describe the picture for people who cannot see it.</p>
            </div>
          )}
        </div>
        <ScriptureRefList
          itemLabel="the symbol study"
          idPrefix="ss-primary"
          max={1}
          title="Primary passage (required before publishing)"
          emptyMessage="No primary passage chosen yet. You can save a draft without it, but the lesson cannot be published until one is chosen."
          entries={draft.primaryPassage}
          onChange={(primaryPassage) => patch({ primaryPassage })}
          disabled={saving}
        />
        <div>
          <label htmlFor="ss-meaning" className={LABEL}>Meaning</label>
          <textarea id="ss-meaning" rows={3} maxLength={SYMBOL_LIMITS.meaning} value={draft.meaning} onChange={(e) => patch({ meaning: e.target.value })} className={FIELD} />
          <p className={HELP}>The biblical meaning, in your own words. Nothing is suggested for you.</p>
        </div>
        <ScriptureRefList
          itemLabel="the symbol study"
          idPrefix="ss-definition"
          max={1}
          title="Passage that defines it (optional)"
          emptyMessage="No defining passage. The symbol study is published as it is without one."
          entries={draft.definitionPassage}
          onChange={(definitionPassage) => patch({ definitionPassage })}
          disabled={saving}
        />
        <div>
          <label htmlFor="ss-explanation" className={LABEL}>Explanation</label>
          <textarea id="ss-explanation" rows={5} maxLength={SYMBOL_LIMITS.explanation} value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} className={FIELD} />
          <p className={HELP}>Your own explanation. Learners see it as your words, apart from the Scripture.</p>
        </div>
        <ScriptureRefList
          itemLabel="the symbol study"
          idPrefix="ss-refs"
          title="Related references (optional)"
          emptyMessage="No related references. The symbol study is published as it is without them."
          entries={draft.references}
          onChange={(references) => patch({ references })}
          disabled={saving}
        />
      </fieldset>
      <Missing items={symbolReadiness(draft)} />
      {mode === 'create' && <LevelChoice lessonLevels={lessonLevels} levels={levels} setLevels={setLevels} disabled={saving} legend="Show this symbol study at" />}
      <Actions saving={saving} canSave={canSave} createLabel="Add symbol study to lesson" editLabel={versionWording(levelLabel, 'symbol study')?.save ?? 'Save symbol study'} mode={mode} requestClose={requestClose} />
    </form>
  );
}

export function SymbolStudyDialog({ isOpen, onClose, initial, ...rest }: CommonProps & { initial: SymbolContent | null }) {
  const { dirtyRef, requestClose } = useGuardedClose(rest.saving, onClose);
  const version = versionWording(rest.levelLabel, 'symbol study');
  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={rest.mode === 'create' ? 'Add a symbol study' : version?.title ?? 'Edit symbol study'} description={version?.description ?? 'A symbol with its passages, its meaning and your own explanation.'} maxWidth="2xl">
      <SymbolBody {...rest} initial={initial} requestClose={requestClose} dirtyRef={dirtyRef} />
    </Modal>
  );
}
