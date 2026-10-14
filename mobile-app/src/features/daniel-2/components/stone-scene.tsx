import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import type { Daniel2Lesson, StoneScene } from '../types';
import { ContentSection } from './content-label';
import { SceneImage } from './scene-image';
import { ScriptureCard } from './scripture-card';
import { Mountain, StatueFigure } from './statue-figure';

/** Both stone scenes: the impact on the feet, and the meaning of the stone. Interpretation is labelled as such. */
export function StoneSceneView({ scene, lesson }: { scene: StoneScene; lesson: Daniel2Lesson }) {
  const { spacing } = useTheme();
  const impact = scene.mode === 'impact';
  return (
    <View style={{ gap: spacing.lg }}>
      <SceneImage imageKey={scene.image} height={150} />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="primaryHighlight">
          {scene.eyebrow}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {scene.title}
        </AppText>
      </View>

      <View
        accessible
        accessibilityLabel={
          impact
            ? 'Illustration: the whole image, with the stone striking its feet'
            : 'Illustration: a stone and the mountain it becomes'
        }
        style={{ alignItems: 'center', paddingVertical: spacing.md }}>
        {impact ? (
          <StatueFigure sections={lesson.statueSections} highlight="feet" showStone scale={0.8} />
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Mountain size={110} />
          </View>
        )}
      </View>

      <ScriptureCard references={scene.references} summary={scene.scriptureSummary} />

      <ContentSection kind="interpretation">
        {scene.interpretation.map((text, index) => (
          <AppText key={index} variant="body">
            {text}
          </AppText>
        ))}
      </ContentSection>

      {scene.perspectivesNote ? (
        <ContentSection kind="historical-application">
          <AppText variant="caption" color="textMuted">
            Where readers differ
          </AppText>
          <AppText variant="bodySmall" color="textSecondary">
            {scene.perspectivesNote}
          </AppText>
        </ContentSection>
      ) : null}
    </View>
  );
}
