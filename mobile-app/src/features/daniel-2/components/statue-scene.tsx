import { useState } from 'react';
import { View } from 'react-native';

import { AppText, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/theme';

import type { Daniel2Lesson, StatueScene, StatueSectionId } from '../types';
import { ContentSection } from './content-label';
import { ScriptureCard } from './scripture-card';
import { StatueFigure } from './statue-figure';

/** The whole image. The learner inspects it first; the interpretation is revealed only on request. */
export function StatueSceneView({ scene, lesson }: { scene: StatueScene; lesson: Daniel2Lesson }) {
  const { colors, layout, radius, spacing } = useTheme();
  const [selected, setSelected] = useState<StatueSectionId | null>(null);
  const [revealed, setRevealed] = useState(false);
  const section = lesson.statueSections.find((item) => item.id === selected) ?? null;

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
      {scene.paragraphs.map((text, index) => (
        <AppText key={index} variant="body" color="textSecondary">
          {text}
        </AppText>
      ))}
      <AppText variant="bodySmall" color="textMuted">
        {scene.prompt}
      </AppText>

      <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
        <StatueFigure sections={lesson.statueSections} highlight={selected} onSelect={(id) => setSelected((current) => (current === id ? null : id))} />
      </View>

      <View
        accessibilityLiveRegion="polite"
        style={{
          minHeight: 72,
          gap: spacing.xs,
          padding: spacing.md,
          borderRadius: radius.md,
          borderWidth: layout.hairline,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}>
        {section ? (
          <>
            <AppText variant="heading">
              {section.name}: {section.material}
            </AppText>
            <AppText variant="caption" color="textMuted">
              Described in {section.reference.reference}
            </AppText>
          </>
        ) : (
          <AppText variant="bodySmall" color="textMuted">
            Tap the head, chest, belly, legs or feet of the image.
          </AppText>
        )}
      </View>

      <ScriptureCard references={scene.references} />

      {revealed ? (
        <ContentSection kind="interpretation">
          <AppText variant="body">{scene.revealNote}</AppText>
        </ContentSection>
      ) : (
        <SecondaryButton label={scene.revealHeading} onPress={() => setRevealed(true)} />
      )}
    </View>
  );
}
