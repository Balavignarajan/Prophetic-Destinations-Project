/**
 * THE colour source of the app. Every colour the UI uses is defined here, once, for BOTH themes.
 *
 * - `palette` holds the raw values. It is the only place in `src/` where a colour literal may appear. To restyle the app
 *   (for example if the client asks for a different gold) change the values here; nothing else needs editing.
 * - `darkColors` and `lightColors` map the palette to the SAME set of semantic tokens (`ColorTokens`): `background`,
 *   `surface`, `primary`, `onPrimary`, `textPrimary`, `textMuted`, ... TypeScript refuses a theme that lacks a token, so the
 *   two themes can never drift apart. Screens and components use tokens only, through `useTheme()`.
 * - This file imports nothing from React Native, so the build-time Expo config (`app.config.js`) can read the same values.
 *
 * Contrast of both themes is checked by `npm run check:theme` (WCAG AA for the text pairings the UI uses, identical token
 * names in both themes, and a scan for stray colour literals). Run it after changing any value.
 *
 * Photographs and illustrations are assets, not UI colours: they are not recoloured by the theme.
 */

export const palette = {
  // --- manager-provided base colours ---
  antiqueGold: '#A3801F',
  deepBlack: '#07090F',
  charcoal: '#131211',

  // --- dark theme: supporting values ---
  goldHighlight: '#C9A23A',
  goldPressed: '#B8922A',
  charcoalRaised: '#1C1A17',
  inkInput: '#0E0F14',
  ivory: '#F3EDE0',
  parchment: '#CBC3B2',
  stone: '#9C9484',
  umber: '#3A3224',
  umberSoft: '#26221B',
  green: '#5FAE7A',
  amber: '#D98A3D',
  red: '#E0726A',
  disabledFill: '#25221E',
  disabledInk: '#7A7366',

  // --- light theme: supporting values (warm ivory and parchment, near-black text, deepened gold for text) ---
  paper: '#F5EFE0',
  paperSurface: '#FBF7EB',
  paperRaised: '#FFFBF2',
  goldInk: '#7A5C0F',
  ink: '#1C1812',
  inkSoft: '#4B4438',
  inkMuted: '#675F51',
  sand: '#CDC1A5',
  sandSoft: '#DDD3BA',
  sandLine: '#E0D6BE',
  sandInput: '#BFB394',
  leaf: '#2E7D4F',
  bronze: '#97580B',
  brick: '#B3392F',
  paperDisabled: '#E4DCC8',
  paperDisabledInk: '#8A826F',
  umberShadow: '#3A2E14',

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

/** The semantic tokens every theme must provide. */
export interface ColorTokens {
  // surfaces
  background: string;
  surface: string;
  surfaceElevated: string;
  inputBackground: string;

  // brand / actions
  /** The gold FILL of the main action, progress and selected states. Same in both themes. */
  primary: string;
  /** Pressed state of the primary fill. */
  primaryPressed: string;
  /** Gold used as TEXT or a key accent line. Lighter in the dark theme, deeper in the light theme, so it stays readable. */
  primaryHighlight: string;
  /** Text and icons placed ON the primary fill. */
  onPrimary: string;

  // text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Text and icons over a PHOTOGRAPH (always light: pictures are dark in both themes). */
  textOnImage: string;

  // lines
  border: string;
  borderSubtle: string;
  /** Hairline in gold, for emphasis (selected cards, ornaments). */
  borderGold: string;
  borderFocused: string;
  inputBorder: string;
  divider: string;

  // status
  success: string;
  warning: string;
  error: string;

  // overlays
  /** Modal backdrops and picture dimming; follows the theme (dark in dark mode, ivory in light mode). */
  overlay: string;
  /** A dark disc behind controls drawn over a photograph (always dark). */
  scrim: string;
  shadow: string;

  // disabled
  disabled: string;
  disabledText: string;

  transparent: string;
}

export type ColorToken = keyof ColorTokens;

export const darkColors: ColorTokens = {
  background: palette.deepBlack,
  surface: palette.charcoal,
  surfaceElevated: palette.charcoalRaised,
  inputBackground: palette.inkInput,

  primary: palette.antiqueGold,
  primaryPressed: palette.goldPressed,
  primaryHighlight: palette.goldHighlight,
  onPrimary: palette.deepBlack,

  textPrimary: palette.ivory,
  textSecondary: palette.parchment,
  textMuted: palette.stone,
  textOnImage: palette.ivory,

  border: palette.umber,
  borderSubtle: palette.umberSoft,
  borderGold: withAlpha(palette.antiqueGold, 0.55),
  borderFocused: palette.antiqueGold,
  inputBorder: palette.umber,
  divider: palette.umberSoft,

  success: palette.green,
  warning: palette.amber,
  error: palette.red,

  overlay: withAlpha(palette.deepBlack, 0.72),
  scrim: withAlpha(palette.deepBlack, 0.45),
  shadow: palette.black,

  disabled: palette.disabledFill,
  disabledText: palette.disabledInk,

  transparent: palette.clear,
};

export const lightColors: ColorTokens = {
  background: palette.paper,
  surface: palette.paperSurface,
  surfaceElevated: palette.paperRaised,
  inputBackground: palette.paperSurface,

  primary: palette.antiqueGold,
  primaryPressed: palette.goldPressed,
  primaryHighlight: palette.goldInk,
  onPrimary: palette.deepBlack,

  textPrimary: palette.ink,
  textSecondary: palette.inkSoft,
  textMuted: palette.inkMuted,
  textOnImage: palette.ivory,

  border: palette.sand,
  borderSubtle: palette.sandSoft,
  borderGold: withAlpha(palette.antiqueGold, 0.7),
  borderFocused: palette.antiqueGold,
  inputBorder: palette.sandInput,
  divider: palette.sandLine,

  success: palette.leaf,
  warning: palette.bronze,
  error: palette.brick,

  overlay: withAlpha(palette.paper, 0.82),
  scrim: withAlpha(palette.deepBlack, 0.45),
  shadow: palette.umberShadow,

  disabled: palette.paperDisabled,
  disabledText: palette.paperDisabledInk,

  transparent: palette.clear,
};

export type ThemeName = 'dark' | 'light';

export const colorSchemes: Record<ThemeName, ColorTokens> = {
  dark: darkColors,
  light: lightColors,
};

/** Gradient stops (tuples, because `LinearGradient` needs at least two). */
export interface GradientTokens {
  /** Fades a picture into the page background, from clear at the top to solid at the bottom. */
  heroScrim: readonly [string, string, string];
  /** Darkens the very top of a picture so the status bar stays legible. */
  heroScrimTop: readonly [string, string];
  /** A soft gold glow behind a title. */
  goldGlow: readonly [string, string];
}

export function createGradients(name: ThemeName): GradientTokens {
  const c = colorSchemes[name];
  const page = name === 'dark' ? palette.deepBlack : palette.paper;
  return {
    heroScrim:
      name === 'dark'
        ? [withAlpha(page, 0), withAlpha(page, 0.6), page]
        : [withAlpha(page, 0), withAlpha(page, 0.8), page],
    heroScrimTop: [withAlpha(palette.deepBlack, name === 'dark' ? 0.75 : 0.55), withAlpha(palette.deepBlack, 0)],
    goldGlow: [withAlpha(c.primary, name === 'dark' ? 0.28 : 0.22), withAlpha(c.primary, 0)],
  };
}
