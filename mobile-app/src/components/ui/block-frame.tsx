import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type BlockFrameVariant = 'reading' | 'scripture' | 'evidence' | 'interactive' | 'callout';

export type BlockFrameProps = Omit<ViewProps, 'style' | 'children'> & {
  children: ReactNode;
  /**
   * - `reading`: plain flowing content, no box.
   * - `scripture`: calm card with a thin gold edge.
   * - `evidence`: documentary look, raised surface with a quiet border.
   * - `interactive`: roomy card for controls the learner touches.
   * - `callout`: a note set apart by a gold bar on its leading edge.
   */
  variant?: BlockFrameVariant;
  style?: StyleProp<ViewStyle>;
};

/**
 * The shared container of a lesson block. It only provides spacing, surface and an accent; the block keeps its own content,
 * data handling and accessibility props (any View prop, such as `accessible` or `accessibilityLabel`, is passed through).
 */
export function BlockFrame({ children, variant = 'reading', style, ...rest }: BlockFrameProps) {
  const { colors, layout, radius, spacing } = useTheme();
  const box: Record<BlockFrameVariant, ViewStyle> = {
    reading: { gap: spacing.md },
    scripture: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: layout.hairline,
      borderColor: colors.borderGold,
      backgroundColor: colors.surface,
    },
    evidence: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      borderWidth: layout.hairline,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surfaceElevated,
    },
    interactive: {
      gap: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: layout.hairline,
      borderColor: colors.borderGold,
      backgroundColor: colors.surface,
    },
    callout: {
      gap: spacing.xs,
      padding: spacing.lg,
      borderRadius: radius.md,
      borderLeftWidth: 4,
      borderLeftColor: colors.primaryHighlight,
      backgroundColor: colors.surface,
    },
  };
  return (
    <View style={[box[variant], style]} {...rest}>
      {children}
    </View>
  );
}
