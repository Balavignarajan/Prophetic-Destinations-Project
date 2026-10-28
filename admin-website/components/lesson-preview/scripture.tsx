'use client';

import React, { useState } from 'react';
import { describeReference } from '../../lib/scripture-info';
import { Frame, Notice, Txt, TurnChevron, asText, cx, isRecord, usePhone } from './ui';

/**
 * Scripture in the Lesson Preview, drawn like the app's (mobile-app/src/learning/scripture-passage.tsx, scripture-links.tsx, compact-scripture.tsx).
 * In the preview the server gives each passage as it would be frozen into the lesson: { reference, display, source, verses }. A passage without verse text (the Bible text is not installed on the
 * server, or the entry is only a stored reference) is shown by its reference alone and says the text is added when the lesson is published; nothing is quoted or invented. The app's
 * "Open in Bible" button is not drawn: the Admin has no Bible reader to open.
 */
interface Verse {
  verse: number;
  text: string;
}

export interface PassageData {
  display: string;
  verses: Verse[];
  translationLine: string;
  commentary: string;
}

/** The frozen passage, or null when it is missing, has no verse text, or is malformed (the same checks as the app's). */
export function readPassage(content: Record<string, unknown>): PassageData | null {
  const display = asText(content.display);
  const source = isRecord(content.source) ? content.source : null;
  if (!display || !source || !Array.isArray(content.verses) || content.verses.length === 0) return null;
  const verses: Verse[] = [];
  for (const raw of content.verses) {
    if (!isRecord(raw) || typeof raw.verse !== 'number' || !Number.isInteger(raw.verse) || !asText(raw.text)) return null;
    verses.push({ verse: raw.verse, text: asText(raw.text) });
  }
  const translation = asText(source.translation);
  if (!translation) return null;
  const edition = asText(source.edition);
  return { display, verses, translationLine: `${translation}${edition ? `, ${edition}` : ''}`, commentary: asText(content.commentary) };
}

/** The written form of a reference: the frozen label, else the structured reference spelled out; '' when it has neither. */
function referenceLabel(content: Record<string, unknown>, bookNames: Record<string, string>): string {
  const display = asText(content.display);
  if (display) return display;
  const r = content.reference;
  if (isRecord(r)) {
    const { bookId, chapter, startVerse, endVerse } = r;
    if (typeof bookId === 'string' && typeof chapter === 'number' && typeof startVerse === 'number' && typeof endVerse === 'number') {
      return describeReference({ bookId, chapter, startVerse, endVerse }, bookNames);
    }
  }
  return '';
}

/** An entry that names a place in the Bible but carries no verse text (`verses` absent or empty). */
function hasNoVerseText(content: Record<string, unknown>): boolean {
  const named = asText(content.display) !== '' || isRecord(content.reference);
  return named && (content.verses === undefined || (Array.isArray(content.verses) && content.verses.length === 0));
}

