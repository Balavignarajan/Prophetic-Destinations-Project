import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

type Settled<T> = { key: string; requestId: string; outcome: Exclude<Resource<T>, { status: 'loading' }> };

/**
 * Loads something asynchronously and tells a screen where it stands: loading, success, or error, with `reload` to try again.
 *
 * `key` identifies the request (for example `course:<id>:BEGINNER`): when it changes the previous request is cancelled and a
 * new one starts; `null` means "not ready to load yet". A result that arrives after the screen moved on is ignored.
 *
 * `keepPrevious`: while the SAME request is loaded again (`reload`), the last successful result stays in place instead of
 * turning back into `loading`, so content that is on screen (a lesson being read) is not replaced by a spinner, which would
 * throw away the reader's place. A different `key` always starts from `loading`; the new result replaces the old one when it
 * arrives, and an error replaces it too.
 */
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  options?: { keepPrevious?: boolean },
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
        if (!controller.signal.aborted) setSettled({ key: key ?? '', requestId, outcome: { status: 'success', data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ key: key ?? '', requestId, outcome: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [requestId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const resource: Resource<T> =
    requestId !== null && settled?.requestId === requestId
      ? settled.outcome
      : options?.keepPrevious && key !== null && settled?.key === key && settled.outcome.status === 'success'
        ? settled.outcome
        : { status: 'loading' };
  return [resource, reload];
}
