'use client';

import React, { useState } from 'react';
import { isHttpUrl } from '../../lib/evidence-block';
import { richTextToView, type ViewBlock, type ViewInline, type ViewPassage } from '../../lib/rich-text-view';
import { LessonImage } from './image';
import { PassageView, ScriptureLinks } from './scripture';
import { Frame, Notice, Rule, Txt, asText, isRecord, isText } from './ui';

/**
 * The text blocks of the lesson, drawn as the learner app draws them (mobile-app/src/learning: rich-text, section-intro-block, callout-block, summary-block, evidence-block,
 * scripture-connection-block, study-prompt-blocks, prophecy-blocks). Each reads the same published shape and has the same rules about what is "not available": a block that is missing
 * what it needs is replaced by a short notice instead of a shortened version, and the rest of the lesson is not affected. Text is always shown as text (React escapes it).
 */

// ------------------------------------------------------------------------------------------------ rich text

function Inline({ item }: { item: ViewInline }) {
  let node: React.ReactNode = item.text;
  if (item.bold) node = <strong className="lp-w7">{node}</strong>;
  if (item.italic) node = <em>{node}</em>;
  if (item.href) {
    node = (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className="lp-link" aria-label={`${item.text} (opens a link outside this lesson)`}>
        {node}
      </a>
    );
  }
  return <>{node}</>;
}

