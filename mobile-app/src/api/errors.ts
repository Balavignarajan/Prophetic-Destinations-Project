/** The server answered with an error. Mirrors the backend's error body: `{ statusCode, code, message, requestId }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    /** The backend's `details` (for example `{ reason: 'ASSESSMENT_UNAVAILABLE' }` or `{ code: 'INVALID_ANSWER' }`), when it sent any. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The backend answers 404 for anything that is not currently published: a draft, a withdrawn item, an unknown id, a level with nothing. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * "This does not exist for the learner": a 404, or a 400 from the backend's id validation (a malformed lesson or course id,
   * for example from an old or mistyped link). The app validates the level itself, so a 400 here cannot be a bad level.
   * Never retried automatically, unlike network and 5xx errors.
   */
  get isUnavailable(): boolean {
    return this.status === 404 || this.status === 400;
  }
}

/** No usable answer arrived: the server was unreachable, or took too long. */
export class NetworkError extends Error {
  constructor(readonly reason: 'timeout' | 'unreachable') {
    super(reason === 'timeout' ? 'The server took too long to answer' : 'The server could not be reached');
    this.name = 'NetworkError';
  }
}

/** This build has no valid backend address (EXPO_PUBLIC_API_URL missing or malformed in a release build). Not a network problem: retrying cannot help. */
export class ConfigurationError extends Error {
  constructor() {
    super('The backend address is not configured');
    this.name = 'ConfigurationError';
  }
}

/** The server answered successfully but with a body that does not have the documented shape. */
export class ResponseShapeError extends Error {
  constructor(what: string) {
    super(`Unexpected response for ${what}`);
    this.name = 'ResponseShapeError';
  }
}

export type FriendlyError = { title: string; message: string };

/** Words for a person, never a stack trace or a raw status. */
export function describeError(error: unknown): FriendlyError {
  if (error instanceof ConfigurationError) {
    return { title: 'App not configured', message: 'This build has no server address, so lessons cannot be loaded. Please install an updated version of the app.' };
  }
  if (error instanceof NetworkError) {
    return error.reason === 'timeout'
      ? { title: 'The server is slow to respond', message: 'Please check your connection and try again.' }
      : { title: 'Cannot reach the server', message: 'Check your connection, or that the backend is running, and try again.' };
  }
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return { title: 'Too many requests', message: 'Please wait a moment and try again.' };
    }
    if (error.status >= 500) {
      return { title: 'The server had a problem', message: 'Please try again in a little while.' };
    }
  }
  if (error instanceof ResponseShapeError) {
    return { title: 'This content cannot be shown', message: 'The app did not understand the response. An update may be needed.' };
  }
  return { title: 'Something went wrong', message: 'Please try again.' };
}
