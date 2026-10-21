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
  antiqueGold: '#A3801F', // light theme primary
  deepBlack: '#07090F', // text on gold, scrims

  // --- dark theme: manager-approved cinematic palette (exact values) ---
  navyBlack: '#07090F', // primary background
  navyDeep: '#0D1117', // secondary background
  navyCard: '#131825', // card surface
  navyRaised: '#1A2235', // raised surface
  gold: '#D4AF37', // primary gold
  goldBright: '#F5C842', // bright gold
  goldDark: '#8B6914', // dark gold
  textWarm: '#E8E0D0', // primary text
  textBright: '#F0E8D0', // bright text
  textMutedBlue: '#8A9BB0', // muted text
  // metallic gradient stops
  metalDark: '#B8860B',
  metalBright: '#FFD700',
  metalMid: '#DAA520',
  // kingdoms (dark theme statue / timeline materials)
  kingdomBabylon: '#D4AF37',
  kingdomMedoPersia: '#C0C8D8',
  kingdomGreece: '#B87333',
  kingdomRome: '#9CA3AF',
  kingdomClay: '#A0826D',
  kingdomStone: '#A5B4C8',

  // --- dark theme: supporting values (not part of the approved list; derived to sit with the navy surfaces) ---
  goldPressed: '#B8922A',
  textSoftBlue: '#B4BFCE', // secondary text, between primary and muted
  navyLine: '#2A344B',
  navyLineSoft: '#1F283B',
  navyDisabled: '#222B3F',
  navyDisabledInk: '#7585A0',
  green: '#5FAE7A',
  amber: '#D98A3D',
  red: '#E0726A',

  // --- light theme: supporting values (unchanged: warm ivory and parchment, near-black text, deepened gold for text) ---
  ivory: '#F3EDE0', // text over photographs in the light theme
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

  // --- illustration materials (the Daniel 2 image: same in both themes, always outlined so they read on either background) ---
  materialGold: '#C9A23A',
  materialSilver: '#B9BDC4',
  materialBronze: '#A8683A',
  materialIron: '#6B7078',
  materialClay: '#A4694A',
  materialStone: '#8E8A80',

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
  /** Brightest text: titles that need extra emphasis on dark surfaces. In the light theme it equals `textPrimary`. */
  textBright: string;
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

  /** Fills for the sections of the statue illustration. Decorative; the section's name is always given in text too. */
  materialGold: string;
  materialSilver: string;
  materialBronze: string;
  materialIron: string;
  materialClay: string;
  materialStone: string;

  transparent: string;
}

export type ColorToken = keyof ColorTokens;

export const darkColors: ColorTokens = {
  background: palette.navyBlack,
  surface: palette.navyCard,
  surfaceElevated: palette.navyRaised,
  inputBackground: palette.navyDeep,

  primary: palette.gold,
  primaryPressed: palette.goldPressed,
  primaryHighlight: palette.goldBright,
  onPrimary: palette.navyBlack,

  textPrimary: palette.textWarm,
  textBright: palette.textBright,
  textSecondary: palette.textSoftBlue,
  textMuted: palette.textMutedBlue,
  textOnImage: palette.textBright,

  border: palette.navyLine,
  borderSubtle: palette.navyLineSoft,
  borderGold: withAlpha(palette.gold, 0.55),
  borderFocused: palette.gold,
  inputBorder: palette.navyLine,
  divider: palette.navyLineSoft,

  success: palette.green,
  warning: palette.amber,
  error: palette.red,

  overlay: withAlpha(palette.navyBlack, 0.72),
  scrim: withAlpha(palette.deepBlack, 0.45),
  shadow: palette.black,

  disabled: palette.navyDisabled,
  disabledText: palette.navyDisabledInk,

  materialGold: palette.kingdomBabylon,
  materialSilver: palette.kingdomMedoPersia,
  materialBronze: palette.kingdomGreece,
  materialIron: palette.kingdomRome,
  materialClay: palette.kingdomClay,
  materialStone: palette.kingdomStone,

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
  textBright: palette.ink,
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

  materialGold: palette.materialGold,
  materialSilver: palette.materialSilver,
  materialBronze: palette.materialBronze,
  materialIron: palette.materialIron,
  materialClay: palette.materialClay,
  materialStone: palette.materialStone,

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
  /** Polished-gold metallic sweep (dark gold, bright gold, goldenrod). Same in both themes; use sparingly (emphasis, not every surface). */
  metallicGold: readonly [string, string, string];
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
    metallicGold: [palette.metalDark, palette.metalBright, palette.metalMid],
    goldGlow: [withAlpha(c.primary, name === 'dark' ? 0.28 : 0.22), withAlpha(c.primary, 0)],
  };
}
