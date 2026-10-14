import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import type { IntroScene, NarrativeScene } from '../types';
import { ContentSection } from './content-label';
import { SceneImage } from './scene-image';
import { ScriptureCard } from './scripture-card';

export function IntroSceneView({ scene }: { scene: IntroScene }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <SceneImage imageKey={scene.image} height={220} />
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color="primaryHighlight" align="center">
          {scene.eyebrow}
        </AppText>
        <AppText variant="hero" align="center" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {scene.title}
        </AppText>
        <AppText variant="subtitle" color="primaryHighlight" align="center">
          {scene.subtitle}
        </AppText>
      </View>
      {scene.paragraphs.map((text, index) => (
        <AppText key={index} variant="body" color="textSecondary" align="center">
          {text}
        </AppText>
      ))}
    </View>
  );
}

export function NarrativeSceneView({ scene }: { scene: NarrativeScene }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <SceneImage imageKey={scene.image} />
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
      <ScriptureCard references={scene.references} />
      {scene.interpretationNote ? (
        <ContentSection kind="interpretation">
          <AppText variant="body">{scene.interpretationNote}</AppText>
        </ContentSection>
      ) : null}
    </View>
  );
}
