'use client';

import React, { useMemo, useState } from 'react';
import type { ViewerHotspot } from '../../lib/glb-viewer';
import { GLB_CONTENT_TYPE, readModel3D, type Hotspot3DDraft } from '../../lib/model-3d';
import { useModelAsset } from '../../lib/use-model-asset';
import CubeIcon from '../CubeIcon';
import Model3DViewer from '../Model3DViewer';
import { CompactScripture } from './scripture';
import { Btn, Chevron, CloseButton, PhoneOverlay, Picture, Txt, cx, linesOf, type PicStatus } from './ui';

/**
 * An INTERACTIVE_3D_MODEL block as the learner app draws it (mobile-app/src/learning/model-3d-block.tsx, model-3d-viewer.tsx, model-3d-panels.tsx). In the lesson it is a discovery card: the poster
 * on a dark stage (or a quiet emblem), the label "INTERACTIVE 3D EXPERIENCE", the title, one line of what to do and the "Explore in 3D" button. Nothing is downloaded and no WebGL scene exists
 * until that button is pressed. Then the real model opens in a full-screen layer over the phone's screen, drawn by the Admin's existing GLB viewer (the same engine as the 3D editor: nothing is
 * duplicated), with the hotspots as numbered markers, a list of them ("Explore the Model") and a discovery panel with Previous and Next. Closing the layer, changing the level, resetting the
 * preview or closing the preview releases the viewer, its download and its graphics. Nothing is saved.
 */
