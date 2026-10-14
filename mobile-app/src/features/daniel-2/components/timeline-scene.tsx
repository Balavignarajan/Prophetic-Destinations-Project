import { View } from 'react-native';

import { AppText, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/theme';

import type { Daniel2Lesson, SceneId, TimelineScene } from '../types';
import { IdentificationTag } from './content-label';
import { materialColor } from './statue-figure';

/** The six phases in order, as a vertical timeline. Each entry opens its own scene. */
export function TimelineSceneView({ scene, lesson, onOpenScene }: { scene: TimelineScene; lesson: Daniel2Lesson; onOpenScene: (id: SceneId) => void }) {
  const { colors, layout, radius, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="primaryHighlight">
          {scene.eyebrow}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {scene.title}
        </AppText>
      </View>
      <AppText variant="bodySmall" color="textSecondary">
        {scene.intro}
      </AppText>

      <View accessibilityRole="list">
        {lesson.timeline.map((entry, index) => {
          const last = index === lesson.timeline.length - 1;
          return (
            <View key={entry.id} accessibilityRole="none" style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ alignItems: 'center', width: 20 }}>
                <View
                  style={{
                    marginTop: spacing.lg,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: materialColor(colors, entry.materialKey),
                    borderWidth: 2,
                    borderColor: colors.primaryHighlight,
                  }}
                />
                {!last ? <View style={{ flex: 1, width: 2, backgroundColor: colors.borderGold }} /> : null}
              </View>
              <View
                style={{
                  flex: 1,
                  gap: spacing.sm,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: layout.hairline,
                  borderColor: colors.borderSubtle,
                  backgroundColor: colors.surface,
                }}>
                <AppText variant="caption" color="textMuted">
                  {index + 1} of {lesson.timeline.length}
                </AppText>
                <AppText variant="heading" accessibilityRole="header">
                  {entry.phase}
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  {entry.material}
                </AppText>
                <AppText variant="bodySmall" color="primaryHighlight" style={{ fontWeight: '700' }}>
                  {entry.dateRange ?? 'No dates are given for this phase'}
                </AppText>
                <IdentificationTag value={entry.identification} />
                <AppText variant="bodySmall">{entry.summary}</AppText>
                <AppText variant="caption" color="textMuted">
                  {entry.references.map((ref) => ref.reference).join(' · ')}
                </AppText>
                <SecondaryButton label="Open scene" onPress={() => onOpenScene(entry.sceneId)} style={{ minHeight: layout.touchTarget }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
