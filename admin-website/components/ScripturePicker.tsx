'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * The stored identity of a Scripture passage (backend ScriptureReference): stable OSIS book id plus an explicit chapter and verse
 * range within ONE chapter. The written form ("John 3:16-18") is for display only and is never stored in its place.
 */
export interface ScriptureRefValue {
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

interface StatusAvailable {
  available: true;
  metadata: { translation: string; edition: string; version: string };
}
interface StatusUnavailable {
  available: false;
  reason: string;
  message: string;
}
interface BookItem {
  id: string;
  name: string;
  chapters: number | null;
}
interface PassageResponse {
  display: string;
  source: { translation: string; edition: string; version: string };
  verses: { verse: number; text: string }[];
}

interface Props {
  value: ScriptureRefValue | null;
  /** Called with a passage the server has VERIFIED, or null when the selection is cleared or incomplete. */
  onChange: (value: ScriptureRefValue | null) => void;
  disabled?: boolean;
  /** Makes element ids unique when more than one picker is on the page. */
  idPrefix?: string;
}

const SELECT = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 disabled:opacity-60';
const LABEL = 'block text-xs font-semibold text-slate-800 mb-1';

const range = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

/**
 * Reusable passage picker (book, chapter, verse or verse range within one chapter). It only lets a passage be chosen when the server
 * has canonical Scripture data: without it the picker says so plainly and selects nothing, because a reference that cannot be verified
 * must not be stored as valid. Selected text is shown exactly as the server returns it. Read-only: nothing here changes Scripture data.
 */
export default function ScripturePicker({ value, onChange, disabled = false, idPrefix = 'scripture' }: Props) {
  const [status, setStatus] = useState<StatusAvailable | StatusUnavailable | null>(null);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [bookId, setBookId] = useState(value?.bookId ?? '');
  const [chapter, setChapter] = useState<number | ''>(value?.chapter ?? '');
  const [start, setStart] = useState<number | ''>(value?.startVerse ?? '');
  const [end, setEnd] = useState<number | ''>(value?.endVerse ?? '');
  const [verseCount, setVerseCount] = useState<number | null>(null);
  const [passage, setPassage] = useState<PassageResponse | null>(null);
  const [passageError, setPassageError] = useState<string | null>(null);
  const [passageLoading, setPassageLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const s = await api.request<StatusAvailable | StatusUnavailable>('/admin/scripture/status');
        if (cancelled) return;
        setStatus(s);
        if (s.available) {
          const res = await api.request<{ items: BookItem[] }>('/admin/scripture/books');
          if (!cancelled) setBooks(res.items);
        }
      } catch {
        if (!cancelled) setLoadError('The Scripture list could not be loaded. Check your connection and try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!status?.available || !bookId || chapter === '') {
      setVerseCount(null);
      return;
    }
    let cancelled = false;
    api
      .request<{ verses: number | null }>(`/admin/scripture/books/${encodeURIComponent(bookId)}/chapters/${chapter}`)
      .then((res) => !cancelled && setVerseCount(res.verses))
      .catch(() => !cancelled && setVerseCount(null));
    return () => {
      cancelled = true;
    };
  }, [status, bookId, chapter]);

  const lookup = useCallback(
    async (b: string, c: number, s: number, e: number) => {
      setPassageLoading(true);
      setPassageError(null);
      try {
        const res = await api.request<PassageResponse>(`/admin/scripture/passage?book=${encodeURIComponent(b)}&chapter=${c}&start=${s}&end=${e}`);
        setPassage(res);
        onChange({ bookId: b, chapter: c, startVerse: s, endVerse: e });
      } catch (err: unknown) {
        const e2 = err as { payload?: { message?: string }; message?: string };
        setPassage(null);
        setPassageError(e2.payload?.message || e2.message || 'This passage could not be checked. Try again.');
        // A saved passage that no longer checks out is NOT cleared on its own (the author decides); only a different, failed choice is dropped.
        const isSaved = value !== null && value.bookId === b && value.chapter === c && value.startVerse === s && value.endVerse === e;
        if (!isSaved) onChange(null);
      } finally {
        setPassageLoading(false);
      }
    },
    [onChange, value],
  );

