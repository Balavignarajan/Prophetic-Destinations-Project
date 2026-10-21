import { Children, isValidElement, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/theme';

/** A rough width for a button label: uppercase 14 pt bold Inter plus the button's side padding. Deliberately a little generous. */
function estimatedWidth(child: ReactNode, fontScale: number): number {
  if (!isValidElement<{ label?: unknown; size?: unknown }>(child)) return 0;
  const label = typeof child.props.label === 'string' ? child.props.label : '';
  const padding = child.props.size === 'small' ? 32 : 48;
  return Math.ceil(label.length * 10.5 * fontScale) + padding + 8;
}

/**
 * Buttons side by side when they fit, and one above the other when they do not (a narrow phone, or a large font size), so a label is never
 * clipped. The order in the code is the reading order. Each button keeps its own size and label; the last one (the main action) gets a little
 * more of the width unless `equal` is set.
 */
export function ActionRow({ children, equal = false }: { children: ReactNode; equal?: boolean }) {
  const { spacing } = useTheme();
  const { fontScale } = useWindowDimensions();
  const items = Children.toArray(children);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {items.map((child, index) => (
        <View
          key={index}
          style={{ flexGrow: !equal && index === items.length - 1 ? 1.6 : 1, flexShrink: 0, flexBasis: estimatedWidth(child, Math.max(1, fontScale)), maxWidth: '100%' }}>
          {child}
        </View>
      ))}
    </View>
  );
}
