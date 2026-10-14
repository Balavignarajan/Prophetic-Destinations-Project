import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import type { EvidenceItem, EvidenceScene } from '../types';
import { ContentSection, IdentificationTag } from './content-label';
import { Expandable } from './expandable';
import { ScriptureCard } from './scripture-card';

/** One kingdom's evidence: Bible, interpretation and history in separately labelled sections. */
export function EvidenceCard({ item }: { item: EvidenceItem }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Expandable title={item.title}>
        <IdentificationTag value={item.identification} />
        <ScriptureCard references={item.bible} />
        <ContentSection kind="interpretation">
          <AppText variant="body">{item.interpretation}</AppText>
        </ContentSection>
        <ContentSection kind="historical-context">
          <AppText variant="body">{item.historicalContext}</AppText>
        </ContentSection>
        {item.historicalApplication ? (
          <ContentSection kind="historical-application">
            <AppText variant="body">{item.historicalApplication}</AppText>
          </ContentSection>
        ) : null}
      </Expandable>
    </View>
  );
}

export function EvidenceSceneView({ scene }: { scene: EvidenceScene }) {
  const { spacing } = useTheme();
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
      {scene.items.map((item) => (
        <EvidenceCard key={item.id} item={item} />
      ))}
    </View>
  );
}
