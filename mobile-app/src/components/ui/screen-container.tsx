import type { ReactNode, Ref } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export type ScreenContainerProps = {
  children: ReactNode;
  /** Which edges keep clear of the notch / status bar / home indicator. Default: both. */
  safeEdges?: readonly ('top' | 'bottom')[];
  /** Horizontal screen padding. Default: true. */
  padded?: boolean;
  /** Scroll the content (for text that may outgrow a small phone). */
  scroll?: boolean;
  /** No background of its own, so a picture rendered behind the screen (HeroBackdrop) shows through. */
  transparent?: boolean;
  style?: StyleProp<ViewStyle>;
  /** For screens that remember or restore the scroll position (the lesson reader). Only used with `scroll`. */
  scrollRef?: Ref<ScrollView>;
  scrollEvents?: Pick<ScrollViewProps, 'onScroll' | 'onScrollEndDrag' | 'onMomentumScrollEnd' | 'onContentSizeChange' | 'scrollEventThrottle'>;
};

/**
 * The base of every screen: themed background, safe-area insets, consistent padding, and a content column that
 * stays readable on tablets (centred, at most `layout.maxContentWidth` wide).
 */
export function ScreenContainer({
  children,
  safeEdges = ['top', 'bottom'],
  padded = true,
  scroll = false,
  transparent = false,
  style,
  scrollRef,
  scrollEvents,
}: ScreenContainerProps) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const frame: ViewStyle = {
    paddingTop: safeEdges.includes('top') ? insets.top : 0,
    paddingBottom: safeEdges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };
  const column: ViewStyle = {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: padded ? layout.screenPadding : 0,
  };

  if (scroll) {
    return (
      <View style={[styles.fill, transparent ? null : { backgroundColor: colors.background }, frame]}>
        <ScrollView
          ref={scrollRef}
          {...scrollEvents}
          contentContainerStyle={[styles.scrollContent, column, style]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={[styles.fill, transparent ? null : { backgroundColor: colors.background }, frame]}>
      <View style={[styles.fill, column, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
