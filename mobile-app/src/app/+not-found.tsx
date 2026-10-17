import { useRouter } from 'expo-router';

import { EmptyState, ScreenContainer } from '@/components/ui';

/** Any link that matches no screen (an old or mistyped deep link). Themed, with a way back to the app. */
export default function NotFound() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <EmptyState
        title="Page not found"
        message="This link does not lead anywhere in the app."
        action={{ label: 'Go to the start', onPress: () => router.replace('/') }}
      />
    </ScreenContainer>
  );
}
