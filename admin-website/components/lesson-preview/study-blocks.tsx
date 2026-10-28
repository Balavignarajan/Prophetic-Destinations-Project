'use client';

import React, { useEffect, useId, useState } from 'react';
import { api } from '../../lib/api';
import { LessonImage } from './image';
import { ScriptureLinks, ScripturePassage, withoutPassages } from './scripture';
import { CalloutBlock, EvidenceBlock, RichTextBlock, ScriptureConnectionBlock } from './text-blocks';
import { Chevron, CoverPicture, Frame, Notice, Rule, Txt, TurnChevron, asText, cx, isRecord, isText, paragraphsOf, usePhone } from './ui';

/**
 * Study blocks drawn as the learner app draws them (mobile-app/src/learning: explore-deeper-block, nested-blocks, word-symbol-blocks, timeline-block, scene-media-blocks,
 * continue-exploring-block). The same published shapes, the same "not available" rules; nothing is added and nothing is stored.
 */

// ------------------------------------------------------------------------------------------------ Explore deeper (and the blocks inside it)

const NESTED = new Set(['RICH_TEXT', 'CALLOUT', 'SCRIPTURE_PASSAGE', 'SCRIPTURE_CONNECTION', 'IMAGE', 'WORD_STUDY', 'SYMBOL_STUDY', 'HISTORICAL_EVIDENCE']);

function NestedBlock({ type, content }: { type: string; content: Record<string, unknown> }) {
  switch (type) {
    case 'RICH_TEXT':
      return <RichTextBlock content={content} />;
    case 'CALLOUT':
      return <CalloutBlock content={content} />;
    case 'SCRIPTURE_PASSAGE':
      // inside the section the passage needs no card of its own (the section is the card): the gold rule and the text
      return <ScripturePassage content={content} embedded />;
    case 'SCRIPTURE_CONNECTION':
      return <ScriptureConnectionBlock content={content} />;
    case 'IMAGE':
      return <LessonImage content={content} />;
    case 'WORD_STUDY':
      return <WordStudyBlock content={content} />;
    case 'SYMBOL_STUDY':
      return <SymbolStudyBlock content={content} />;
    case 'HISTORICAL_EVIDENCE':
      return <EvidenceBlock content={content} />;
    default:
      return null;
  }
}

/** The blocks nested inside an Explore deeper section, in the author's order, each drawn by the component the lesson uses for that type. Anything the app cannot draw is counted, not hidden silently. */
function NestedBlocks({ blocks }: { blocks: unknown }) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) return null;
  const shown = list.filter((entry): entry is { id: string; type: string; content: Record<string, unknown> } => isRecord(entry) && typeof entry.id === 'string' && typeof entry.type === 'string' && NESTED.has(entry.type) && isRecord(entry.content));
  const skipped = list.length - shown.length;
  return (
    <div className="flex flex-col gap-4">
      {shown.map((entry) => (
        <NestedBlock key={entry.id} type={entry.type} content={entry.content} />
      ))}
      {skipped > 0 && (
        <Notice
          variant="unsupported"
          title={skipped === 1 ? 'One part of this section cannot be shown' : `${skipped} parts of this section cannot be shown`}
          message="This version of the app cannot show them yet. The rest of the section and the lesson are not affected."
        />
      )}
    </div>
  );
}

