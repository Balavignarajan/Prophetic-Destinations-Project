import React from 'react';
import { readSymbol, readWord, symbolReadiness, wordReadiness } from '../lib/word-symbol';
import MediaImage from './MediaImage';
import ScriptureEntriesView from './ScriptureEntriesView';

const one = (raw: unknown) => (raw === undefined ? undefined : [raw]);

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{label}</p>
      {children}
    </div>
  );
}

/** A word study as the author or previewer sees it: the word and its original form, then the author's definition and the Scripture in separate labelled parts. */
export function WordStudyView({ content }: { content: unknown }) {
  const w = readWord(content);
  const empty = !w.englishWord && !w.originalWord && !w.transliteration && !w.definition && w.verse.length === 0 && !Array.isArray(w.referencesRaw);
  if (empty) return <span className="text-slate-600 italic font-sans text-xs">(No word study entered yet)</span>;
  const missing = wordReadiness(w);
  return (
    <section className="font-sans">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Word study</p>
      <h4 className="text-base font-semibold text-slate-900 break-words">{w.englishWord || <em className="font-normal text-slate-600">No English word yet</em>}</h4>
      <p className="text-lg text-slate-900 break-words" dir="auto" lang="und">
        {w.originalWord || <em className="text-sm text-slate-600">No original-language word yet</em>}
      </p>
      {w.transliteration && <p className="text-sm italic text-slate-800 break-words">{w.transliteration}</p>}
      {w.strongNumber && <p className="text-xs text-slate-700">Strong number: {w.strongNumber}</p>}
      {w.definition && (
        <Labelled label="Definition (author)">
          <p className="text-sm text-slate-800 whitespace-pre-line break-words">{w.definition}</p>
        </Labelled>
      )}
      {w.verse.length > 0 || w.verseRaw !== undefined ? (
        <Labelled label="Verse">
          <ScriptureEntriesView entries={one(w.verseRaw)} />
        </Labelled>
      ) : null}
      {Array.isArray(w.referencesRaw) && w.referencesRaw.length > 0 && (
        <Labelled label="References">
          <ScriptureEntriesView entries={w.referencesRaw} />
        </Labelled>
      )}
      {missing.length > 0 && <p className="mt-2 text-xs font-medium text-amber-800">Needs {missing.join(', ')} before the lesson can be published.</p>}
    </section>
  );
}

/** A symbol study as the author or previewer sees it: the symbol, optional picture, then clearly labelled sections for the primary passage, meaning, explanation and references. */
export function SymbolStudyView({ content }: { content: unknown }) {
  const s = readSymbol(content);
  const empty = !s.symbol && !s.meaning && !s.explanation && !s.mediaId && s.primaryPassage.length === 0 && !Array.isArray(s.referencesRaw);
  if (empty) return <span className="text-slate-600 italic font-sans text-xs">(No symbol study entered yet)</span>;
  const missing = symbolReadiness(s);
  return (
    <section className="font-sans">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Symbol study</p>
      <h4 className="text-base font-semibold text-slate-900 break-words">{s.symbol || <em className="font-normal text-slate-600">No symbol yet</em>}</h4>
      {s.mediaId && (
        <figure className="mt-2 max-w-sm">
          <MediaImage mediaId={s.mediaId} alt={s.altText} className="block w-full h-auto max-h-56 rounded-lg border border-slate-200" fit="contain" />
        </figure>
      )}
      {(s.primaryPassage.length > 0 || s.primaryPassageRaw !== undefined) && (
        <Labelled label="Primary passage">
          <ScriptureEntriesView entries={one(s.primaryPassageRaw)} />
        </Labelled>
      )}
      {s.meaning && (
        <Labelled label="Meaning (author)">
          <p className="text-sm text-slate-800 whitespace-pre-line break-words">{s.meaning}</p>
        </Labelled>
      )}
      {(s.definitionPassage.length > 0 || s.definitionPassageRaw !== undefined) && (
        <Labelled label="Defining passage">
          <ScriptureEntriesView entries={one(s.definitionPassageRaw)} />
        </Labelled>
      )}
      {s.explanation && (
        <Labelled label="Explanation (author)">
          <p className="text-sm text-slate-800 whitespace-pre-line break-words">{s.explanation}</p>
        </Labelled>
      )}
      {Array.isArray(s.referencesRaw) && s.referencesRaw.length > 0 && (
        <Labelled label="Related references">
          <ScriptureEntriesView entries={s.referencesRaw} />
        </Labelled>
      )}
      {missing.length > 0 && <p className="mt-2 text-xs font-medium text-amber-800">Needs {missing.join(', ')} before the lesson can be published.</p>}
    </section>
  );
}
