import type { CSSProperties } from 'react';

/**
 * The look of the Lesson Preview: the learner app's own design tokens, copied from mobile-app/src/theme/colors.ts (the two themes), typography.ts and shadows.ts so that the
 * preview draws the same colours, faces and sizes as the lesson reader. Nothing here is read from the app at run time and nothing is written back: it is a read-only copy for display.
 * The tokens are CSS custom properties set on the phone's root element; the stylesheet below turns the app's text variants, frames and controls into classes that use them.
 */
export type PreviewTheme = 'dark' | 'light';

export const PREVIEW_THEME_NAMES: Record<PreviewTheme, string> = { dark: 'Dark', light: 'Light' };

const SHARED: Record<string, string> = {
  '--lp-sans': "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  '--lp-serif': "'EB Garamond', Georgia, 'Times New Roman', Times, serif",
  '--lp-display': "'Cinzel', 'Trajan Pro', Georgia, 'Times New Roman', serif",
};

const DARK: Record<string, string> = {
  '--lp-background': '#07090F',
  '--lp-surface': '#131825',
  '--lp-elevated': '#1A2235',
  '--lp-input': '#0D1117',
  '--lp-primary': '#D4AF37',
  '--lp-primary-pressed': '#B8922A',
  '--lp-highlight': '#F5C842',
  '--lp-on-primary': '#07090F',
  '--lp-text': '#E8E0D0',
  '--lp-bright': '#F0E8D0',
  '--lp-secondary': '#B4BFCE',
  '--lp-muted': '#8A9BB0',
  '--lp-on-image': '#F0E8D0',
  '--lp-border': '#2A344B',
  '--lp-subtle': '#1F283B',
  '--lp-gold': 'rgba(212, 175, 55, 0.55)',
  '--lp-divider': '#1F283B',
  '--lp-success': '#5FAE7A',
  '--lp-warning': '#D98A3D',
  '--lp-error': '#E0726A',
  '--lp-overlay': 'rgba(7, 9, 15, 0.72)',
  '--lp-scrim': 'rgba(7, 9, 15, 0.45)',
  '--lp-disabled': '#222B3F',
  '--lp-disabled-text': '#7585A0',
  '--lp-glow': 'rgba(212, 175, 55, 0.28)',
  '--lp-shadow-card': '0 5px 12px rgba(0, 0, 0, 0.36)',
  '--lp-shadow-glow': '0 4px 12px rgba(212, 175, 55, 0.24)',
};

const LIGHT: Record<string, string> = {
  '--lp-background': '#F5EFE0',
  '--lp-surface': '#FBF7EB',
  '--lp-elevated': '#FFFBF2',
  '--lp-input': '#FBF7EB',
  '--lp-primary': '#A3801F',
  '--lp-primary-pressed': '#B8922A',
  '--lp-highlight': '#7A5C0F',
  '--lp-on-primary': '#07090F',
  '--lp-text': '#1C1812',
  '--lp-bright': '#1C1812',
  '--lp-secondary': '#4B4438',
  '--lp-muted': '#675F51',
  '--lp-on-image': '#F3EDE0',
  '--lp-border': '#CDC1A5',
  '--lp-subtle': '#DDD3BA',
  '--lp-gold': 'rgba(163, 128, 31, 0.7)',
  '--lp-divider': '#E0D6BE',
  '--lp-success': '#2E7D4F',
  '--lp-warning': '#97580B',
  '--lp-error': '#B3392F',
  '--lp-overlay': 'rgba(245, 239, 224, 0.82)',
  '--lp-scrim': 'rgba(7, 9, 15, 0.45)',
  '--lp-disabled': '#E4DCC8',
  '--lp-disabled-text': '#8A826F',
  '--lp-glow': 'rgba(163, 128, 31, 0.22)',
  '--lp-shadow-card': '0 4px 10px rgba(58, 46, 20, 0.14)',
  '--lp-shadow-glow': '0 4px 12px rgba(163, 128, 31, 0.22)',
};

/** The custom properties of one theme, ready for a `style` prop. */
export function themeVars(name: PreviewTheme): CSSProperties {
  return { ...SHARED, ...(name === 'dark' ? DARK : LIGHT) } as CSSProperties;
}

const FONTS_ID = 'lesson-preview-fonts';

