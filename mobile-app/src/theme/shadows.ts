import { Platform, type ViewStyle } from 'react-native';

import type { ColorTokens } from './colors';

export interface ShadowTokens {
  none: ViewStyle;
  card: ViewStyle;
  glow: ViewStyle;
}

/**
 * Elevation presets, built from the active theme's colours. On a dark UI shadows are subtle, so depth also comes from the
 * `surfaceElevated` colour and borders; in the light theme they are kept soft and warm. `glow` is the primary button's lift.
 */
export function createShadows(colors: ColorTokens, isDark: boolean): ShadowTokens {
  return {
    none: {},
    card: Platform.select<ViewStyle>({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: isDark ? 0.36 : 0.14,
        shadowRadius: isDark ? 12 : 10,
        shadowOffset: { width: 0, height: isDark ? 5 : 4 },
      },
      default: { elevation: isDark ? 3 : 2, shadowColor: colors.shadow },
    }) as ViewStyle,
    glow: Platform.select<ViewStyle>({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: isDark ? 0.24 : 0.22,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      default: { elevation: isDark ? 4 : 3, shadowColor: colors.primary },
    }) as ViewStyle,
  };
}
