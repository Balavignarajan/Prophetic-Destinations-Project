import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import { NATIVE_DRIVER, motion } from '@/theme/motion';

import { ChevronIcon } from './chevron-icon';

/**
 * A chevron that points down when closed and up when open, turning smoothly between the two. Decorative: the control's own accessibility state
 * ("expanded") says whether it is open. With Reduce Motion on it flips at once.
 */
export function TurnChevron({ open, size }: { open: boolean; size?: number }) {
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      turn.setValue(open ? 1 : 0);
      return;
    }
    const animation = Animated.timing(turn, { toValue: open ? 1 : 0, duration: motion.duration.selection, easing: motion.easing.standard, useNativeDriver: NATIVE_DRIVER });
    animation.start();
    return () => animation.stop();
  }, [open, reduce, turn]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '-90deg'] }) }] }}>
        <ChevronIcon direction="right" color="primaryHighlight" size={size} />
      </Animated.View>
    </View>
  );
}
