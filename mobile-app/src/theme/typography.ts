
/**
 * Typefaces, all bundled through @expo-google-fonts and loaded in the root layout (`src/app/_layout.tsx`):
 *  - `display*`: Cinzel, for cinematic titles and short headings.
 *  - `serif*`: EB Garamond, for Scripture, quotations and editorial text.
 *  - `sans*`: Inter, for body text, buttons, navigation, quizzes, settings and progress.
 *
 * Custom fonts have one family name per weight/style, so `fontWeight` / `fontStyle` do not select a face on their own. `AppText`
 * resolves them with `resolveFontFace` below; code that uses a raw `Text` must pick the family it wants.
 * The family names must match the keys passed to `useFonts` in `src/app/_layout.tsx`.
 */
export const fontFamilies = {
  displayMedium: 'Cinzel_500Medium',
  displaySemiBold: 'Cinzel_600SemiBold',
  displayBold: 'Cinzel_700Bold',
  serif: 'EBGaramond_400Regular',
  serifItalic: 'EBGaramond_400Regular_Italic',
  serifMedium: 'EBGaramond_500Medium',
  serifSemiBold: 'EBGaramond_600SemiBold',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

/**
 * The exact font face for a family + weight + style, so bold and italic text uses the real face instead of a synthesized one.
 * Families that are not Inter or EB Garamond (Cinzel, system fonts) are returned unchanged.
 */
export function resolveFontFace(
  family: string | undefined,
  fontWeight: TextStyle['fontWeight'],
  fontStyle: TextStyle['fontStyle'],
): { fontFamily: string; italicIncluded: boolean } | null {
  const weight = fontWeight === 'bold' ? 700 : fontWeight === 'normal' || fontWeight === undefined ? 400 : Number(fontWeight);
  const w = Number.isFinite(weight) ? weight : 400;
  if (family === fontFamilies.sans || family === fontFamilies.sansMedium || family === fontFamilies.sansSemiBold || family === fontFamilies.sansBold) {
    const face = w >= 700 ? fontFamilies.sansBold : w >= 600 ? fontFamilies.sansSemiBold : w >= 500 ? fontFamilies.sansMedium : family;
    return { fontFamily: face, italicIncluded: false };
  }
  if (family === fontFamilies.serif || family === fontFamilies.serifItalic || family === fontFamilies.serifMedium || family === fontFamilies.serifSemiBold) {
    const face = fontStyle === 'italic' ? fontFamilies.serifItalic : w >= 600 ? fontFamilies.serifSemiBold : w >= 500 ? fontFamilies.serifMedium : family;
    return { fontFamily: face, italicIncluded: face === fontFamilies.serifItalic };
  }
  return null;
}

/** Text variants. Sizes are in points and scale with the user's font-size setting. */
export const typography = {
  /** The app / lesson headline on a hero screen. */
  hero: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: 2,
  },
  /** Display title (Cinzel). */
  title: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: fontFamilies.serif,
    fontSize: 21,
    lineHeight: 30,
    fontStyle: 'italic',
  },
  /** Large section heading (Cinzel). For headings that stand on their own; card titles use `heading`. */
  sectionHeading: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 0.8,
  },
  /** Card and list titles (Cinzel). */
  heading: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 0.6,
  },
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    lineHeight: 25,
  },
  bodySmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  /** Scripture and long-form lesson text (EB Garamond): larger and looser, because the face has a small x-height. */
  scripture: {
    fontFamily: fontFamilies.serif,
    fontSize: 19,
    lineHeight: 30,
  },
  /** Buttons and short uppercase labels. */
  label: {
    fontFamily: fontFamilies.sansBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Small supporting detail; decorative or non-essential information only. */
  caption: {
    fontFamily: fontFamilies.sans,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
