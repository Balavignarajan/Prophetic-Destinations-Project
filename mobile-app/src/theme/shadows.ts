import { Platform, type ViewStyle } from 'react-native';

import { colors } from './colors';

/**
 * Elevation presets. On a dark UI shadows are subtle, so depth also comes from the `surfaceElevated` colour and
 * borders; these add a little lift where it helps (cards, the primary button's glow).
 */
export const shadows = {
  none: {} as ViewStyle,
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.shadow,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    default: { elevation: 6, shadowColor: colors.shadow },
  }) as ViewStyle,
  glow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 4 },
    },
    default: { elevation: 8, shadowColor: colors.primary },
  }) as ViewStyle,
} as const;
