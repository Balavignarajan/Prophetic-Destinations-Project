'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScriptureInfo } from '../../lib/scripture-info';
import type { LearningLevel } from '../../lib/types';
import { BlockView, type PreviewBlock } from './LessonPhone';
import { PREVIEW_CSS, type PreviewTheme, ensurePreviewFonts, themeVars } from './theme';
import { Chevron, Notice, PhoneContext, type PhoneContextValue, Txt } from './ui';

/**
 * ONE block drawn the way the learner app draws it inside a lesson, in the same phone-shaped frame as the Lesson Preview: the same block components (BlockView of LessonPhone.tsx), the same theme and the
 * same phone context, so every interaction the block has works (a timeline event opens, a hotspot or marker shows its explanation, an explanation expands, Scripture is presented, a 3D model can be turned).
 * There is no lesson around it: no title, no reading bar, no completion button, because a reusable block is only a template. READ-ONLY: nothing is saved, sent or published, and no learner progress is touched.
 *
 * `block` null means "nothing to show at this level": the phone then says so instead of drawing an empty screen.
 */
const LEVEL_LABELS: Record<LearningLevel, string> = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

export default function BlockPhone({ theme, level, block, unavailable }: { theme: PreviewTheme; level: LearningLevel; block: PreviewBlock | null; unavailable?: { title: string; message: string } }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const main = useRef<HTMLDivElement>(null);
  const openOverlays = useRef(0);
  const scripture = useScriptureInfo();

  useEffect(() => {
    ensurePreviewFonts();
  }, []);

  // The size of the phone's screen, for blocks that fit themselves to it.
  useEffect(() => {
    if (!host || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const box = host.getBoundingClientRect();
      setSize((current) => (Math.round(box.width) === current.width && Math.round(box.height) === current.height ? current : { width: Math.round(box.width), height: Math.round(box.height) }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  // While a sheet or full-screen layer inside a block is open, the block behind it is inert (no focus, no clicks, hidden from screen readers), as in the lesson preview.
  const pushOverlay = useCallback(() => {
    openOverlays.current += 1;
    if (main.current) main.current.inert = true;
    return () => {
      openOverlays.current = Math.max(0, openOverlays.current - 1);
      if (openOverlays.current === 0 && main.current) main.current.inert = false;
    };
  }, []);

  const context = useMemo<PhoneContextValue>(
    () => ({ host, width: size.width, height: size.height, bookNames: scripture.bookNames, level, lessonId: block?.blockId ?? '', pushOverlay }),
    [host, size.width, size.height, scripture.bookNames, level, block?.blockId, pushOverlay],
  );

  return (
    <PhoneContext.Provider value={context}>
      <div className="h-full w-full rounded-[2.75rem] p-2.5" style={{ background: '#0B0E14', boxShadow: '0 28px 60px -12px rgba(0,0,0,.55), inset 0 0 0 1px #2B3140' }}>
        <style>{PREVIEW_CSS}</style>
        <div
          ref={setHost}
          role="region"
          aria-label={`Preview of the reusable block as it appears in a lesson in the mobile app, ${LEVEL_LABELS[level]} level, ${theme} theme`}
          data-theme={theme}
          className="lp-root relative flex h-full flex-col overflow-hidden rounded-[2.1rem]"
          style={themeVars(theme)}
        >
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2" style={{ width: 96, height: 24, borderRadius: 12, background: '#05070B' }} />
          <div ref={main} className="flex min-h-0 flex-1 flex-col">
            <div aria-hidden="true" className="shrink-0" style={{ height: 38 }} />
            <header className="shrink-0 px-6 pb-2">
              <div className="flex items-center gap-1 pt-1">
                <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{ width: 48, height: 48 }}>
                  <Chevron dir="left" size={16} tone="text" />
                </span>
                <div className="flex min-w-0 flex-1 items-center" style={{ minHeight: 48 }}>
                  <Txt v="body-small" w={6} as="h2" className="truncate">
                    Block preview · {LEVEL_LABELS[level]} level
                  </Txt>
                </div>
              </div>
            </header>
            <div tabIndex={0} role="group" aria-label="Block preview, scrollable" className="lp-scroll min-h-0 flex-1 overflow-y-auto" style={{ paddingTop: 12 }}>
              <div className="flex flex-col gap-6 px-6" style={{ paddingBottom: 40 }}>
                {block ? (
                  <BlockView block={block} />
                ) : (
                  <div role="status">
                    <Notice variant="unsupported" title={unavailable?.title ?? 'Nothing to show'} message={unavailable?.message ?? 'This block has no content to show.'} />
                  </div>
                )}
                <Txt v="caption" tone="muted" className="text-center">
                  Preview only: nothing here is saved, sent or published.
                </Txt>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2" style={{ width: 112, height: 4, borderRadius: 2, background: 'var(--lp-text)', opacity: 0.35 }} />
        </div>
      </div>
    </PhoneContext.Provider>
  );
}
