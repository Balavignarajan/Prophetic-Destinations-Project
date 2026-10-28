'use client';

import React, { Component, createContext, useCallback, useContext, useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LearningLevel } from '../../lib/types';
import MediaImage from '../MediaImage';

/**
 * The building blocks of the Lesson Preview, one for one with the learner app's own (mobile-app/src/components/ui): the text variants (AppText), block frames (BlockFrame), the "this part could
 * not be shown" notice (BlockNotice), divider, accent rule, buttons, chevrons and the picture box. They draw with the app's tokens through the classes of theme.ts. Everything here is display only.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
export const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

const NEWLINE = String.fromCharCode(10);

/** The author's text as paragraphs: a blank line starts a new one (as the app does), a single line break stays a line break inside it. */
export function paragraphsOf(value: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of value.split(NEWLINE)) {
    if (line.trim() === '') {
      if (current.length > 0) out.push(current.join(NEWLINE));
      current = [];
    } else current.push(line.trim());
  }
  if (current.length > 0) out.push(current.join(NEWLINE));
  return out;
}

/** The non-empty lines of a text (a hotspot's explanation is one paragraph per line). */
export const linesOf = (value: string): string[] =>
  value
    .split(NEWLINE)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

// ------------------------------------------------------------------------------------------------ what the phone gives its blocks

export interface PhoneContextValue {
  /** The element overlays (sheets, the 3D view, the enlarged picture) are drawn into: the phone's screen, so they cover the screen and nothing else. */
  host: HTMLElement | null;
  /** The size of the phone's screen, for blocks that fit themselves to it (a picture is never taller than most of the screen). */
  width: number;
  height: number;
  /** Book names for Scripture references that have no written form of their own yet. */
  bookNames: Record<string, string>;
  level: LearningLevel;
  lessonId: string;
  /** An overlay announces itself and the lesson behind it is made inert at once; it gets back the function that undoes that. */
  pushOverlay: () => () => void;
}

export const PhoneContext = createContext<PhoneContextValue>({ host: null, width: 0, height: 0, bookNames: {}, level: 'BEGINNER', lessonId: '', pushOverlay: () => () => undefined });
export const usePhone = (): PhoneContextValue => useContext(PhoneContext);

/** True when the person's system asks for reduced motion (sheets and entrances then just appear). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// ------------------------------------------------------------------------------------------------ text

export type TextVariant = 'title' | 'subtitle' | 'section-heading' | 'heading' | 'body' | 'body-small' | 'scripture' | 'label' | 'caption';
export type Tone = 'text' | 'bright' | 'secondary' | 'muted' | 'highlight' | 'on-primary' | 'success' | 'warning' | 'error';

const TONE_VAR: Record<Tone, string> = {
  text: '--lp-text',
  bright: '--lp-bright',
  secondary: '--lp-secondary',
  muted: '--lp-muted',
  highlight: '--lp-highlight',
  'on-primary': '--lp-on-primary',
  success: '--lp-success',
  warning: '--lp-warning',
  error: '--lp-error',
};

/** The one text component: the app's variant (face, size, line height) and a colour token. `read` is the 17/28 reading size of long lesson text; `pre` keeps the author's line breaks. */
export function Txt({
  v = 'body',
  tone = 'text',
  w,
  read,
  pre,
  as = 'p',
  className,
  children,
  ...rest
}: { v?: TextVariant; tone?: Tone; w?: 5 | 6 | 7; read?: boolean; pre?: boolean; as?: ElementType; className?: string; children?: ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'color'>) {
  const Tag = as;
  return (
    <Tag className={cx(`lp-${v}`, `lp-c-${tone}`, 'lp-wrap', w === 5 && 'lp-w5', w === 6 && 'lp-w6', w === 7 && 'lp-w7', read && 'lp-read', pre && 'lp-pre', className)} {...rest}>
      {children}
    </Tag>
  );
}

// ------------------------------------------------------------------------------------------------ frames, notices, rules, buttons

export type FrameVariant = 'reading' | 'scripture' | 'evidence' | 'interactive' | 'callout';

/** The shared container of a lesson block: spacing, surface and an accent (reading: none; scripture: thin gold edge; evidence: raised; interactive: roomy gold card; callout: gold bar). */
export function Frame({ variant = 'reading', className, children, ...rest }: { variant?: FrameVariant; className?: string; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('lp-frame', `lp-frame-${variant}`, className)} {...rest}>
      {children}
    </div>
  );
}

export type NoticeVariant = 'unavailable' | 'unsupported' | 'missing' | 'offline';
const NOTICE: Record<NoticeVariant, { glyph: string; tone: Tone }> = {
  unavailable: { glyph: '!', tone: 'warning' },
  missing: { glyph: '!', tone: 'warning' },
  unsupported: { glyph: 'i', tone: 'secondary' },
  offline: { glyph: 'i', tone: 'secondary' },
};

/** The one "this part could not be shown" box: an indicator, a title and an optional sentence. The indicator is decorative; the title carries the meaning. */
export function Notice({ title, message, variant = 'unavailable' }: { title: string; message?: string; variant?: NoticeVariant }) {
  const { glyph, tone } = NOTICE[variant];
  return (
    <div className="lp-notice" style={{ borderLeftColor: `var(${TONE_VAR[tone]})` }}>
      <span className={cx('lp-notice-dot', `lp-c-${tone}`)} aria-hidden="true">
        {glyph}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Txt v="body-small" tone={tone} w={7}>
          {title}
        </Txt>
        {message && (
          <Txt v="body-small" tone="secondary">
            {message}
          </Txt>
        )}
      </div>
    </div>
  );
}

