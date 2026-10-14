import { useResource, type Resource } from '@/api/use-resource';

import { activeLessonSource } from './source';
import type { Daniel2Lesson } from './types';

/** The Daniel 2 lesson from the active source, with the same loading / error / reload shape as the API-backed screens. */
export function useDaniel2Lesson(): [Resource<Daniel2Lesson>, () => void] {
  return useResource(`daniel2:${activeLessonSource.kind}`, (signal) => activeLessonSource.load(signal));
}
