import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

type Settled<T> = { requestId: string; outcome: Exclude<Resource<T>, { status: 'loading' }> };

/**
 * Loads something asynchronously and tells a screen where it stands: loading, success, or error, with `reload` to try again.
 *
 * `key` identifies the request (for example `course:<id>:BEGINNER`): when it changes the previous request is cancelled and a
 * new one starts; `null` means "not ready to load yet". A result that arrives after the screen moved on is ignored.
 */
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): [Resource<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent((signal: AbortSignal) => load(signal));
  const requestId = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    if (requestId === null) return;
    const controller = new AbortController();
    run(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ requestId, outcome: { status: 'success', data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ requestId, outcome: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [requestId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const resource: Resource<T> =
    requestId !== null && settled?.requestId === requestId ? settled.outcome : { status: 'loading' };
  return [resource, reload];
}