function Emblem() {
  return (
    <div aria-hidden="true" className="relative flex items-center justify-center overflow-hidden" style={{ height: 136, background: 'var(--lp-background)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, var(--lp-glow), transparent 70%)' }} />
      <div className="relative flex items-center justify-center" style={{ width: 104, height: 104, borderRadius: 52, border: '1px solid var(--lp-subtle)' }}>
        <div className="flex items-center justify-center" style={{ width: 80, height: 80, borderRadius: 40, border: '1px solid var(--lp-gold)' }}>
          <div className="lp-c-highlight flex items-center justify-center" style={{ width: 58, height: 58, borderRadius: 29, background: 'var(--lp-elevated)' }}>
            <CubeIcon className="h-7 w-7" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The discovery point's panel: its title, the author's text and Scripture, with Previous and Next. */
function DiscoveryPanel({ hotspots, index, onSelect, onClose }: { hotspots: Hotspot3DDraft[]; index: number; onSelect: (index: number) => void; onClose: () => void }) {
  const hotspot = hotspots[index];
  if (!hotspot) return null;
  return (
    <section aria-label={`Discovery point ${index + 1}`} className="flex shrink-0 flex-col" style={{ maxHeight: '55%', borderTop: '1px solid var(--lp-subtle)', borderTopLeftRadius: 24, borderTopRightRadius: 24, background: 'var(--lp-elevated)' }}>
      <div className="flex items-center justify-between gap-2 pl-4 pr-1 pt-2">
        <div className="min-w-0">
          <Txt v="caption" tone="highlight" w={7} style={{ letterSpacing: 1.6 }}>
            DISCOVERY POINT {index + 1}
          </Txt>
          <Txt v="caption" tone="muted">
            of {hotspots.length}
          </Txt>
        </div>
        <CloseButton label="Close hotspot details" onClick={onClose} />
      </div>
      <div className="lp-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        <div key={hotspot.id} className="lp-rise flex flex-col gap-3" aria-live="polite">
          <Txt v="heading" as="h3">
            {hotspot.label || 'Discovery point'}
          </Txt>
          {linesOf(hotspot.explanation).map((paragraph, i) => (
            <Txt key={i} v="body" style={{ fontSize: 16, lineHeight: '27px' }}>
              {paragraph}
            </Txt>
          ))}
          <CompactScripture entries={hotspot.scriptureRaw} />
        </div>
      </div>
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <button type="button" className="lp-round" aria-label="Previous discovery point" disabled={index <= 0} onClick={() => onSelect(index - 1)}>
          <Chevron dir="left" size={16} tone="secondary" />
        </button>
        <Txt v="body-small" tone="muted">
          {index + 1} of {hotspots.length}
        </Txt>
        <button type="button" className="lp-round" aria-label="Next discovery point" disabled={index >= hotspots.length - 1} onClick={() => onSelect(index + 1)}>
          <Chevron dir="right" size={16} tone="secondary" />
        </button>
      </div>
    </section>
  );
}

/** "Explore the Model": the list of the points, the way to reach one whose marker is hidden behind the model. */
function PointList({ hotspots, selectedId, onSelect, onClose }: { hotspots: Hotspot3DDraft[]; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <section aria-label="Explore the model" className="flex shrink-0 flex-col" style={{ maxHeight: '55%', borderTop: '1px solid var(--lp-subtle)', borderTopLeftRadius: 24, borderTopRightRadius: 24, background: 'var(--lp-elevated)' }}>
      <div className="flex items-center justify-between gap-2 pl-4 pr-1 pt-2">
        <div className="min-w-0">
          <Txt v="heading" style={{ fontSize: 18, lineHeight: '26px' }} as="h3">
            Explore the Model
          </Txt>
          <Txt v="caption" tone="highlight" w={7} style={{ letterSpacing: 1.2 }}>
            {hotspots.length} {hotspots.length === 1 ? 'DISCOVERY POINT' : 'DISCOVERY POINTS'}
          </Txt>
        </div>
        <CloseButton label="Close the list of hotspots" onClick={onClose} />
      </div>
      <ul className="lp-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {hotspots.map((h, index) => (
          <li key={h.id}>
            <button type="button" className="lp-sheet-item" aria-label={`Hotspot ${index + 1}: ${h.label || 'no title'}${h.position ? '' : ', not placed on the model'}`} aria-pressed={h.id === selectedId} onClick={() => onSelect(h.id)}>
              <span className={cx('lp-num', h.id === selectedId && 'lp-num-on')}>{index + 1}</span>
              <Txt v="body" w={h.id === selectedId ? 7 : 5} as="span" className="min-w-0 flex-1">
                {h.label || 'Untitled'}
              </Txt>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The full-screen layer: a light header (close, "3D EXPLORATION" and the title, the list), the model filling the rest, and the open panel. */
function ModelOverlay({ title, mediaId, hotspots, onClose }: { title: string; mediaId: string; hotspots: Hotspot3DDraft[]; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const markerKey = hotspots.map((h) => `${h.id}:${h.position ? `${h.position.x},${h.position.y},${h.position.z}` : '-'}`).join('|');
  const markers = useMemo<ViewerHotspot[]>(
    () => hotspots.flatMap((h, index) => (h.position ? [{ id: h.id, position: [h.position.x, h.position.y, h.position.z] as [number, number, number], number: index + 1 }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markerKey],
  );
  const index = hotspots.findIndex((h) => h.id === selectedId);
  const choose = (id: string) => {
    setSelectedId(id);
    setListOpen(false);
  };
  return (
    <PhoneOverlay kind="full" label={`3D exploration${title ? `: ${title}` : ''}`} onClose={onClose}>
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <button type="button" className="lp-icon-btn" aria-label="Close the 3D view" onClick={onClose}>
          <Chevron dir="left" size={16} tone="text" />
        </button>
        <div className="min-w-0 flex-1">
          <Txt v="caption" tone="highlight" w={7} style={{ letterSpacing: 1.6 }}>
            3D EXPLORATION
          </Txt>
          {title && (
            <Txt v="heading" style={{ fontSize: 18, lineHeight: '26px' }} className="truncate" as="h3">
              {title}
            </Txt>
          )}
        </div>
        {hotspots.length > 0 && (
          <button type="button" className="lp-outline-btn lp-body-small lp-w6" aria-expanded={listOpen} onClick={() => setListOpen((open) => !open)}>
            Hotspots
            <span className="lp-c-muted">{hotspots.length}</span>
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Model3DViewer
            mediaId={mediaId}
            title={title}
            fill
            showFileInfo={false}
            hotspots={markers}
            hotspotTotal={hotspots.length}
            selectedId={selectedId}
            onSelectHotspot={(id) => {
              setSelectedId(id);
              setListOpen(false);
            }}
            onClose={onClose}
          />
        </div>
      </div>
      {listOpen ? <PointList hotspots={hotspots} selectedId={selectedId} onSelect={choose} onClose={() => setListOpen(false)} /> : index >= 0 ? <DiscoveryPanel hotspots={hotspots} index={index} onSelect={(i) => setSelectedId(hotspots[i]?.id ?? null)} onClose={() => setSelectedId(null)} /> : null}
    </PhoneOverlay>
  );
}

export function Model3DBlock({ content }: { content: Record<string, unknown> }) {
  const c = readModel3D(content);
  const asset = useModelAsset(c.mediaId);
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const [poster, setPoster] = useState<PicStatus>('loading');
  const title = c.title.trim();
  const description = c.description.trim();
  // The model is usable unless its file is gone or is not a GLB model (checked in the Media Library while the card is on screen).
  const usable = c.mediaId !== '' && asset !== 'missing' && !(asset !== null && asset.contentType !== GLB_CONTENT_TYPE);
  const showPoster = c.posterMediaId !== '' && poster !== 'failed';
  const stageRatio = Math.min(1.9, Math.max(1.15, ratio));
  const line = !usable ? 'This 3D model is not available right now.' : c.hotspots.length > 0 ? 'Rotate, zoom and tap the numbered points to discover more.' : 'Rotate and zoom to look closer.';

  return (
    <div className="lp-rise flex flex-col gap-3">
      <div className="lp-card3d">
        {showPoster ? (
          <div className="lp-stage3d" style={{ aspectRatio: stageRatio }}>
            <Picture
              mediaId={c.posterMediaId}
              alt={title ? `Poster of ${title}` : 'Poster of the 3D model'}
              fit="contain"
              onStatus={setPoster}
              onNaturalSize={(size) => {
                if (size.width > 0 && size.height > 0) setRatio(size.width / size.height);
              }}
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: '55%', background: 'linear-gradient(to bottom, transparent, var(--lp-surface))' }} />
            <div aria-hidden="true" className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 px-3 py-1" style={{ borderRadius: 999, border: '1px solid var(--lp-gold)', background: 'var(--lp-scrim)', color: 'var(--lp-on-image)' }}>
              <CubeIcon className="h-3.5 w-3.5" />
              <span className="lp-caption lp-w7" style={{ letterSpacing: 1 }}>
                3D
              </span>
            </div>
          </div>
        ) : (
          <Emblem />
        )}
        <div className="relative flex flex-col gap-2 px-4 pb-4 pt-3">
          <Txt v="caption" tone="highlight" w={7} style={{ letterSpacing: 1.6 }}>
            INTERACTIVE 3D EXPERIENCE
          </Txt>
          {title && (
            <Txt v="section-heading" style={{ fontSize: 22, lineHeight: '30px' }} as="h3">
              {title}
            </Txt>
          )}
          <Txt v="body-small" tone="secondary">
            {line}
          </Txt>
          {usable && (
            <div className="flex items-center gap-2">
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--lp-primary)' }} />
              <Txt v="caption" tone="muted">
                Needs an internet connection
              </Txt>
            </div>
          )}
          {usable && (
            <Btn size="lg" className="mt-2 self-stretch" onClick={() => setOpen(true)} aria-label="Explore in 3D. Opens the model in a full-screen 3D view. Drag to rotate and scroll to zoom.">
              Explore in 3D
            </Btn>
          )}
        </div>
      </div>
      {description && (
        <Txt v="body" style={{ fontSize: 16, lineHeight: '26px' }} pre>
          {description}
        </Txt>
      )}
      {open && usable && <ModelOverlay title={title} mediaId={c.mediaId} hotspots={c.hotspots} onClose={() => setOpen(false)} />}
    </div>
  );
}
