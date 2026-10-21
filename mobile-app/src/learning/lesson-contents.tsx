import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/accessibility/use-reduce-motion';
import type { LessonSnapshotBlock } from '@/api/types';
import { AppText, IconButton } from '@/components/ui';
import { useTheme } from '@/theme';

export type LessonSection = { blockId: string; title: string };

/** The lesson's sections, in published order, taken from its SECTION_INTRO blocks that have a title. Nothing is invented. */
export function lessonSections(blocks: LessonSnapshotBlock[]): LessonSection[] {
  return [...blocks]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((block) => block.type === 'SECTION_INTRO' && typeof block.content.title === 'string' && block.content.title.trim().length > 0)
    .map((block) => ({ blockId: block.blockId, title: (block.content.title as string).trim() }));
}

/** A contents list is only offered when it helps: at least two titled sections. */
export const MIN_SECTIONS_FOR_CONTENTS = 2;

/** A sheet listing the lesson's sections. Choosing one calls `onSelect`; the sheet has a visible close button and closes on the back gesture. */
export function LessonContents({
  visible,
  sections,
  onSelect,
  onClose,
}: {
  visible: boolean;
  sections: LessonSection[];
  onSelect: (blockId: string) => void;
  onClose: () => void;
}) {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.fill, { backgroundColor: colors.overlay }]}>
        <Pressable accessible={false} onPress={onClose} style={styles.fill} />
        <View
          accessibilityViewIsModal
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: layout.maxContentWidth,
            maxHeight: '75%',
            paddingBottom: insets.bottom + spacing.lg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderWidth: layout.hairline,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surfaceElevated,
          }}>
          <View style={[styles.head, { paddingLeft: spacing.xl, paddingRight: spacing.sm, paddingTop: spacing.sm }]}>
            <AppText variant="heading" accessibilityRole="header" style={styles.fill}>
              Contents
            </AppText>
            <IconButton accessibilityLabel="Close contents" tone="ghost" onPress={onClose}>
              <AppText variant="heading" color="textSecondary">
                ✕
              </AppText>
            </IconButton>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs }}>
            {sections.map((section, index) => (
              <Pressable
                key={section.blockId}
                accessibilityRole="button"
                accessibilityLabel={`Section ${index + 1} of ${sections.length}: ${section.title}`}
                onPress={() => onSelect(section.blockId)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    minHeight: layout.touchTarget + spacing.xs,
                    gap: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: pressed ? colors.surface : colors.transparent,
                  },
                ]}>
                <AppText variant="bodySmall" color="primaryHighlight" style={styles.number}>
                  {index + 1}
                </AppText>
                <AppText variant="body" style={styles.fill}>
                  {section.title}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  number: { minWidth: 24, fontWeight: '700' },
});
