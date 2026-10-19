import { View } from 'react-native';

import { AppText, SecondaryButton } from '@/components/ui';
import { unreachableHint } from '@/config/api-host';
import { API_BASE_URL } from '@/config/api';
import { useTheme } from '@/theme';

import type { Loaded } from './cached-load';

export function formatSavedAt(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(timestamp).toISOString();
  }
}

/**
 * Shown above content that is a SAVED copy rather than a live answer. Says when it was saved, why, and that it may be out of
 * date or no longer published, and offers a retry.
 */
export function OfflineBanner({ loaded, onRetry }: { loaded: Pick<Loaded<unknown>, 'fetchedAt' | 'reason'>; onRetry: () => void }) {
  const { colors, layout, radius, spacing } = useTheme();
  // Development builds only: say which address was tried, so a stale LAN address is obvious.
  const hint = loaded.reason === 'offline' ? unreachableHint(API_BASE_URL, __DEV__) : null;
  const why = loaded.reason === 'server-problem' ? 'The server had a problem.' : 'You appear to be offline, or the server cannot be reached.';
  return (
    <View
      accessibilityRole="alert"
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: layout.hairline,
        borderColor: colors.warning,
        backgroundColor: colors.surface,
      }}>
      <AppText variant="label" color="warning">
        Saved copy
      </AppText>
      <AppText variant="bodySmall" color="textSecondary">
        {why} You are viewing what was saved on {formatSavedAt(loaded.fetchedAt)}. It may be out of date, and it may no longer be published.
      </AppText>
      {hint ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
      <SecondaryButton label="Try again" onPress={onRetry} />
    </View>
  );
}
