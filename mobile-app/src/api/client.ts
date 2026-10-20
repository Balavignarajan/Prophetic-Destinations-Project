import { API_BASE_URL } from '@/config/api';

import { ApiError, ConfigurationError, NetworkError } from './errors';

const REQUEST_TIMEOUT_MS = 15_000;

type Query = Record<string, string>;

/**
 * Sends one request to the backend's public API and returns its parsed JSON.
 *
 * - The base URL is `EXPO_PUBLIC_API_URL` (see src/config/api.ts).
 * - A request that outlives `REQUEST_TIMEOUT_MS`, or that cannot reach the server, becomes a `NetworkError`.
 * - A non-2xx answer becomes an `ApiError` carrying the backend's own `code`, `message` and `details` (its error body is
 *   `{ statusCode, code, message, details?, requestId }`).
 * - Passing an `AbortSignal` cancels the request (used when a screen goes away or the level changes).
 */
async function send<T>(method: 'GET' | 'POST', path: string, query: Query | undefined, body: unknown, signal?: AbortSignal): Promise<T> {
  if (API_BASE_URL === null) throw new ConfigurationError();
  const search = query ? `?${new URLSearchParams(query).toString()}` : '';
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${search}`, {
      method,
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // the caller cancelled: let it unwind quietly
    throw new NetworkError(timedOut ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error = (parsed ?? {}) as { code?: unknown; message?: unknown; requestId?: unknown; details?: unknown };
    throw new ApiError(
      response.status,
      typeof error.code === 'string' ? error.code : 'ERROR',
      typeof error.message === 'string' ? error.message : `Request failed (${response.status})`,
      typeof error.requestId === 'string' ? error.requestId : undefined,
      typeof error.details === 'object' && error.details !== null ? (error.details as Record<string, unknown>) : undefined,
    );
  }
  return parsed as T;
}

/** GET a JSON resource from the backend's public API (see `send`). */
export function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  return send<T>('GET', path, query, undefined, signal);
}

/**
 * POST a JSON body to the backend's public API (see `send`). Used only for stateless requests that store nothing (an assessment
 * submission). It is never retried automatically: a retry is always an explicit action by the learner.
 */
export function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return send<T>('POST', path, undefined, body, signal);
}
