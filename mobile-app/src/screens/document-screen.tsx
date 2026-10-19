import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';

import { AppText, EmptyState, PrimaryButton, ScreenContainer, ScreenHeader } from '@/components/ui';
import { type DocumentKind, resolveDocument } from '@/content/documents';
import { useTheme } from '@/theme';

// Expo inlines EXPO_PUBLIC_* values only when they are written out like this.
const ONLINE_COPIES = {
  about: process.env.EXPO_PUBLIC_ABOUT_URL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL,
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
};

/**
 * About, Privacy Policy or Terms. Shows the approved bundled text when there is some, an online copy when one is configured, and
 * otherwise says honestly that the text has not been provided yet. It never shows placeholder legal wording.
 */
export function DocumentScreen({ kind }: { kind: DocumentKind }) {
  const { spacing } = useTheme();
  const doc = resolveDocument(kind, ONLINE_COPIES);

  return (
    <ScreenContainer scroll>
      <ScreenHeader title={doc.title} />
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
        {doc.content
          ? doc.content.sections.map((section, index) => (
              <View key={index} style={{ gap: spacing.md }}>
                {section.heading ? (
                  <AppText variant="heading" accessibilityRole="header">
                    {section.heading}
                  </AppText>
                ) : null}
                {section.paragraphs.map((paragraph, i) => (
                  <AppText key={i} variant="body" color="textSecondary">
                    {paragraph}
                  </AppText>
                ))}
              </View>
            ))
          : null}

        {doc.missing ? (
          <EmptyState title="Not available yet" message={`The ${doc.title.toLowerCase()} has not been provided yet. It will appear here once it is available.`} />
        ) : null}

        {doc.onlineUrl ? <PrimaryButton label="Read online" onPress={() => void WebBrowser.openBrowserAsync(doc.onlineUrl as string)} /> : null}
      </View>
    </ScreenContainer>
  );
}
