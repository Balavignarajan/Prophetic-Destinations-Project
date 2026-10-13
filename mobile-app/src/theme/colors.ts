/**
 * THE colour source of the app. Every colour the UI uses is defined here, once.
 *
 * - `palette` holds the raw values. It is the ONLY place in `src/` (besides this file's helpers) where a colour
 *   literal may appear. To restyle the whole app (for example if the client asks for a different gold), change the
 *   values here; nothing else needs editing.
 * - `colors` maps the palette to SEMANTIC tokens (`background`, `primary`, `textMuted`, ...). Screens and components
 *   use only these tokens, through `useTheme()`.
 * - This file imports nothing from React Native, so the build-time Expo config (`app.config.ts`, for the splash screen
 *   and the native background colour) can read the very same values.
 *
 * Contrast is checked by `npm run check:theme` (WCAG AA for the text pairings the UI uses, plus a scan for stray
 * colour literals). Run it after changing any value.
 *
 * Photographs and illustrations are assets, not UI colours: they are not recoloured by the theme.
 */

/** Manager-provided base colours first, then the supporting values chosen to sit with them on a dark UI. */
export const palette = {
  // --- manager-provided ---
  antiqueGold: '#A3801F',
  deepBlack: '#07090F',
  charcoal: '#131211',
  // --- supporting: gold family ---
  goldHighlight: '#C9A23A',
  goldPressed: '#B8922A',
  // --- supporting: surfaces (warm, close to charcoal) ---
  charcoalRaised: '#1C1A17',
  inkInput: '#0E0F14',
  // --- supporting: text (ivory, never pure white) ---
  ivory: '#F3EDE0',
  parchment: '#CBC3B2',
  stone: '#9C9484',
  // --- supporting: lines ---
  umber: '#3A3224',
  umberSoft: '#26221B',
  // --- supporting: status (muted so they do not fight the gold) ---
  green: '#5FAE7A',
  amber: '#D98A3D',
  red: '#E0726A',
  // --- supporting: disabled ---
  disabledFill: '#25221E',
  disabledInk: '#7A7366',
  // --- structural ---
  black: '#000000',
  clear: 'rgba(0, 0, 0, 0)',
} as const;

/** `#rrggbb` + an opacity from 0 to 1 -> `rgba(r, g, b, a)`. Used to derive overlays from palette colours. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const colors = {
  // surfaces
  background: palette.deepBlack,
  surface: palette.charcoal,
  surfaceElevated: palette.charcoalRaised,
  inputBackground: palette.inkInput,

  // brand / actions
  primary: palette.antiqueGold,
  primaryPressed: palette.goldPressed,
  primaryHighlight: palette.goldHighlight,
  /** Text and icons placed ON the primary colour (dark on gold: 5.4:1). */
  onPrimary: palette.deepBlack,

  // text
  textPrimary: palette.ivory,
  textSecondary: palette.parchment,
  textMuted: palette.stone,
  /** Text on a photograph or a gradient. */
  textOnImage: palette.ivory,

  // lines
  border: palette.umber,
  borderSubtle: palette.umberSoft,
  /** Hairline in gold, for emphasis (selected cards, ornaments). */
  borderGold: withAlpha(palette.antiqueGold, 0.55),
  borderFocused: palette.antiqueGold,
  inputBorder: palette.umber,
  divider: palette.umberSoft,

  // status
  success: palette.green,
  warning: palette.amber,
  error: palette.red,

  // overlays
  overlay: withAlpha(palette.deepBlack, 0.72),
  scrim: withAlpha(palette.deepBlack, 0.45),
  shadow: palette.black,

  // disabled
  disabled: palette.disabledFill,
  disabledText: palette.disabledInk,

  transparent: palette.clear,
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Gradient stops for darkening an image from clear to the app background. Typed as tuples because
 * `LinearGradient` requires at least two stops.
 */
export const gradients = {
  heroScrim: [
    withAlpha(palette.deepBlack, 0),
    withAlpha(palette.deepBlack, 0.6),
    palette.deepBlack,
  ] as const,
  heroScrimTop: [withAlpha(palette.deepBlack, 0.75), withAlpha(palette.deepBlack, 0)] as const,
  goldGlow: [withAlpha(palette.antiqueGold, 0.28), withAlpha(palette.antiqueGold, 0)] as const,
} as const;
