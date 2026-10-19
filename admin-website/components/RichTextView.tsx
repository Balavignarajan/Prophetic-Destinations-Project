import React from 'react';

import { richTextToView, type ViewBlock, type ViewInline } from '../lib/rich-text-view';

/**
 * Renders a RICH_TEXT document the way a learner sees it. Everything is rendered as React text nodes (escaped by React); there is
 * no HTML injection anywhere. Links open in a new tab with rel="noopener noreferrer"; only safe http(s)/mailto targets get this far.
 */
function Inline({ item }: { item: ViewInline }) {
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

function Blocks({ blocks }: { blocks: ViewBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={index} className="whitespace-pre-line">
              {block.inlines.map((item, i) => (
                <Inline key={i} item={item} />
              ))}
            </p>
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