/** A passage as plain data: the reference, the verses in order and which translation it is. Inside another block (`embedded`) it needs no card of its own, only the gold rule. */
export function PassageView({ display, verses, translationLine, commentary = '', embedded = false }: { display: string; verses: Verse[]; translationLine: string; commentary?: string; embedded?: boolean }) {
  const multiple = verses.length > 1;
  const body = (
    <>
      <Txt v="label" tone="highlight" as="h4">
        {display}
      </Txt>
      <p className="lp-scripture lp-c-bright lp-wrap" style={{ fontSize: 20, lineHeight: '32px' }}>
        {verses.map((v, index) => (
          <span key={v.verse}>
            {multiple && (
              <span className="lp-c-highlight lp-w6" style={{ fontFamily: 'var(--lp-sans)', fontSize: 13 }}>
                {v.verse}{' '}
              </span>
            )}
            {v.text}
            {index < verses.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
      {translationLine && (
        <Txt v="caption" tone="muted">
          {translationLine}
        </Txt>
      )}
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      {embedded ? (
        <div className="flex flex-col gap-3 pl-4" style={{ borderLeft: '3px solid var(--lp-primary)' }}>
          {body}
        </div>
      ) : (
        <Frame variant="scripture" style={{ border: 0, borderLeft: '3px solid var(--lp-primary)', gap: 12, padding: '16px 24px' }}>
          {body}
        </Frame>
      )}
      {commentary && (
        <div className="flex flex-col gap-1 px-1">
          <Txt v="body-small" tone="muted" w={6}>
            Author commentary
          </Txt>
          <Txt v="body" tone="secondary" read pre>
            {commentary}
          </Txt>
        </div>
      )}
    </div>
  );
}

/** A reference with no verse text: the reference alone, set off by the gold rule like a passage. */
export function ScriptureReference({ content }: { content: Record<string, unknown> }) {
  const { bookNames } = usePhone();
  const label = referenceLabel(content, bookNames);
  if (!label) return <Notice title="Scripture passage not available" message="This passage could not be shown. The rest of the lesson is not affected." />;
  return (
    <div className="flex flex-col gap-2 pl-4" style={{ borderLeft: '3px solid var(--lp-gold)' }}>
      <Txt v="label" tone="highlight" aria-label={`Scripture reference: ${label}`}>
        {label}
      </Txt>
      {asText(content.display) === '' && (
        <Txt v="caption" tone="muted">
          The Scripture text is added when the lesson is published.
        </Txt>
      )}
    </div>
  );
}

/** One frozen passage as its card (or, `embedded`, as the gold rule and the text). Malformed passages say so, for that passage only. */
export function ScripturePassage({ content, embedded = false }: { content: Record<string, unknown>; embedded?: boolean }) {
  const passage = readPassage(content);
  if (passage) return <PassageView {...passage} embedded={embedded} />;
  if (hasNoVerseText(content)) return <ScriptureReference content={content} />;
  return <Notice title="Scripture passage not available" message="This passage could not be shown, so nothing is shown in its place. The rest of the lesson is not affected." />;
}

export type ScripturePresentation = 'expandable' | 'inline' | 'standalone';

const nameOf = (entry: unknown): string => (isRecord(entry) && typeof entry.display === 'string' ? entry.display.trim().toLowerCase() : '');

/** `entries` without the passages the same block already shows in full elsewhere (matched by their reference label), so no passage is printed twice. */
export function withoutPassages(entries: unknown, shown: unknown[]): unknown[] {
  const names = new Set(shown.map(nameOf).filter(Boolean));
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const name = nameOf(entry);
    return !name || !names.has(name);
  });
}

/**
 * The Scripture attached to a block. The block chooses how it is presented: `expandable` (a button opens and closes the passage, for supporting references), `inline` (the passage is simply
 * there, for Scripture the block's text depends on) or `standalone` (the full card of a Scripture block).
 */
export function ScriptureLinks({ entries, presentation = 'expandable' }: { entries: unknown; presentation?: ScripturePresentation }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <div className={cx('flex flex-col', presentation === 'expandable' ? 'gap-2' : 'gap-4')}>
      {entries.map((raw, index) => {
        const entry = isRecord(raw) ? raw : {};
        if (hasNoVerseText(entry)) return <ScriptureReference key={index} content={entry} />;
        if (presentation === 'inline') return <ScripturePassage key={index} content={entry} embedded />;
        if (presentation === 'standalone') return <ScripturePassage key={index} content={entry} />;
        const name = typeof entry.display === 'string' && entry.display.trim() ? entry.display.trim() : 'Scripture passage';
        const expanded = open === index;
        return (
          <div key={index} className="flex flex-col gap-2">
            <button type="button" className="lp-chip-btn self-start" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Read'} Scripture: ${name}`} onClick={() => setOpen(expanded ? null : index)}>
              <span className="min-w-0 text-left">
                {expanded ? 'Hide' : 'Read'} {name}
              </span>
              <TurnChevron open={expanded} size={10} />
            </button>
            {expanded && (
              <div className="lp-rise">
                <ScripturePassage content={entry} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One reference of a hotspot as a compact card: its name and a "Read Passage" button that opens the frozen passage inside the card. */
function CompactScriptureCard({ entry }: { entry: unknown }) {
  const { bookNames } = usePhone();
  const [open, setOpen] = useState(false);
  const record = isRecord(entry) ? entry : {};
  const referenceOnly = hasNoVerseText(record);
  const label = referenceLabel(record, bookNames) || 'Scripture passage';
  return (
    <div className="flex flex-col gap-2 rounded-[10px] p-3" style={{ border: '1px solid var(--lp-subtle)', background: 'var(--lp-surface)' }}>
      <Txt v="caption" tone="muted" w={7} style={{ letterSpacing: 1 }}>
        SCRIPTURE REFERENCE
      </Txt>
      <Txt v="body" tone="highlight" w={6} aria-label={`Scripture reference: ${label}`}>
        {label}
      </Txt>
      {!referenceOnly && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="lp-chip-btn" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Read'} the passage ${label}`} onClick={() => setOpen((current) => !current)}>
            {open ? 'Hide Passage' : 'Read Passage'}
          </button>
        </div>
      )}
      {open && <ScripturePassage content={record} embedded />}
    </div>
  );
}

/** The Scripture of a hotspot, compactly: one card per reference in the author's order, each closed until the learner asks to read it. Nothing when there are none. */
export function CompactScripture({ entries }: { entries: unknown }) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <CompactScriptureCard key={index} entry={entry} />
      ))}
    </div>
  );
}
