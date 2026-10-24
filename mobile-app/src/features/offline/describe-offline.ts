import { type FriendlyError, NetworkError, describeError } from '@/api/errors';
import { API_BASE_URL } from '@/config/api';
import { unreachableHint } from '@/config/api-host';
import { LEVEL_LABELS, type LearningLevel } from '@/learning/levels';

/**
 * Like describeError, but for a screen that tried the saved copy as well: a network failure here means there was no saved copy,
 * and the message says so instead of pretending the content might be available.
 *
 * Offline copies are kept per learning level (the cache key names the level), so when the screen knows the level it is asking for, the message names it: a
 * lesson saved at Beginner is not a saved lesson at Advanced, nothing is shown in its place, and what was saved at the other levels is untouched. The message says
 * how to get the copy (open it once online at this level) and nothing is downloaded for the learner behind their back.
 */
export function describeLoadError(error: unknown, noun: 'lesson' | 'course' | 'course list', level?: LearningLevel): FriendlyError {
  if (error instanceof NetworkError) {
    const hint = unreachableHint(API_BASE_URL, __DEV__); // development builds only
    if (level) {
      const name = LEVEL_LABELS[level];
      const other = noun === 'course list' ? ' Or choose a level you have already opened online.' : '';
      return {
        title: `Not available offline at the ${name} level`,
        message: `The server cannot be reached, and this ${noun} has not been saved on this device for the ${name} level. Offline copies are kept separately for each learning level, so what you saved at other levels is not affected and is not shown here. To read it offline, open it once at the ${name} level while connected to the internet.${other}${hint ? ` ${hint}` : ''}`,
      };
    }
    return {
      title: 'Not available offline',
      message: `The server cannot be reached, and this ${noun} has not been saved on this device. Connect to the internet and try again; once opened online it can be read offline.${hint ? ` ${hint}` : ''}`,
    };
  }
  return describeError(error);
}
