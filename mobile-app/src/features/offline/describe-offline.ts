import { type FriendlyError, NetworkError, describeError } from '@/api/errors';
import { API_BASE_URL } from '@/config/api';
import { unreachableHint } from '@/config/api-host';

/**
 * Like describeError, but for a screen that tried the saved copy as well: a network failure here means there was no saved copy,
 * and the message says so instead of pretending the content might be available.
 */
export function describeLoadError(error: unknown, noun: 'lesson' | 'course' | 'course list'): FriendlyError {
  if (error instanceof NetworkError) {
    const hint = unreachableHint(API_BASE_URL, __DEV__); // development builds only
    return {
      title: 'Not available offline',
      message: `The server cannot be reached, and this ${noun} has not been saved on this device. Connect to the internet and try again; once opened online it can be read offline.${hint ? ` ${hint}` : ''}`,
    };
  }
  return describeError(error);
}
