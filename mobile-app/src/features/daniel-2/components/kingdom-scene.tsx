import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import type { Daniel2Lesson, KingdomScene } from '../types';
import { ContentSection, IdentificationTag } from './content-label';
import { Expandable } from './expandable';
import { ScriptureCard } from './scripture-card';
import { StatueFigure } from './statue-figure';

/** One part of the image and the kingdom it is read as. The same layout serves every kingdom; only the content differs. */
export function KingdomSceneView({ scene, lesson }: { scene: KingdomScene; lesson: Daniel2Lesson }) {
  const { spacing } = useTheme();
  const section = lesson.statueSections.find((item) => item.id === scene.sectionId);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
        <StatueFigure sections={lesson.statueSections} highlight={scene.sectionId} scale={0.42} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label" color="primaryHighlight">
            {scene.eyebrow}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {scene.title}
          </AppText>
          {section ? (
            <AppText variant="bodySmall" color="textMuted">
              {section.name}, {section.material.toLowerCase()}
            </AppText>
          ) : null}
        </View>
      </View>

      <ScriptureCard references={scene.references} summary={scene.scriptureSummary} />

      <ContentSection kind="interpretation">
        <AppText variant="heading" color="primaryHighlight">
          Read as: {scene.kingdom}
        </AppText>
        <IdentificationTag value={scene.identification} />
        <AppText variant="bodySmall" color="textSecondary">
          {scene.identificationNote}
        </AppText>
        <AppText variant="body">{scene.explanation}</AppText>
      </ContentSection>

      {scene.period ? (
        <AppText variant="bodySmall" color="textSecondary" accessibilityLabel={`Approximate period: ${scene.period}`}>
          <AppText variant="bodySmall" color="textMuted" style={{ fontWeight: '700' }}>
            Approximate period:{' '}
          </AppText>
          {scene.period}
        </AppText>
      ) : null}

      <Expandable title="Historical context">
        <ContentSection kind="historical-context">
          <AppText variant="body">{scene.historicalContext}</AppText>
        </ContentSection>
        {scene.historicalApplication ? (
          <ContentSection kind="historical-application">
            <AppText variant="body">{scene.historicalApplication}</AppText>
          </ContentSection>
        ) : null}
      </Expandable>
    </View>
  );
}
