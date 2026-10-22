import { useState } from 'react';
import { View } from 'react-native';

import { BlockNotice, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/theme';

import { useLearningProgress } from './learning-provider';
import type { SessionStatus } from './progress-session';

/** True when the saved progress could not be read: then the empty progress on screen is NOT "nothing yet" and must not be presented as such. */
export const isProgressUnavailable = (status: SessionStatus): boolean => status === 'unreadable' || status === 'invalid';

/**
 * The one place that tells the learner the saved progress is not in a normal state, with a way to retry:
 *  - the saved progress could not be read (storage error, or damaged data). It has not been changed or erased, and nothing is saved until it is read;
 *  - the latest progress could not be stored. It is kept and written again on "Try saving again" or with the next change.
 * Shows nothing otherwise (including while the first read is still running). Quiet by design: an inline notice, never an alert, so scrolling a lesson
 * cannot produce a stream of pop-ups, and there is only ever one of these on a screen.
 */
export function ProgressStatusNotice() {
  const { spacing } = useTheme();
  const { status, saveFailed, retrying, retryLoad, retrySave } = useLearningProgress();
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    void action().finally(() => setBusy(false));
  };

  if (status === 'unreadable' || status === 'invalid') {
    const trying = busy || retrying;
    return (
      <View style={{ gap: spacing.md }}>
        <BlockNotice
          title={status === 'unreadable' ? "Your saved progress couldn't be loaded" : "Your saved progress couldn't be read"}
          message={
            status === 'unreadable'
              ? "Your progress on this device has not been changed, but it can't be read right now. Until it loads, new progress won't be saved. Please try again."
              : "The progress stored on this device looks damaged. It has not been changed or erased, and new progress won't be saved until this is resolved. You can try again, or erase it in Settings."
          }
        />
        <SecondaryButton size="medium" label={trying ? 'Trying again…' : 'Try again'} disabled={trying} onPress={() => run(retryLoad)} />
      </View>
    );
  }

  if (saveFailed) {
    return (
      <View style={{ gap: spacing.md }}>
        <BlockNotice title="Your latest progress couldn't be saved" message="Please try again." />
        <SecondaryButton size="medium" label={busy ? 'Saving…' : 'Try saving again'} disabled={busy} onPress={() => run(retrySave)} />
      </View>
    );
  }

  return null;
}
