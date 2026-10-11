import type { ContentStatus } from '../../../shared-kernel/index.js';
import {
  type TransitionPlan,
  type WorkflowAction,
  planTransition,
} from './workflow.js';

/**
 * What an action does to a course or module. These are the lesson rules (`planTransition`) plus one case that
 * only catalog subjects have: a PUBLISHED course or module that is currently listed may be PUBLISHED again.
 * That creates a new catalog version from the approved current data and the lessons that are published now
 * (a "refresh"), with no outage: the status stays PUBLISHED and the previous version is ended in the same
 * transaction. It is not a way around review: a PUBLISHED subject has not been edited since it was approved
 * (any edit returns it to DRAFT), so a refresh publishes exactly what was approved.
 */
export function planCatalogTransition(
  action: WorkflowAction,
  status: ContentStatus,
  isListed: boolean,
): TransitionPlan {
  if (action === 'PUBLISH' && status === 'PUBLISHED' && isListed) {
    return { allowed: true, from: 'PUBLISHED', to: 'PUBLISHED' };
  }
  return planTransition(action, status, isListed);
}