/** A paragraph. An inline Scripture reference is drawn as its label; with verse text it opens and closes the frozen passage under the paragraph. */
function ParagraphView({ inlines, passages }: { inlines: ViewInline[]; passages: ViewPassage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  let counted = 0;
  const shown = open === null ? null : passages[open];
  return (
    <div className="flex flex-col gap-3">
      <p className="lp-body lp-read lp-c-text lp-pre lp-wrap">
        {inlines.map((item, index) => {
          if (!item.scripture) return <Inline key={index} item={item} />;
          if (!item.scripture.passage) {
            return (
              <span key={index} className="lp-c-highlight lp-w5">
                {item.text}
              </span>
            );
          }
          const mine = counted;
          counted += 1;
          const expanded = open === mine;
          return (
            <button key={index} type="button" className="lp-link" style={{ display: 'inline', font: 'inherit', fontWeight: 500 }} aria-expanded={expanded} aria-label={`Scripture: ${item.text}`} onClick={() => setOpen(expanded ? null : mine)}>
              {item.text}
            </button>
          );
        })}
      </p>
      {shown && (
        <div className="lp-rise">
          <PassageView display={shown.label} verses={shown.verses} translationLine={shown.source} embedded />
        </div>
      )}
    </div>
  );
}

function ViewBlocks({ blocks, depth }: { blocks: ViewBlock[]; depth: number }) {
  return (
    <div className={depth === 0 ? 'flex flex-col gap-4' : 'flex flex-col gap-2'}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          if (block.level === 3) {
            return (
              <Txt key={index} v="body" read w={7} as="h4">
                {block.text}
              </Txt>
            );
          }
          return (
            <Txt key={index} v={block.level === 1 ? 'section-heading' : 'heading'} as={block.level === 1 ? 'h3' : 'h4'}>
              {block.text}
            </Txt>
          );
        }
        if (block.kind === 'paragraph') return <ParagraphView key={index} inlines={block.inlines} passages={block.passages ?? []} />;
        return (
          <div key={index} className="flex flex-col gap-2" style={{ paddingLeft: depth > 0 ? 16 : 4 }} role="list">
            {block.items.map((item, i) => (
              <div key={i} className="flex gap-2" role="listitem">
                <span className="lp-body lp-read lp-c-highlight shrink-0" style={{ minWidth: block.ordered ? 28 : 16 }} aria-hidden="true">
                  {block.ordered ? `${i + 1}.` : '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <ViewBlocks blocks={item} depth={depth + 1} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A RICH_TEXT block: paragraphs, headings (levels 1 to 3), nested bullet and numbered lists, bold, italic, links and inline Scripture references. */
export function RichTextBlock({ content }: { content: Record<string, unknown> }) {
  const blocks = richTextToView(content);
  if (blocks.length === 0) return null;
  return <ViewBlocks blocks={blocks} depth={0} />;
}

// ------------------------------------------------------------------------------------------------ section heading and callout

export function SectionIntroBlock({ content }: { content: Record<string, unknown> }) {
  const title = asText(content.title);
  const imageOk = content.image === undefined || (isRecord(content.image) && asText(content.image.mediaId) !== '');
  if (!title || !imageOk) return <Notice title="Section heading not available" message="This section heading could not be shown. The rest of the lesson is not affected." />;
  const subtitle = asText(content.subtitle);
  const image = isRecord(content.image) ? { mediaId: asText(content.image.mediaId), altText: asText(content.image.altText) } : null;
  return (
    <div className="flex flex-col gap-3 pt-6">
      <Rule />
      <Txt v="section-heading" as="h3">
        {title}
      </Txt>
      {subtitle && (
        <Txt v="subtitle" tone="secondary">
          {subtitle}
        </Txt>
      )}
      {image && <LessonImage content={image} />}
    </div>
  );
}

const CALLOUT_LABELS: Record<string, string> = { REMEMBER: 'Remember', KEY_IDEA: 'Key idea', PROPHECY_PRINCIPLE: 'Prophecy principle' };

export function CalloutBlock({ content }: { content: Record<string, unknown> }) {
  const type = asText(content.calloutType);
  const label = CALLOUT_LABELS[type];
  const body = asText(content.body);
  const title = asText(content.title);
  if (!label || !body) return <Notice title="Callout not available" message="This note could not be shown. The rest of the lesson is not affected." />;
  // Each kind differs in its label AND its shape, never by colour alone: Remember is the plain gold-edged note, Key idea a raised surface with a display title, Prophecy principle a raised surface with a gold hairline across the top.
  const keyIdea = type === 'KEY_IDEA';
  const principle = type === 'PROPHECY_PRINCIPLE';
  return (
    <Frame variant="callout" className={keyIdea ? 'lp-callout-key' : principle ? 'lp-callout-principle' : undefined} role="note" aria-label={`${label}${title ? `: ${title}` : ''}`}>
      <Txt v="label" tone="highlight">
        {label}
      </Txt>
      {title && (
        <Txt v={keyIdea ? 'heading' : 'body'} w={keyIdea ? undefined : 7} as="h4">
          {title}
        </Txt>
      )}
      <Txt v="body" style={{ fontSize: 17, lineHeight: '27px' }} pre>
        {body}
      </Txt>
    </Frame>
  );
}

// ------------------------------------------------------------------------------------------------ summary

const textList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []);

function SummarySection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Txt v="body-small" tone="highlight" w={7} as="h4">
        {label}
      </Txt>
      {children}
    </div>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <Txt v="body" tone="highlight" w={7} className="shrink-0" style={{ minWidth: 26 }} aria-hidden="true">
            {index + 1}.
          </Txt>
          <Txt v="body" style={{ fontSize: 17, lineHeight: '27px' }} className="min-w-0 flex-1" pre>
            {item}
          </Txt>
        </li>
      ))}
    </ol>
  );
}

export function SummaryBlock({ content }: { content: Record<string, unknown> }) {
  const heading = asText(content.heading);
  const keyIdeas = textList(content.takeaways);
  const keyScripture = Array.isArray(content.keyScripture) ? content.keyScripture : [];
  const prophecy = textList(content.prophecyTakeaways);
  const application = textList(content.applicationTakeaways);
  if (keyIdeas.length + keyScripture.length + prophecy.length + application.length === 0) return null;
  return (
    <Frame variant="evidence" style={{ gap: 24 }}>
      <Txt v="section-heading" as="h3">
        {heading || 'Summary'}
      </Txt>
      {keyIdeas.length > 0 && (
        <SummarySection label="Key ideas">
          <NumberedList items={keyIdeas} />
        </SummarySection>
      )}
      {keyScripture.length > 0 && (
        <SummarySection label="Key Scripture">
          <ScriptureLinks entries={keyScripture} presentation="inline" />
        </SummarySection>
      )}
      {prophecy.length > 0 && (
        <SummarySection label="Prophecy takeaways">
          <NumberedList items={prophecy} />
        </SummarySection>
      )}
      {application.length > 0 && (
        <SummarySection label="Application takeaways">
          <NumberedList items={application} />
        </SummarySection>
      )}
    </Frame>
  );
}

// ------------------------------------------------------------------------------------------------ historical evidence

function readEvidence(content: Record<string, unknown>) {
  const source = content.source;
  if (!isRecord(source)) return null;
  if (content.image !== undefined && !isRecord(content.image)) return null;
  const title = asText(content.title);
  const dateLabel = asText(content.dateLabel);
  const explanation = asText(content.explanation);
  const citation = asText(source.citation);
  if (!title || !dateLabel || !explanation || !citation) return null;
  const rawUrl = asText(source.url);
  const image = isRecord(content.image) && asText(content.image.mediaId) ? content.image : null;
  return {
    title,
    dateLabel,
    explanation,
    citation,
    quote: asText(content.quote),
    url: rawUrl && isHttpUrl(rawUrl) ? rawUrl : null,
    image: image ? { mediaId: asText(image.mediaId), altText: asText(image.altText), caption: asText(image.caption), source: asText(image.credit) } : null,
  };
}

export function EvidenceBlock({ content }: { content: Record<string, unknown> }) {
  const evidence = readEvidence(content);
  if (!evidence) {
    return <Notice title="Historical evidence not available" message="This evidence could not be shown completely, so it is hidden rather than shown with parts missing. The rest of the lesson is not affected." />;
  }
  return (
    <Frame variant="evidence" style={{ gap: 16 }}>
      <div className="flex flex-col gap-1">
        <Txt v="body-small" tone="highlight" w={6}>
          {evidence.dateLabel}
        </Txt>
        <Txt v="heading" as="h3">
          {evidence.title}
        </Txt>
      </div>
      <Txt v="body" read pre>
        {evidence.explanation}
      </Txt>
      {evidence.quote && (
        <figure className="flex flex-col gap-1 pl-4" style={{ borderLeft: '3px solid var(--lp-primary)' }}>
          <Txt v="body-small" tone="muted" w={6} as="figcaption">
            Source quotation
          </Txt>
          <blockquote>
            <Txt v="scripture" tone="bright" className="lp-italic" pre>
              {evidence.quote}
            </Txt>
          </blockquote>
        </figure>
      )}
      {evidence.image && <LessonImage content={evidence.image} />}
      <div className="flex flex-col gap-2 pt-3" style={{ borderTop: '1px solid var(--lp-divider)' }}>
        <Txt v="body-small" tone="secondary">
          Source: {evidence.citation}
        </Txt>
        {evidence.url && (
          <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-secondary lp-btn-sm self-start" style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'left' }}>
            Open the source website (external link)
          </a>
        )}
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------------------------------ Scripture connections

export function ScriptureConnectionBlock({ content }: { content: Record<string, unknown> }) {
  const title = asText(content.title);
  const connections = (Array.isArray(content.connections) ? content.connections : [])
    .filter(isRecord)
    .map((c) => ({ label: asText(c.label), scripture: Array.isArray(c.scripture) ? c.scripture : [], explanation: asText(c.explanation) }))
    .filter((c) => c.scripture.length > 0 || c.explanation.length > 0);
  if (connections.length === 0) return <Notice title="Scripture connection not available" message="This part of the lesson could not be shown. The rest of the lesson is not affected." />;
  return (
    <div className="flex flex-col gap-4">
      {title && (
        <Txt v="heading" as="h3">
          {title}
        </Txt>
      )}
      {connections.map((connection, index) => (
        <div key={index} className="flex flex-col gap-3 pl-4" style={{ borderLeft: '2px solid var(--lp-gold)' }}>
          <Txt v="label" tone="highlight" as="h4">
            {connection.label ? `${index + 1}. ${connection.label}` : `Connection ${index + 1}`}
          </Txt>
          <ScriptureLinks entries={connection.scripture} presentation="inline" />
          {connection.explanation && (
            <div className="flex flex-col gap-1">
              <Txt v="body-small" tone="muted" w={6}>
                Explanation
              </Txt>
              <Txt v="body" read pre>
                {connection.explanation}
              </Txt>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ study activity and guided question

const ACTIVITY_LABELS: Record<string, string> = { REFLECT: 'Reflect', COMPARE: 'Compare', FIND: 'Find', STUDY: 'Study', READ: 'Read', PERSONAL_APPLICATION: 'Personal application' };

const Incomplete = ({ what }: { what: string }) => <Notice title={`${what} is incomplete`} message="Part of this block could not be read, so none of it is shown rather than a shortened version. The rest of the lesson is not affected." />;

export function StudyActivityBlock({ content }: { content: Record<string, unknown> }) {
  const type = typeof content.activityType === 'string' ? ACTIVITY_LABELS[content.activityType] : undefined;
  const scriptureOk = content.scripture === undefined || Array.isArray(content.scripture);
  if (!type || !isText(content.instruction) || !scriptureOk) return <Incomplete what="Study activity" />;
  return (
    <Frame variant="callout" style={{ gap: 12 }}>
      <Txt v="body-small" tone="highlight" w={7} as="h4">
        Study activity: {type}
      </Txt>
      <Txt v="body" style={{ fontSize: 17, lineHeight: '27px' }} pre>
        {content.instruction}
      </Txt>
      <ScriptureLinks entries={content.scripture} />
    </Frame>
  );
}

export function GuidedQuestionBlock({ content }: { content: Record<string, unknown> }) {
  const passages = Array.isArray(content.scripture) ? content.scripture : null;
  if (!isText(content.question) || !passages || passages.length === 0 || !isText(content.explanation)) return <Incomplete what="Guided question" />;
  return (
    <Frame variant="interactive">
      <Txt v="body-small" tone="highlight" w={7}>
        Guided question
      </Txt>
      <Txt v="section-heading" as="h3">
        {content.question}
      </Txt>
      <ScriptureLinks entries={passages} presentation="inline" />
      <div className="flex flex-col gap-0.5">
        <Txt v="body-small" tone="muted" w={6}>
          Explanation
        </Txt>
        <Txt v="body" style={{ fontSize: 17, lineHeight: '27px' }} pre>
          {content.explanation}
        </Txt>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------------------------------------ prophecy equivalence, comparison, calculation

/** Every entry of a list that must be a list of objects, or null if the list is missing, empty or has any entry that is not an object. */
const strictList = (value: unknown): Record<string, unknown>[] | null => (Array.isArray(value) && value.length > 0 && value.every(isRecord) ? (value as Record<string, unknown>[]) : null);

/** The optional Scripture of one item: per-passage handling stays in ScriptureLinks; a value that is not a list is reported for this item only. */
function OptionalScripture({ entries }: { entries: unknown }) {
  if (entries === undefined || entries === null) return null;
  if (!Array.isArray(entries)) {
    return (
      <Txt v="body-small" tone="warning" className="pt-1">
        The Scripture for this item could not be shown.
      </Txt>
    );
  }
  return <ScriptureLinks entries={entries} />;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Txt v="body-small" tone="muted" w={6}>
        {label}
      </Txt>
      {children}
    </div>
  );
}

const Panel = ({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) => (
  <Frame variant={strong ? 'interactive' : 'evidence'} style={{ gap: 12 }}>
    {children}
  </Frame>
);

export function EquivalenceBlock({ content }: { content: Record<string, unknown> }) {
  const items = strictList(content.items);
  const valid = isText(content.concept) && items !== null && items.every((i) => isText(i.expression) && (i.label === undefined || typeof i.label === 'string'));
  if (!valid || !items) return <Incomplete what="Prophecy equivalence" />;
  const concept = content.concept as string;
  return (
    <div className="flex flex-col gap-4">
      <div className="lp-rise flex flex-col gap-1">
        <Txt v="body-small" tone="highlight" w={7}>
          Prophecy equivalence
        </Txt>
        <Txt v="section-heading" as="h3">
          {concept}
        </Txt>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-stretch gap-3">
            <div aria-hidden="true" className="flex shrink-0 justify-center pt-4" style={{ width: 28 }}>
              <Txt v="heading" tone="highlight">
                =
              </Txt>
            </div>
            <div className="lp-rise min-w-0 flex-1">
              <Panel>
                <Txt v="body" w={6} style={{ fontSize: 17, lineHeight: '26px' }} aria-label={`Expression ${index + 1} of ${items.length}, equivalent to ${concept}: ${item.expression as string}`}>
                  {item.expression as string}
                </Txt>
                {isText(item.label) && (
                  <Txt v="body-small" tone="secondary">
                    {item.label}
                  </Txt>
                )}
                <OptionalScripture entries={item.scripture} />
              </Panel>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComparisonBlock({ content }: { content: Record<string, unknown> }) {
  const entities = strictList(content.entities);
  const rowsOf = (entity: Record<string, unknown>) => strictList(entity.characteristics);
  const valid =
    entities !== null &&
    (content.title === undefined || typeof content.title === 'string') &&
    entities.every((e) => {
      const rows = rowsOf(e);
      return isText(e.name) && (e.explanation === undefined || typeof e.explanation === 'string') && rows !== null && rows.every((r) => isText(r.label) && isText(r.value));
    });
  if (!valid || !entities) return <Incomplete what="Prophecy comparison" />;
  return (
    <div className="flex flex-col gap-4">
      <Txt v="section-heading" as="h3">
        {isText(content.title) ? content.title : 'Prophecy comparison'}
      </Txt>
      {entities.map((entity, index) => (
        <div key={index} className="lp-rise">
          <Panel strong>
            <Txt v="heading" tone="highlight" as="h4">
              {entity.name as string}
            </Txt>
            {(rowsOf(entity) ?? []).map((row, r) => (
              <Labelled key={r} label={row.label as string}>
                <Txt v="body" pre>
                  {row.value as string}
                </Txt>
              </Labelled>
            ))}
            <OptionalScripture entries={entity.scripture} />
            {isText(entity.explanation) && (
              <Labelled label="Explanation">
                <Txt v="body" tone="secondary" pre>
                  {entity.explanation}
                </Txt>
              </Labelled>
            )}
          </Panel>
        </div>
      ))}
    </div>
  );
}

export function CalculationBlock({ content }: { content: Record<string, unknown> }) {
  const steps = strictList(content.steps);
  const valid = steps !== null && (content.title === undefined || typeof content.title === 'string') && steps.every((s) => isText(s.value) && isText(s.result) && (s.operator === undefined || typeof s.operator === 'string'));
  if (!valid || !steps) return <Incomplete what="Prophecy calculation" />;
  return (
    <div className="flex flex-col gap-4">
      <Txt v="section-heading" as="h3">
        {isText(content.title) ? content.title : 'Prophecy calculation'}
      </Txt>
      {steps.map((step, index) => (
        <div key={index} className="lp-rise">
          <Panel>
            <Txt v="body-small" tone="highlight" w={7}>
              Step {index + 1}
            </Txt>
            <Labelled label="Value">
              <Txt v="body" style={{ fontSize: 17, lineHeight: '26px' }}>
                {step.value as string}
              </Txt>
            </Labelled>
            {isText(step.operator) && (
              <Labelled label="Operator or explanation">
                <Txt v="body" tone="secondary" pre>
                  {step.operator}
                </Txt>
              </Labelled>
            )}
            {/* the author's result, set apart so it is easy to find; shown exactly as written */}
            <div className="flex flex-col gap-0.5 pl-3" style={{ borderLeft: '3px solid var(--lp-primary)' }}>
              <Txt v="body-small" tone="muted" w={6}>
                Result
              </Txt>
              <Txt v="body" w={7} style={{ fontSize: 18, lineHeight: '27px' }}>
                {step.result as string}
              </Txt>
            </div>
          </Panel>
        </div>
      ))}
      <Txt v="body-small" tone="muted">
        Steps and results are shown as written by the author.
      </Txt>
    </div>
  );
}
