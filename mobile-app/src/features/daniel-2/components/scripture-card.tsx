import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import type { ScriptureRef } from '../types';
import { ContentSection } from './content-label';

/**
 * The Bible references for a scene. Verse wording is shown only when an approved text was supplied (`text` + `attribution`);
 * otherwise the reference is shown with a plain note. Nothing is quoted from memory.
 */
export function ScriptureCard({ references, summary }: { references: ScriptureRef[]; summary?: string }) {
  const { spacing } = useTheme();
  return (
    <ContentSection kind="scripture">
      {summary ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color="textMuted">
            What the passage describes (a summary, not a quotation)
          </AppText>
          <AppText variant="body">{summary}</AppText>
        </View>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        {references.map((ref) => (
          <View key={ref.reference} style={{ gap: spacing.xxs }} accessible accessibilityLabel={`${ref.reference}${ref.text ? `. ${ref.text}` : '. Verse text not included.'}`}>
            <AppText variant="heading" color="primaryHighlight">
              {ref.reference}
            </AppText>
            {ref.text ? (
              <>
                <AppText variant="scripture">{ref.text}</AppText>
                {ref.attribution ? (
                  <AppText variant="caption" color="textMuted">
                    {ref.attribution}
                  </AppText>
                ) : null}
              </>
            ) : (
              <AppText variant="caption" color="textMuted">
                Verse text is not included in the app yet. Read {ref.reference} in your own Bible.
              </AppText>
            )}
          </View>
        ))}
      </View>
    </ContentSection>
  );
}
