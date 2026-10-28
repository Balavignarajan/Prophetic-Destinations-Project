'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { readHotspotContent } from '../../lib/hotspot-block';
import { CompactScripture, ScriptureLinks } from './scripture';
import { Chevron, CloseButton, Notice, PhoneOverlay, Picture, Rule, Txt, cx, linesOf, usePhone, useReducedMotion, type PicStatus } from './ui';

/**
 * An INTERACTIVE_IMAGE (or MAP) block as the learner app draws it (mobile-app/src/learning/hotspot-image.tsx, hotspot-explanation.tsx, hotspot-sheet.tsx): the whole picture in a box of its own
 * shape (never cropped, never taller than most of the screen) with numbered gold markers at the saved positions, a quiet hint, the list of hotspots under it (the accessible equivalent of the
 * markers), and the explanation in a floating sheet over the screen with Previous / Next. Choosing a point changes only what is on screen here: nothing is saved, and the markers' positions are
 * exactly the saved ones. The hotspots are the ones the server gave for the previewed level.
 */
interface HotspotView {
  id: string;
  x: number | null;
  y: number | null;
  label: string;
  explanation: string;
  scripture: unknown;
}

/** The sheet's first row: "HOTSPOT 2 OF 5" with its small gold number, and Close. */
function TopBar({ noun, index, total, onClose }: { noun: string; index: number; total: number; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pl-4 pr-1">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="lp-caption lp-w7 lp-c-on-primary flex shrink-0 items-center justify-center" style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--lp-primary)' }}>
          {index + 1}
        </span>
        <Txt v="caption" tone="highlight" w={7} style={{ letterSpacing: 1 }} aria-label={`${noun} ${index + 1} of ${total}`}>
          {noun.toUpperCase()} {index + 1} OF {total}
        </Txt>
      </div>
      <CloseButton label={`Close ${noun.toLowerCase()} details`} onClick={onClose} />
    </div>
  );
}

/** Previous, the numbers, Next: the numbers scroll sideways so any number of hotspots fits a narrow phone, and the active one is kept in view. */
function Navigator({ noun, hotspots, index, onSelect }: { noun: string; hotspots: HotspotView[]; index: number; onSelect: (index: number) => void }) {
  const reduced = useReducedMotion();
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    chips.current[index]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [index, reduced]);
  return (
    <div className="flex items-center gap-1 px-2">
      <button type="button" className="lp-round" aria-label={`Previous ${noun.toLowerCase()}`} disabled={index <= 0} onClick={() => onSelect(index - 1)}>
        <Chevron dir="left" size={16} tone="secondary" />
      </button>
      <div className="lp-hidden-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {hotspots.map((h, i) => (
          <button
            key={h.id}
            ref={(element) => {
              chips.current[i] = element;
            }}
            type="button"
            className="lp-chip"
            aria-label={`${noun} ${i + 1}: ${h.label || 'no label'}`}
            aria-pressed={i === index}
            onClick={() => onSelect(i)}
          >
            <span className={cx('lp-chip-inner', i === index && 'lp-chip-on')}>{i + 1}</span>
          </button>
        ))}
      </div>
      <button type="button" className="lp-round" aria-label={`Next ${noun.toLowerCase()}`} disabled={index >= hotspots.length - 1} onClick={() => onSelect(index + 1)}>
        <Chevron dir="right" size={16} tone="secondary" />
      </button>
    </div>
  );
}

/** The explanation itself: the title, the author's text as readable paragraphs and the compact Scripture references. Nothing is cut; a long explanation is simply longer and the sheet scrolls. */
function Explanation({ noun, hotspot }: { noun: string; hotspot: HotspotView }) {
  return (
    <div key={hotspot.id} className="lp-rise flex flex-col gap-3" aria-live="polite">
      <Txt v="heading" as="h3">
        {hotspot.label || noun}
      </Txt>
      <Rule />
      {linesOf(hotspot.explanation).map((paragraph, i) => (
        <Txt key={i} v="body" style={{ fontSize: 16, lineHeight: '27px' }}>
          {paragraph}
        </Txt>
      ))}
      <CompactScripture entries={hotspot.scripture} />
    </div>
  );
}

