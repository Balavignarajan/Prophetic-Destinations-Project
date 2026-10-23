import React from 'react';

import { richTextToView, type ViewBlock, type ViewInline } from '../lib/rich-text-view';

/**
 * Renders a RICH_TEXT document the way a learner sees it. Everything is rendered as React text nodes (escaped by React); there is
 * no HTML injection anywhere. Links open in a new tab with rel="noopener noreferrer"; only safe http(s)/mailto targets get this far.
 * An inline Scripture reference is drawn as its label; when the document carries the frozen verse text (the learner preview) the passage is
 * shown under its paragraph, which is what a learner sees after opening the reference.
 */
function Inline({ item }: { item: ViewInline }) {
  if (item.scripture) {
    return (
      <span className="font-sans font-medium text-amber-800 underline decoration-dotted underline-offset-2" title="Scripture reference">
        {item.text}
      </span>
    );
  }
  let node: React.ReactNode = item.text;
  if (item.bold) node = <strong className="font-bold">{node}</strong>;
  if (item.italic) node = <em>{node}</em>;
  if (item.href) {
    node = (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline underline-offset-2 hover:text-amber-800">
        {node}
      </a>
    );
  }
  return <>{node}</>;
}

const HEADING_CLASS = {
  1: 'text-lg font-bold text-slate-900',
  2: 'text-base font-bold text-slate-900',
  3: 'text-sm font-bold text-slate-900',
} as const;

function Blocks({ blocks }: { blocks: ViewBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Heading = `h${block.level + 2}` as 'h3' | 'h4' | 'h5';
          return (
            <Heading key={index} className={HEADING_CLASS[block.level]}>
              {block.text}
            </Heading>
          );
        }
        if (block.kind === 'paragraph') {
          return (
            <React.Fragment key={index}>
              <p className="whitespace-pre-line">
                {block.inlines.map((item, i) => (
                  <Inline key={i} item={item} />
                ))}
              </p>
              {block.passages?.map((passage, i) => (
                <figure key={i} className="border-l-2 border-amber-500 pl-3 font-serif text-sm text-slate-800">
                  <figcaption className="font-sans text-xs font-semibold text-amber-800">{passage.label}</figcaption>
                  <p className="mt-0.5">
                    {passage.verses.map((verse) => (
                      <span key={verse.verse}>
                        {passage.verses.length > 1 && <sup className="mr-0.5 font-sans text-[10px] text-slate-600">{verse.verse}</sup>}
                        {verse.text}{' '}
                      </span>
                    ))}
                  </p>
                  {passage.source && <p className="mt-0.5 font-sans text-xs text-slate-600">{passage.source}</p>}
                </figure>
              ))}
            </React.Fragment>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={index} className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1`}>
            {block.items.map((item, i) => (
              <li key={i} className="space-y-1">
                <Blocks blocks={item} />
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export default function RichTextView({ content, className = '' }: { content: unknown; className?: string }) {
  const blocks = richTextToView(content);
  if (blocks.length === 0) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      <Blocks blocks={blocks} />
    </div>
  );
}

export function hasRichTextContent(content: unknown): boolean {
  return richTextToView(content).length > 0;
}