  useEffect(() => {
    if (!status?.available || !bookId || chapter === '' || start === '') {
      setPassage(null);
      return;
    }
    const last = end === '' ? start : end;
    void lookup(bookId, chapter, start, last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, bookId, chapter, start, end]);

  const clear = () => {
    setBookId('');
    setChapter('');
    setStart('');
    setEnd('');
    setPassage(null);
    setPassageError(null);
    onChange(null);
  };

  const id = (name: string) => `${idPrefix}-${name}`;
  const book = books.find((b) => b.id === bookId);

  if (loadError) {
    return (
      <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
        {loadError}{' '}
        <button type="button" className="underline font-medium" onClick={() => setReload((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (!status) return <p role="status" className="text-sm text-slate-700">Loading Scripture…</p>;
  if (!status.available) {
    return (
      <div role="status" className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
        <p className="font-semibold">Scripture passages cannot be chosen yet</p>
        <p className="mt-1">{status.message}</p>
        <p className="mt-1 text-xs">A passage is only accepted when the server can confirm that it exists, so nothing is selected without the approved Scripture text.</p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="block text-sm font-semibold text-slate-800 mb-1">Scripture passage</legend>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor={id('book')} className={LABEL}>Book</label>
          <select
            id={id('book')}
            className={SELECT}
            value={bookId}
            onChange={(e) => {
              setBookId(e.target.value);
              setChapter('');
              setStart('');
              setEnd('');
            }}
          >
            <option value="">Choose a book…</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('chapter')} className={LABEL}>Chapter</label>
          <select
            id={id('chapter')}
            className={SELECT}
            value={chapter}
            disabled={!book?.chapters}
            onChange={(e) => {
              setChapter(e.target.value ? Number(e.target.value) : '');
              setStart('');
              setEnd('');
            }}
          >
            <option value="">–</option>
            {range(book?.chapters ?? 0).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={id('start')} className={LABEL}>From verse</label>
            <select
              id={id('start')}
              className={SELECT}
              value={start}
              disabled={!verseCount}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : '';
                setStart(next);
                if (next !== '' && end !== '' && end < next) setEnd('');
              }}
            >
              <option value="">–</option>
              {range(verseCount ?? 0).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('end')} className={LABEL}>To verse</label>
            <select id={id('end')} className={SELECT} value={end} disabled={!verseCount || start === ''} onChange={(e) => setEnd(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Same</option>
              {range(verseCount ?? 0)
                .filter((n) => start === '' || n > start)
                .map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
            </select>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-700">A passage is one verse or a range of verses within one chapter.</p>

      <div aria-live="polite">
        {passageLoading && <p className="text-sm text-slate-700">Checking the passage…</p>}
        {passageError && (
          <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-sm text-rose-900">
            {passageError} Your other choices are kept: change the chapter or verses to try again.
          </p>
        )}
        {passage && !passageLoading && (
          <figure className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <figcaption className="text-sm font-semibold text-slate-900">{passage.display}</figcaption>
            <p className="mt-1 text-sm text-slate-800 break-words">
              {passage.verses.map((v) => (
                <span key={v.verse}>
                  <sup className="mr-0.5 text-[10px] text-slate-600">{v.verse}</sup>
                  {v.text}{' '}
                </span>
              ))}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {passage.source.translation}, {passage.source.edition} (data version {passage.source.version})
            </p>
          </figure>
        )}
        {!passage && !passageError && !passageLoading && <p className="text-sm text-slate-700">No passage chosen yet.</p>}
      </div>

      {(value || bookId) && (
        <button type="button" onClick={clear} className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500">
          Clear passage
        </button>
      )}
    </fieldset>
  );
}
