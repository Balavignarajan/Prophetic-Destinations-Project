import { Platform, type TextStyle } from 'react-native';

/**
 * Typefaces. `display` is Cinzel (bundled through @expo-google-fonts and loaded in the root layout): a classical,
 * inscriptional capital face for titles. `serif` is the platform's own serif, intended for Scripture and lesson prose
 * when that content arrives. `sans` is the platform UI font for explanations and controls.
 *
 * The names of the Cinzel faces must match the keys passed to `useFonts` in `src/app/_layout.tsx`.
 */
export const fontFamilies = {
  displayMedium: 'Cinzel_500Medium',
  displaySemiBold: 'Cinzel_600SemiBold',
  displayBold: 'Cinzel_700Bold',
  serif: Platform.select({ ios: 'ui-serif', default: 'serif' }) ?? 'serif',
  sans: Platform.select({ ios: 'system-ui', default: 'sans-serif' }) ?? 'sans-serif',
} as const;

/** Text variants. Sizes are in points and scale with the user's font-size setting. */
export const typography = {
  /** The app / lesson headline on a hero screen. */
  hero: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: 2,
  },
  title: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontFamily: fontFamilies.serif,
    fontSize: 20,
    lineHeight: 28,
    fontStyle: 'italic',
  },
  heading: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: 1,
  },
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  /** Scripture and long-form lesson text: the serif face, slightly larger and looser. */
  scripture: {
    fontFamily: fontFamilies.serif,
    fontSize: 18,
    lineHeight: 28,
  },
  /** Buttons and small uppercase labels. */
  label: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  caption: {
    fontFamily: fontFamilies.sans,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
