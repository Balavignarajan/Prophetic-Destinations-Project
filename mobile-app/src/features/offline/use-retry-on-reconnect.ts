import { useEffect, useEffectEvent } from 'react';
import { AppState, Platform } from 'react-native';

import { NetworkError } from '@/api/errors';
import type { Resource } from '@/api/use-resource';
import type { Loaded } from './cached-load';

/** True when a screen is showing a saved copy, or failed only because the server could not be reached: both should retry on reconnect. */
export function isRecoverable(resource: Resource<Loaded<unknown>>): boolean {
  return (resource.status === 'success' && resource.data.source === 'cache') || (resource.status === 'error' && resource.error instanceof NetworkError);
}

/**
 * While `active` (a saved copy is being shown), try again when the app returns to the foreground and, on the web, when the
 * browser reports it is back online. There is no network-status library in the app, so these are the signals available; the
 * "Try again" button covers the rest.
 */
export function useRetryOnReconnect(active: boolean, retry: () => void) {
  const onSignal = useEffectEvent(retry);
  useEffect(() => {
    if (!active) return;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') onSignal();
    });
    const target = Platform.OS === 'web' && typeof window !== 'undefined' ? window : null;
    target?.addEventListener('online', onSignal);
    return () => {
      appState.remove();
      target?.removeEventListener('online', onSignal);
    };
  }, [active]);
}