/**
 * The app's three faces (Cinzel for titles, EB Garamond for Scripture, Inter for text) from Google Fonts, added once when a preview is first opened and left in place (the browser caches
 * them). Each face has a close system fallback, so the preview is still laid out the same way when the fonts cannot be reached.
 */
export function ensurePreviewFonts(): void {
  if (typeof document === 'undefined' || document.getElementById(FONTS_ID)) return;
  const link = document.createElement('link');
  link.id = FONTS_ID;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}

/**
 * The stylesheet: the app's text variants (typography.ts), block frames (block-frame.tsx, card.tsx), buttons, notices, quiz rows, sheets and hotspot markers, all in terms of the tokens above.
 * Sizes are the app's points as pixels. Everything is scoped under `.lp-root`, so none of it can reach the rest of the Admin.
 */
export const PREVIEW_CSS = `
.lp-root{font-family:var(--lp-sans);color:var(--lp-text);background:var(--lp-background);-webkit-font-smoothing:antialiased}
.lp-root *{box-sizing:border-box}
.lp-root button{font-family:inherit;color:inherit;cursor:pointer;text-align:inherit}
.lp-root button:disabled{cursor:default}
.lp-root :focus-visible{outline:2px solid var(--lp-highlight);outline-offset:2px}
.lp-root a{color:var(--lp-highlight);text-decoration:underline}

.lp-title{font-family:var(--lp-display);font-weight:600;font-size:30px;line-height:38px;letter-spacing:1px}
.lp-subtitle{font-family:var(--lp-serif);font-style:italic;font-weight:400;font-size:21px;line-height:30px}
.lp-section-heading{font-family:var(--lp-display);font-weight:500;font-size:24px;line-height:32px;letter-spacing:.8px}
.lp-heading{font-family:var(--lp-display);font-weight:500;font-size:20px;line-height:28px;letter-spacing:.6px}
.lp-body{font-family:var(--lp-sans);font-weight:400;font-size:16px;line-height:25px}
.lp-body-small{font-family:var(--lp-sans);font-weight:400;font-size:14px;line-height:21px}
.lp-scripture{font-family:var(--lp-serif);font-weight:400;font-size:19px;line-height:30px}
.lp-label{font-family:var(--lp-sans);font-weight:700;font-size:14px;line-height:20px;letter-spacing:.8px;text-transform:uppercase}
.lp-caption{font-family:var(--lp-sans);font-weight:400;font-size:13px;line-height:18px;letter-spacing:.2px}
.lp-read{font-size:17px;line-height:28px}
.lp-pre{white-space:pre-line;overflow-wrap:anywhere}
.lp-wrap{overflow-wrap:anywhere}
.lp-w5{font-weight:500}.lp-w6{font-weight:600}.lp-w7{font-weight:700}
.lp-italic{font-style:italic}
.lp-c-text{color:var(--lp-text)}.lp-c-bright{color:var(--lp-bright)}.lp-c-secondary{color:var(--lp-secondary)}.lp-c-muted{color:var(--lp-muted)}
.lp-c-highlight{color:var(--lp-highlight)}.lp-c-on-primary{color:var(--lp-on-primary)}.lp-c-success{color:var(--lp-success)}.lp-c-warning{color:var(--lp-warning)}.lp-c-error{color:var(--lp-error)}
.lp-link{color:var(--lp-highlight);text-decoration:underline;font-weight:500}

.lp-frame{display:flex;flex-direction:column}
.lp-frame-reading{gap:12px}
.lp-frame-scripture{gap:8px;padding:16px;border-radius:16px;border:1px solid var(--lp-gold);background:var(--lp-surface)}
.lp-frame-evidence{gap:12px;padding:16px;border-radius:10px;border:1px solid var(--lp-subtle);background:var(--lp-elevated)}
.lp-frame-interactive{gap:16px;padding:16px;border-radius:16px;border:1px solid var(--lp-gold);background:var(--lp-surface)}
.lp-frame-callout{gap:4px;padding:16px;border-radius:10px;border-left:4px solid var(--lp-highlight);background:var(--lp-surface)}
.lp-callout-key{background:var(--lp-elevated)}
.lp-callout-principle{background:var(--lp-elevated);border-top:1px solid var(--lp-gold)}
.lp-card{border-radius:16px;border:1px solid var(--lp-subtle);background:var(--lp-surface);padding:16px}
.lp-card-hover:hover{background:var(--lp-elevated);border-color:var(--lp-gold)}
.lp-divider{height:1px;align-self:stretch;background:var(--lp-divider)}
.lp-divider-gold{background:var(--lp-gold)}
.lp-rule{width:40px;height:2px;background:var(--lp-primary);transform-origin:left center}
.lp-rule-title{width:48px}
@keyframes lp-draw{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
@keyframes lp-rise{from{transform:translateY(4px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes lp-sheet{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes lp-spin{to{transform:rotate(360deg)}}
.lp-draw{animation:lp-draw .28s ease-out both .12s}
.lp-rise{animation:lp-rise .24s ease-out both}
.lp-spinner{width:20px;height:20px;border-radius:9999px;border:2px solid var(--lp-border);border-top-color:var(--lp-muted);animation:lp-spin .8s linear infinite}

.lp-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:0 24px;font-family:var(--lp-sans);font-weight:700;font-size:14px;line-height:20px;letter-spacing:.8px;text-transform:uppercase;text-align:center;transition:transform .12s ease,background-color .12s ease,border-color .12s ease}
.lp-btn-lg{min-height:56px}.lp-btn-md{min-height:48px}.lp-btn-sm{min-height:44px;padding:0 16px}
.lp-btn-primary{background:var(--lp-primary);color:var(--lp-on-primary);box-shadow:var(--lp-shadow-glow)}
.lp-btn-primary:hover:not(:disabled){background:var(--lp-primary-pressed)}
.lp-btn-primary:disabled{background:var(--lp-disabled);color:var(--lp-disabled-text);box-shadow:none}
.lp-btn-secondary{border:1px solid var(--lp-gold);background:transparent;color:var(--lp-text)}
.lp-btn-secondary:hover:not(:disabled){background:var(--lp-elevated);border-color:var(--lp-primary)}
.lp-btn-secondary:disabled{border-color:var(--lp-subtle);color:var(--lp-disabled-text)}
.lp-btn:active:not(:disabled){transform:scale(.975)}
.lp-root a.lp-btn{text-decoration:none;color:var(--lp-text)}
.lp-outline-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--lp-gold);background:var(--lp-surface);color:var(--lp-highlight)}
.lp-outline-btn:hover:not(:disabled){background:var(--lp-elevated)}
.lp-chip-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--lp-gold);background:transparent;color:var(--lp-highlight);font-size:14px;line-height:21px;font-weight:600}
.lp-chip-btn:hover{background:var(--lp-elevated)}
.lp-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:10px;background:transparent;color:var(--lp-text);flex-shrink:0}
.lp-icon-btn:hover:not(:disabled){background:var(--lp-surface)}
.lp-icon-btn:disabled{opacity:.9}

.lp-notice{display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:10px;border:1px solid var(--lp-subtle);border-left-width:3px;background:var(--lp-surface)}
.lp-notice-dot{display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border-radius:9999px;border:1.5px solid currentColor;font-size:13px;line-height:16px;font-weight:700}

.lp-track{flex:1;height:4px;border-radius:9999px;background:var(--lp-border);overflow:hidden}
.lp-track-fill{height:100%;border-radius:9999px;background:var(--lp-primary)}
.lp-seg{flex:1;height:4px;border-radius:9999px;background:var(--lp-border)}
.lp-seg-on{background:var(--lp-primary)}

.lp-option{display:flex;align-items:center;gap:16px;width:100%;min-height:60px;padding:16px;border-radius:16px;border:1px solid var(--lp-border);background:var(--lp-surface);text-align:left;transition:transform .12s ease}
.lp-option:active{transform:scale(.99)}
.lp-option:focus-within{outline:2px solid var(--lp-highlight);outline-offset:2px}
.lp-option-emphasised{padding:15px;border-width:2px}
.lp-option-selected{background:var(--lp-elevated);border-color:var(--lp-primary)}
.lp-option-correct{border-color:var(--lp-success)}
.lp-option-incorrect{border-color:var(--lp-error)}
.lp-radio{display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;border-radius:9999px;border:2px solid var(--lp-muted)}
.lp-radio-on{border-color:var(--lp-highlight)}
.lp-radio-dot{width:10px;height:10px;border-radius:9999px;background:var(--lp-highlight)}
.lp-feedback{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:10px;border-left:4px solid var(--lp-warning);background:var(--lp-elevated)}
.lp-feedback-correct{border-left-color:var(--lp-success)}
.lp-mark{display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;border-radius:9999px;border:2px solid currentColor;font-size:14px;line-height:18px;font-weight:700}

.lp-overlay{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;background:var(--lp-scrim)}
.lp-overlay-end{justify-content:flex-end}
.lp-overlay-full{background:var(--lp-background)}
.lp-sheet{display:flex;flex-direction:column;width:100%;max-height:78%;border-top-left-radius:24px;border-top-right-radius:24px;border:1px solid var(--lp-subtle);border-bottom-width:0;background:var(--lp-elevated);animation:lp-sheet .28s ease-out both}
.lp-sheet-handle{width:40px;height:4px;border-radius:2px;background:var(--lp-muted);opacity:.55;margin:8px auto 0}
.lp-sheet-item{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 12px;border-radius:10px;background:transparent}
.lp-sheet-item:hover{background:var(--lp-surface)}

.lp-box{position:relative;width:100%;overflow:hidden;border-radius:16px;background:var(--lp-elevated)}
.lp-box-ready{background:var(--lp-surface)}
.lp-marker{position:absolute;display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin-left:-22px;margin-top:-22px;background:transparent}
.lp-marker-halo{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9999px;background:var(--lp-scrim);transition:transform .2s ease}
.lp-marker-dot{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;border:2px solid var(--lp-on-primary);background:var(--lp-primary);color:var(--lp-on-primary);font-size:13px;line-height:18px;font-weight:700;box-shadow:var(--lp-shadow-card)}
.lp-marker-on .lp-marker-halo{transform:scale(1.12);box-shadow:inset 0 0 0 1.5px var(--lp-highlight)}
.lp-marker-on .lp-marker-dot{border:3px solid var(--lp-on-image);background:var(--lp-highlight)}
.lp-marker-dim{opacity:.8}
.lp-float-label{position:absolute;max-width:55%;padding:4px 10px;border-radius:9999px;border:1px solid var(--lp-gold);background:var(--lp-scrim);color:var(--lp-on-image);font-size:13px;line-height:18px;font-weight:600;pointer-events:none}
.lp-num{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;border-radius:9999px;border:1px solid var(--lp-gold);color:var(--lp-highlight);font-size:13px;line-height:18px;font-weight:700}
.lp-num-on{background:var(--lp-primary);color:var(--lp-on-primary);border-color:var(--lp-primary)}
.lp-chip{display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;background:transparent}
.lp-chip-inner{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;border:1px solid var(--lp-subtle);color:var(--lp-secondary);font-size:14px;line-height:21px;font-weight:500}
.lp-chip-on{border-width:0;background:var(--lp-primary);color:var(--lp-on-primary);font-weight:700}
.lp-round{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:10px;background:transparent;color:var(--lp-secondary);font-size:20px;line-height:26px}
.lp-round:hover:not(:disabled){background:var(--lp-surface)}
.lp-round:disabled{opacity:.35}
.lp-card3d{position:relative;overflow:hidden;border-radius:24px;border:1px solid var(--lp-gold);background:linear-gradient(160deg,var(--lp-elevated),var(--lp-surface) 55%,var(--lp-background));box-shadow:var(--lp-shadow-card)}
.lp-stage3d{position:relative;display:flex;align-items:center;justify-content:center;width:100%;background:var(--lp-background);overflow:hidden}
.lp-scroll{scrollbar-width:thin;scrollbar-color:var(--lp-border) transparent}
.lp-scroll::-webkit-scrollbar{width:6px}
.lp-scroll::-webkit-scrollbar-thumb{background:var(--lp-border);border-radius:3px}
.lp-scroll::-webkit-scrollbar-track{background:transparent}
.lp-hidden-scroll{scrollbar-width:none}
.lp-hidden-scroll::-webkit-scrollbar{display:none}

@media (prefers-reduced-motion: reduce){
.lp-root *{transition:none!important;animation:none!important}
.lp-btn:active,.lp-option:active{transform:none!important}
}
`;
