import { API_BASE_URL } from '@/config/api';

import { ApiError, NetworkError } from './errors';

const REQUEST_TIMEOUT_MS = 15_000;

type Query = Record<string, string>;

/**
 * GET a JSON resource from the backend's public API.
 *
 * - The base URL is `EXPO_PUBLIC_API_URL` (see src/config/api.ts).
 * - A request that outlives `REQUEST_TIMEOUT_MS`, or that cannot reach the server, becomes a `NetworkError`.
 * - A non-2xx answer becomes an `ApiError` carrying the backend's own `code` and `message` (its error body is
 *   `{ statusCode, code, message, requestId }`).
 * - Passing an `AbortSignal` cancels the request (used when a screen goes away or the level changes).
 */
export async function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
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
      method: 'GET',
      headers: { accept: 'application/json' },
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
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = (body ?? {}) as { code?: unknown; message?: unknown; requestId?: unknown };
    throw new ApiError(
      response.status,
      typeof error.code === 'string' ? error.code : 'ERROR',
      typeof error.message === 'string' ? error.message : `Request failed (${response.status})`,
      typeof error.requestId === 'string' ? error.requestId : undefined,
    );
  }
  return body as T;
}
