import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, ChevronIcon } from '@/components/ui';
import { useTheme } from '@/theme';

/** A tappable heading that opens and closes its content. Announces its expanded state. */
export function Expandable({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const { colors, layout, radius, spacing } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={{ gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => ({
          minHeight: layout.touchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
        })}>
        <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
          {title}
        </AppText>
        <View style={{ transform: [{ rotate: open ? '90deg' : '-90deg' }] }}>
          <ChevronIcon direction="left" color="primaryHighlight" />
        </View>
      </Pressable>
      {open ? <View style={{ gap: spacing.md }}>{children}</View> : null}
    </View>
  );
}
