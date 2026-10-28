import React from 'react';

/**
 * A small line icon for each kind of block, so the library can be scanned by shape as well as by name. Decorative (aria-hidden): the type's name is always written beside it. A type with no
 * icon of its own gets the generic block icon.
 */
type Glyph = 'text' | 'heading' | 'quote' | 'image' | 'timeline' | 'pin' | 'cube' | 'list' | 'play' | 'study' | 'compare' | 'block';

const PATHS: Record<Glyph, string[]> = {
  text: ['M5 7h14', 'M5 11.5h14', 'M5 16h9'],
  heading: ['M6 6v12', 'M18 6v12', 'M6 12h12'],
  quote: ['M7 8h4v4H8.5A2.5 2.5 0 0 0 7 14.5', 'M14 8h4v4h-2.5A2.5 2.5 0 0 0 14 14.5'],
  image: ['M4.5 6h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z', 'M4 16l4.5-4.5 3.5 3.5 3-3 5 5', 'M9 10.2h.01'],
  timeline: ['M12 4v16', 'M12 8h6', 'M12 15H6', 'M12 8h.01', 'M12 15h.01'],
  pin: ['M12 20.5s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z', 'M12 11.5h.01'],
  cube: ['M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5Z', 'M4.5 8 12 12.5 19.5 8', 'M12 12.5v8'],
  list: ['M9 7h10', 'M9 12h10', 'M9 17h10', 'M5 7h.01', 'M5 12h.01', 'M5 17h.01'],
  play: ['M4.5 6h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z', 'M10.5 9.5v5l4-2.5-4-2.5Z'],
  study: ['M5 5.5h9a3 3 0 0 1 3 3v10H8a3 3 0 0 1-3-3v-10Z', 'M17 8.5h2v10'],
  compare: ['M5 6h6v12H5z', 'M13 6h6v12h-6z'],
  block: ['M5 5h14v14H5z', 'M9 9h6', 'M9 13h4'],
};

const GLYPH_OF: Record<string, Glyph> = {
  RICH_TEXT: 'text',
  SECTION_INTRO: 'heading',
  CALLOUT: 'quote',
  SUMMARY: 'list',
  SCRIPTURE_PASSAGE: 'study',
  SCRIPTURE_CONNECTION: 'study',
  EXPLORE_DEEPER: 'block',
  HISTORICAL_EVIDENCE: 'quote',
  IMAGE: 'image',
  INTERACTIVE_IMAGE: 'pin',
  MAP: 'pin',
  WORD_STUDY: 'study',
  SYMBOL_STUDY: 'study',
  PROPHECY_EQUIVALENCE: 'compare',
  PROPHECY_COMPARISON: 'compare',
  PROPHECY_CALCULATION: 'list',
  REFLECTION_STUDY_ACTIVITY: 'text',
  GUIDED_DISCOVERY_QUESTION: 'quote',
  NARRATIVE_SCENE: 'image',
  MEDIA_ANIMATION: 'play',
  INTERACTIVE_3D_MODEL: 'cube',
  TIMELINE: 'timeline',
};

export default function BlockTypeIcon({ type, className = 'h-5 w-5' }: { type: string; className?: string }) {
  const paths = PATHS[GLYPH_OF[type] ?? 'block'];
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