export function ExploreDeeperBlock({ content }: { content: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const title = asText(content.title);
  const paragraphs = paragraphsOf(asText(content.intro));
  if (!title || paragraphs.length === 0) return <Notice title="Explore Deeper section not available" message="This section could not be shown. The rest of the lesson is not affected." />;
  return (
    <div className="rounded-2xl" style={{ border: `1px solid ${open ? 'var(--lp-gold)' : 'var(--lp-subtle)'}`, background: open ? 'var(--lp-elevated)' : 'var(--lp-surface)', transition: 'background-color .2s ease, border-color .2s ease' }}>
      <button type="button" className="flex w-full items-center gap-3 p-4" style={{ minHeight: 56 }} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={`Explore deeper: ${title}`} onClick={() => setOpen((value) => !value)}>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Txt v="body-small" tone="highlight" w={7} as="span">
            Explore deeper
          </Txt>
          <Txt v="body" w={6} as="span">
            {title}
          </Txt>
        </span>
        <TurnChevron open={open} />
      </button>
      {open && (
        <div id={panelId} className="lp-rise flex flex-col gap-3 px-4 pb-4">
          {paragraphs.map((paragraph, index) => (
            <Txt key={index} v="body" read pre>
              {paragraph}
            </Txt>
          ))}
          <NestedBlocks blocks={content.blocks} />
          <ScriptureLinks entries={content.scripture} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ word study and symbol study

/** A single frozen passage as the list ScriptureLinks expects (nothing when the field is absent). */
const single = (value: unknown): unknown[] => (value === undefined || value === null ? [] : [value]);

const Unavailable = ({ what }: { what: string }) => <Notice title={`${what} not available`} message="This part of the lesson could not be shown. The rest of the lesson is not affected." />;

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Txt v="body-small" tone="muted" w={6} as="h4">
        {label}
      </Txt>
      {children}
    </div>
  );
}

export function WordStudyBlock({ content }: { content: Record<string, unknown> }) {
  const english = asText(content.englishWord);
  const original = asText(content.originalWord);
  const transliteration = asText(content.transliteration);
  const strong = asText(content.strongNumber);
  const definition = asText(content.definition);
  if (!english || !original || !definition) return <Unavailable what="Word study" />;
  const references = withoutPassages(content.references, single(content.verse));
  return (
    <div className="lp-rise">
      <Frame variant="interactive">
        <div className="flex flex-col gap-1">
          <Txt v="body-small" tone="highlight" w={7}>
            Word study
          </Txt>
          <Txt v="heading" as="h3">
            {english}
          </Txt>
          <Rule />
          {/* The original word uses the device's own font (no custom face), so Greek and Hebrew letters always draw correctly. */}
          <p dir="auto" className="lp-c-bright lp-wrap" style={{ fontFamily: 'system-ui, sans-serif', fontSize: 34, lineHeight: '46px' }}>
            {original}
          </p>
          {transliteration && (
            <Txt v="scripture" tone="secondary" className="lp-italic">
              {transliteration}
            </Txt>
          )}
          {strong && (
            <Txt v="body-small" tone="muted">
              Strong number: {strong}
            </Txt>
          )}
        </div>
        <Part label="Definition">
          <Txt v="body" style={{ fontSize: 17, lineHeight: '27px' }} pre>
            {definition}
          </Txt>
        </Part>
        {content.verse !== undefined && (
          <Part label="Verse">
            <ScriptureLinks entries={single(content.verse)} presentation="inline" />
          </Part>
        )}
        {references.length > 0 && (
          <Part label="References">
            <ScriptureLinks entries={references} />
          </Part>
        )}
      </Frame>
    </div>
  );
}

export function SymbolStudyBlock({ content }: { content: Record<string, unknown> }) {
  const symbol = asText(content.symbol);
  const meaning = asText(content.meaning);
  const explanation = asText(content.explanation);
  if (!symbol || !meaning || !explanation) return <Unavailable what="Symbol study" />;
  const image = isRecord(content.image) && asText(content.image.mediaId) ? { mediaId: asText(content.image.mediaId), altText: asText(content.image.altText) } : null;
  const references = withoutPassages(content.references, [...single(content.primaryPassage), ...single(content.definitionPassage)]);
  return (
    <div className="lp-rise">
      <Frame variant="interactive">
        <div className="flex flex-col gap-1">
          <Txt v="body-small" tone="highlight" w={7}>
            Symbol study
          </Txt>
          <Txt v="section-heading" as="h3">
            {symbol}
          </Txt>
          <Rule />
        </div>
        {image && <LessonImage content={image} />}
        {content.primaryPassage !== undefined && (
          <Part label="Primary passage">
            <ScriptureLinks entries={single(content.primaryPassage)} presentation="inline" />
          </Part>
        )}
        {/* what the symbol means: the clearest line of the block, set apart with a gold rule */}
        <div className="flex flex-col gap-1 pl-3" style={{ borderLeft: '3px solid var(--lp-primary)' }}>
          <Txt v="body-small" tone="muted" w={6} as="h4">
            Meaning
          </Txt>
          <Txt v="body" w={6} style={{ fontSize: 18, lineHeight: '27px' }} pre>
            {meaning}
          </Txt>
        </div>
        {content.definitionPassage !== undefined && (
          <Part label="Passage that defines it">
            <ScriptureLinks entries={single(content.definitionPassage)} presentation="inline" />
          </Part>
        )}
        <Part label="Explanation">
          <Txt v="body" style={{ fontSize: 17, lineHeight: '27px' }} pre>
            {explanation}
          </Txt>
        </Part>
        {references.length > 0 && (
          <Part label="Related references">
            <ScriptureLinks entries={references} />
          </Part>
        )}
      </Frame>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ timeline

interface TimelineEvent {
  id: string;
  dateLabel: string;
  title: string;
  explanation: string;
  image: Record<string, unknown> | null;
  scripture: unknown;
}

/** All events, or null when the content cannot be shown completely and correctly (a partial list would look like a complete timeline). */
function readEvents(content: Record<string, unknown>): TimelineEvent[] | null {
  if (!Array.isArray(content.events) || content.events.length === 0) return null;
  const events: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const raw of content.events) {
    if (!isRecord(raw)) return null;
    const id = asText(raw.id);
    const event = { id, dateLabel: asText(raw.dateLabel), title: asText(raw.title), explanation: asText(raw.explanation) };
    if (!id || seen.has(id) || !event.dateLabel || !event.title || !event.explanation) return null;
    seen.add(id);
    const mediaId = asText(raw.mediaId);
    events.push({ ...event, image: mediaId ? { mediaId, altText: asText(raw.altText), caption: asText(raw.caption), source: asText(raw.source) } : null, scripture: raw.scripture });
  }
  return events;
}

export function TimelineBlock({ content }: { content: Record<string, unknown> }) {
  const events = readEvents(content);
  const heading = asText(content.heading) || 'Timeline';
  if (!events && Array.isArray(content.events) && content.events.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Txt v="section-heading" as="h3">
          {heading}
        </Txt>
        <Txt v="body-small" tone="muted">
          There are no events in this timeline at your level.
        </Txt>
      </div>
    );
  }
  if (!events) return <Notice title="Timeline not available" message="This lesson has a timeline that could not be shown completely, so it is hidden rather than shown with events missing. The rest of the lesson is not affected." />;
  return (
    <div className="flex flex-col gap-4">
      <Txt v="section-heading" as="h3">
        {heading}
      </Txt>
      <ol>
        {events.map((event, index) => (
          <li key={event.id} className="lp-rise flex gap-4">
            <div aria-hidden="true" className="flex flex-col items-center">
              <span className="lp-caption lp-c-highlight lp-w7 flex shrink-0 items-center justify-center" style={{ width: 32, height: 32, borderRadius: 16, border: '2px solid var(--lp-primary)', background: 'var(--lp-surface)' }}>
                {index + 1}
              </span>
              {index < events.length - 1 && <span className="flex-1" style={{ width: 2, marginTop: 2, marginBottom: 2, background: 'var(--lp-gold)', borderRadius: 6 }} />}
            </div>
            <div className={cx('flex min-w-0 flex-1 flex-col gap-3', index < events.length - 1 && 'pb-6')}>
              <div className="flex flex-col gap-1" role="group" aria-label={`Event ${index + 1} of ${events.length}`}>
                <Txt v="body-small" tone="highlight" w={7}>
                  {event.dateLabel}
                </Txt>
                <Txt v="heading" as="h4">
                  {event.title}
                </Txt>
                <Txt v="body" tone="secondary" pre>
                  {event.explanation}
                </Txt>
              </div>
              {event.image && <LessonImage content={event.image} />}
              <ScriptureLinks entries={event.scripture} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ narrative scene

export function NarrativeSceneBlock({ content }: { content: Record<string, unknown> }) {
  const imageOk = content.image === undefined || (isRecord(content.image) && asText(content.image.mediaId) !== '');
  if (!asText(content.narrative) || !imageOk || (content.scripture !== undefined && !Array.isArray(content.scripture))) {
    return <Notice title="Scene is incomplete" message="Part of this scene could not be read, so none of it is shown rather than a shortened version. The rest of the lesson is not affected." />;
  }
  const image = isRecord(content.image) ? { mediaId: asText(content.image.mediaId), altText: asText(content.image.altText) } : null;
  return (
    <div className="flex flex-col gap-4">
      {image && <LessonImage content={image} />}
      <div className="lp-rise flex flex-col gap-3 px-1">
        <Rule />
        {isText(content.title) && (
          <Txt v="section-heading" as="h3">
            {content.title}
          </Txt>
        )}
        {/* The author's text, a blank line starting a new paragraph (as the lesson introduction does), so a longer scene reads as paragraphs, not one block. */}
        <div className="flex flex-col gap-4">
          {paragraphsOf(asText(content.narrative)).map((paragraph, index) => (
            <Txt key={index} v="body" read pre>
              {paragraph}
            </Txt>
          ))}
        </div>
      </div>
      <ScriptureLinks entries={content.scripture} presentation="standalone" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ continue exploring

interface ExploringCard {
  lessonId: string;
  label: string | null;
  title: string;
  subtitle: string | null;
  coverMediaId: string | null;
}

type ExploringState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; cards: ExploringCard[] };

/**
 * A Continue exploring block: the cards a learner at this level would be offered, asked of the server for the working copy (the same learner delivery rules: link level, the target's published
 * state). Like the app it shows nothing while loading and nothing when no lesson can be offered; opening a card is not available in the preview.
 */
export function ContinueExploringBlock({ blockId, content }: { blockId: string; content: Record<string, unknown> }) {
  const { lessonId, level } = usePhone();
  const [state, setState] = useState<ExploringState>({ status: 'loading' });
  useEffect(() => {
    if (!blockId) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    api
      .request<{ cards?: ExploringCard[] }>(`/admin/lessons/${lessonId}/blocks/${blockId}/exploring-preview?level=${level}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', cards: Array.isArray(data?.cards) ? data.cards : [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [lessonId, blockId, level]);

  if (!Array.isArray(content.links) || state.status === 'loading') return null;
  if (state.status === 'error') return <Notice variant="offline" title="Continue exploring could not be loaded for this preview" message="Close the preview and open it again to retry." />;
  if (state.cards.length === 0) return null;
  const heading = asText(content.title) || 'Continue exploring';
  return (
    <div className="flex flex-col gap-3">
      <Txt v="section-heading" as="h3">
        {heading}
      </Txt>
      <ul className="flex flex-col gap-2">
        {state.cards.map((card) => {
          const label = card.label && card.label.trim() ? card.label.trim() : null;
          return (
            <li key={card.lessonId} className="lp-card flex items-center gap-3" style={{ minHeight: 60, padding: 12 }} aria-label={`Related lesson: ${label ?? card.title}.${label ? ` Lesson: ${card.title}.` : ''}${card.subtitle ? ` ${card.subtitle}.` : ''}`}>
              {card.coverMediaId && <CoverPicture mediaId={card.coverMediaId} width={56} height={40} />}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Txt v="body" w={6}>
                  {label ?? card.title}
                </Txt>
                {label && (
                  <Txt v="body-small" tone="muted">
                    Lesson: {card.title}
                  </Txt>
                )}
                {card.subtitle && (
                  <Txt v="body-small" tone="secondary">
                    {card.subtitle}
                  </Txt>
                )}
              </div>
              <Chevron dir="right" />
            </li>
          );
        })}
      </ul>
      <Txt v="body-small" tone="muted">
        A related lesson is available offline only if it is saved on this device. Otherwise it needs an internet connection.
      </Txt>
    </div>
  );
}