export const Divider = ({ gold = false }: { gold?: boolean }) => <div aria-hidden="true" className={cx('lp-divider', gold && 'lp-divider-gold')} />;

/** The short antique-gold rule under a heading; it draws itself in once (just there with reduced motion). */
export const Rule = ({ title = false, className }: { title?: boolean; className?: string }) => <div aria-hidden="true" className={cx('lp-rule lp-draw', title && 'lp-rule-title', className)} />;

/** The gold call to action (`primary`) or the quieter outlined one (`secondary`). Sizes: lg 56, md 48, sm 44 (the app's touch targets). */
export function Btn({ kind = 'primary', size = 'lg', className, children, ...rest }: { kind?: 'primary' | 'secondary'; size?: 'lg' | 'md' | 'sm' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx('lp-btn', `lp-btn-${kind}`, `lp-btn-${size}`, className)} {...rest}>
      {children}
    </button>
  );
}

/** A small chevron drawn as a line icon. `dir` is the way it points. */
export function Chevron({ dir = 'right', size = 12, tone = 'highlight', style }: { dir?: 'left' | 'right' | 'up' | 'down'; size?: number; tone?: Tone; style?: React.CSSProperties }) {
  const turn = dir === 'right' ? 0 : dir === 'down' ? 90 : dir === 'left' ? 180 : -90;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx('shrink-0', `lp-c-${tone}`)}
      style={{ transform: `rotate(${turn}deg)`, transition: 'transform .2s ease', ...style }}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Down when closed and up when open, turning between the two. The control's own aria-expanded says whether it is open. */
export const TurnChevron = ({ open, size = 14 }: { open: boolean; size?: number }) => <Chevron dir={open ? 'up' : 'down'} size={size} />;

export const Spinner = () => <span className="lp-spinner" role="status" aria-label="Loading" />;

// ------------------------------------------------------------------------------------------------ pictures

export type PicStatus = 'loading' | 'ready' | 'failed';

/**
 * A picture from the Media Library, drawn to fill the (positioned) box it is in. The picture is fetched with the administrator's own credentials by `MediaImage` (the media routes are not public),
 * and the box shows a spinner until it is there. When it cannot be loaded `onStatus` says so and the owner draws the app's own fallback; the picture is never a broken image.
 */
export function Picture({ mediaId, alt, fit = 'contain', onStatus, onNaturalSize }: { mediaId: string; alt: string; fit?: 'cover' | 'contain'; onStatus?: (status: PicStatus) => void; onNaturalSize?: (size: { width: number; height: number }) => void }) {
  const [status, setStatus] = useState<PicStatus>('loading');
  const change = useCallback(
    (next: PicStatus) => {
      setStatus(next);
      onStatus?.(next);
    },
    [onStatus],
  );
  return (
    <>
      <span className={cx('absolute inset-0 block', status !== 'ready' && 'invisible')} aria-hidden={status === 'ready' ? undefined : true}>
        <MediaImage mediaId={mediaId} alt={alt} fit={fit} className="block h-full w-full text-[0px]" onStatus={change} onNaturalSize={onNaturalSize} />
      </span>
      {status === 'loading' && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="lp-spinner" />
        </span>
      )}
    </>
  );
}

/** The lesson cover and other decorative pictures: filled box, cropped to fit (the app's CoverImage). A picture that cannot be shown leaves a quiet box. */
export function CoverPicture({ mediaId, height, width = '100%', radius = 10 }: { mediaId: string; height: number; width?: number | string; radius?: number }) {
  return (
    <div aria-hidden="true" className="relative shrink-0 overflow-hidden" style={{ width, height, borderRadius: radius, background: 'var(--lp-elevated)' }}>
      <Picture mediaId={mediaId} alt="" fit="cover" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ overlays

/**
 * A sheet or full-screen layer over the phone's screen (the app's modals): drawn into the screen element, so it covers exactly the screen. It takes focus when it opens and gives it back when it
 * closes, Escape closes it (and only it, not the whole preview), and while it is open the lesson behind it is inert.
 */
export function PhoneOverlay({ kind = 'sheet', label, onClose, children }: { kind?: 'sheet' | 'full'; label: string; onClose: () => void; children: ReactNode }) {
  const { host, pushOverlay } = usePhone();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Order matters: what had focus is noted first; the lesson behind is made inert; focus moves in. On the way out the lesson is made usable again BEFORE focus goes back (an inert element cannot take it).
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = pushOverlay();
    ref.current?.querySelector<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')?.focus();
    return () => {
      release();
      previous?.focus();
    };
  }, [pushOverlay]);
  if (!host) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cx('lp-overlay', kind === 'sheet' ? 'lp-overlay-end' : 'lp-overlay-full')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }}
      onMouseDown={(event) => {
        if (kind === 'sheet' && event.target === event.currentTarget) closeRef.current();
      }}
    >
      {kind === 'sheet' ? (
        <div className="lp-sheet">
          <div className="lp-sheet-handle" aria-hidden="true" />
          {children}
        </div>
      ) : (
        children
      )}
    </div>,
    host,
  );
}

/** The ✕ button of an overlay's header. */
export const CloseButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="lp-icon-btn lp-heading" aria-label={label} onClick={onClick}>
    <span aria-hidden="true" className="lp-c-secondary">
      ✕
    </span>
  </button>
);

// ------------------------------------------------------------------------------------------------ one block that cannot be drawn must not take the lesson with it

export class BlockBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (this.state.failed) return <Notice title="This part could not be shown" message="Part of its content could not be read. The rest of the lesson is not affected." />;
    return this.props.children;
  }
}
