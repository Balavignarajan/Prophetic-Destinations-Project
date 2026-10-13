/** The spacing scale. Use these instead of raw numbers for padding, margins and gaps. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Layout constants shared by screens and controls. */
export const layout = {
  /** Horizontal padding of a screen. */
  screenPadding: spacing.xl,
  /** Content never gets wider than this, so tablets and landscape stay readable. */
  maxContentWidth: 560,
  /** Recommended minimum touch target (Apple 44pt, Material 48dp); controls use 48. */
  touchTarget: 48,
  minTouchTarget: 44,
  buttonHeight: 56,
  hairline: 1,
} as const;
