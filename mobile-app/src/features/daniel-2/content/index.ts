import type { Daniel2Lesson } from '../types';

import { quiz } from './quiz';
import { scenes } from './scenes';
import { statueSections } from './statue';
import { timeline } from './timeline';

/**
 * The Daniel 2 lesson assembled from the CONFIGURED content files. This is built-in, pending-approval educational content.
 * It is not a backend course and must never be presented as one.
 */
export const configuredDaniel2Lesson: Daniel2Lesson = {
  id: 'daniel-2',
  title: 'Daniel 2',
  subtitle: 'The Dream of the Great Image',
  source: {
    kind: 'configured',
    status: 'pending-approval',
    label: 'Built-in lesson content, pending approval. Not from the course catalog.',
  },
  statueSections,
  scenes,
  timeline,
  quiz,
};
