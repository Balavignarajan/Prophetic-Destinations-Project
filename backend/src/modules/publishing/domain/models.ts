import type { ContentStatus } from '../../../shared-kernel/index.js';
import type { Role } from '../../identity/index.js';
import type { WorkflowAction } from './workflow.js';

/** One recorded workflow transition of a lesson. History is append-only. */
export interface WorkflowEvent {
  id: string;
  /** Strictly increasing in the order events were recorded. */
  seq: number;
  lessonId: string;
  action: WorkflowAction;
  fromStatus: ContentStatus;
  toStatus: ContentStatus;
  actorAdminId: string;
  /** The actor's role at the time of the action. */
  actorRole: Role;
  note: string | null;
  /** The lesson's content revision when the transition happened (the revision that was reviewed). */
  contentRevision: number;
  createdAt: Date;
}