export function HotspotImageBlock({ content, variant = 'interactive' }: { content: Record<string, unknown>; variant?: 'interactive' | 'map' }) {
  const block = readHotspotContent(content);
  const isMap = variant === 'map';
  const noun = isMap ? 'Marker' : 'Hotspot';
  const { height: screenHeight } = usePhone();
  const hotspots: HotspotView[] = block.hotspots.map((h) => ({ id: h.id, x: h.x, y: h.y, label: h.label, explanation: h.explanation, scripture: h.scriptureRaw }));
  const [status, setStatus] = useState<PicStatus>('loading');
  const [ratio, setRatio] = useState(16 / 9);
  const [selected, setSelected] = useState<string | null>(null);
  const [blockWidth, setBlockWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const lastChosen = useRef<string | null>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setBlockWidth(Math.round(element.getBoundingClientRect().width)));
    observer.observe(element);
    setBlockWidth(Math.round(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  const onStatus = useCallback((next: PicStatus) => setStatus(next), []);
  const choose = useCallback((id: string) => {
    lastChosen.current = id;
    setSelected((current) => (current === id ? null : id));
  }, []);
  const close = useCallback(() => {
    const id = lastChosen.current;
    setSelected(null);
    // after the sheet has left, focus goes back to the marker (or list row) that was chosen last
    window.setTimeout(() => {
      if (id) markers.current.get(id)?.focus();
    }, 0);
  }, []);

  if (!block.mediaId) return <Notice variant="offline" title="An image belongs here, but none is chosen yet." message="Choose the picture in the block's editor." />;

  const imageFailed = status === 'failed';
  const maxHeight = Math.max(240, screenHeight * 0.7);
  // The picture's box: its own aspect ratio, as wide as the space allows but never taller than its share of the screen, so the whole picture is on screen.
  const boxWidth = blockWidth > 0 ? Math.min(blockWidth, Math.floor(maxHeight * ratio)) : 0;
  const active = imageFailed ? null : (hotspots.find((h) => h.id === selected) ?? null);
  const activeIndex = active ? hotspots.findIndex((h) => h.id === active.id) : -1;
  const hasMarkers = hotspots.some((h) => h.x !== null && h.y !== null);
  const labelled = active && active.x !== null && active.y !== null && active.label.trim() !== '' ? active : null;
  const goTo = (index: number) => {
    const target = hotspots[index];
    if (target) {
      lastChosen.current = target.id;
      setSelected(target.id);
    }
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {isMap && block.title.trim() && (
        <Txt v="section-heading" as="h3">
          {block.title.trim()}
        </Txt>
      )}
      {imageFailed ? (
        <Notice
          variant="offline"
          title={block.altText ? `${isMap ? 'Map or diagram' : 'Image'}: ${block.altText}` : `${isMap ? 'A map or diagram' : 'An image'} belongs here, but it could not be shown.`}
          message={`${hotspots.length > 0 ? `The ${noun.toLowerCase()}s are listed below. ` : ''}The image could not be loaded. It may have been deleted from the Media Library.`}
        />
      ) : (
        <>
          <div style={{ width: boxWidth > 0 ? boxWidth : '100%', alignSelf: 'center' }}>
            <div className={cx('relative w-full rounded-2xl')} style={{ aspectRatio: ratio, background: status === 'ready' ? 'var(--lp-surface)' : 'var(--lp-elevated)' }}>
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <Picture
                  mediaId={block.mediaId}
                  alt={block.altText || block.caption || (isMap ? 'Map or diagram' : 'Interactive image')}
                  fit="contain"
                  onStatus={onStatus}
                  onNaturalSize={(size) => {
                    if (size.width > 0 && size.height > 0) setRatio(size.width / size.height);
                  }}
                />
              </div>
              {status === 'ready' &&
                hotspots.map((h, index) =>
                  h.x === null || h.y === null ? null : (
                    <button
                      key={h.id}
                      ref={(element) => {
                        if (element) markers.current.set(h.id, element);
                        else markers.current.delete(h.id);
                      }}
                      type="button"
                      className={cx('lp-marker', selected === h.id && 'lp-marker-on', selected !== null && selected !== h.id && 'lp-marker-dim')}
                      style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                      aria-label={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                      aria-pressed={selected === h.id}
                      onClick={() => choose(h.id)}
                    >
                      <span className="lp-marker-halo">
                        <span className="lp-marker-dot">{index + 1}</span>
                      </span>
                    </button>
                  ),
                )}
              {/* the chosen marker's title, beside it; it follows the one selection and takes no touches */}
              {status === 'ready' && labelled && labelled.x !== null && labelled.y !== null && (
                <span aria-hidden="true" className="lp-float-label" style={{ top: `${labelled.y * 100}%`, transform: 'translateY(-50%)', ...(labelled.x < 0.55 ? { left: `calc(${labelled.x * 100}% + 26px)` } : { right: `calc(${(1 - labelled.x) * 100}% + 26px)` }) }}>
                  {labelled.label.trim()}
                </span>
              )}
              {/* the frame is drawn over the picture, so it takes no room and cannot move a marker; it turns gold only while the learner is exploring */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl" style={{ border: `1px solid ${selected !== null ? 'var(--lp-gold)' : 'var(--lp-subtle)'}` }} />
            </div>
          </div>
          {hasMarkers && status === 'ready' && (
            <div className="flex items-center justify-center gap-2">
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--lp-primary)' }} />
              <Txt v="body-small" tone="muted">
                Tap a numbered point to explore its meaning.
              </Txt>
            </div>
          )}
        </>
      )}

      {/* The hotspots are the ones the server gave for this level; if none is meant for it the picture stands alone, and says so (a map may simply be an image). */}
      {!isMap && hotspots.length === 0 && (
        <Txt v="body-small" tone="muted">
          There are no hotspots on this image at your level.
        </Txt>
      )}

      {hotspots.length > 0 && (
        <ul className="flex flex-col gap-2">
          {hotspots.map((h, index) => {
            const open = imageFailed || selected === h.id;
            const on = selected === h.id;
            return (
              <li key={h.id} className="rounded-2xl" style={{ border: `1px solid ${open ? 'var(--lp-gold)' : 'var(--lp-subtle)'}`, background: on ? 'var(--lp-elevated)' : 'var(--lp-surface)' }}>
                <button
                  ref={(element) => {
                    if (element && (status !== 'ready' || h.x === null || h.y === null)) markers.current.set(h.id, element);
                  }}
                  type="button"
                  className="flex w-full items-center gap-3 p-3"
                  style={{ minHeight: 52 }}
                  aria-label={`${noun} ${index + 1}: ${h.label || 'no label'}`}
                  aria-pressed={on}
                  onClick={() => choose(h.id)}
                >
                  <span className={cx('lp-num', on && 'lp-num-on')}>{index + 1}</span>
                  <Txt v="body" w={on ? 7 : 5} as="span" className="min-w-0 flex-1">
                    {h.label || noun}
                  </Txt>
                </button>
                {imageFailed && (h.explanation || h.scripture) && (
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    <Txt v="body" tone="secondary" style={{ fontSize: 16, lineHeight: '25px' }} pre>
                      {h.explanation}
                    </Txt>
                    <ScriptureLinks entries={h.scripture} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {block.caption && (
        <Txt v="body-small" tone="secondary">
          {block.caption}
        </Txt>
      )}
      {block.source && (
        <Txt v="body-small" tone="muted">
          Source: {block.source}
        </Txt>
      )}

      {/* The floating explanation, as the app's bottom sheet: it covers the screen with a scrim, so the lesson behind is not scrolled or changed. */}
      {active && activeIndex >= 0 && (
        <PhoneOverlay kind="sheet" label={`${noun} details`} onClose={close}>
          <TopBar noun={noun} index={activeIndex} total={hotspots.length} onClose={close} />
          <Navigator noun={noun} hotspots={hotspots} index={activeIndex} onSelect={goTo} />
          <div className="lp-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
            <Explanation noun={noun} hotspot={active} />
          </div>
        </PhoneOverlay>
      )}
    </div>
  );
}
