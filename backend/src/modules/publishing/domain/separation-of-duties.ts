import { ForbiddenError } from '../../../shared-kernel/index.js';
import type { WorkflowAction } from './workflow.js';

/** Injection token for the separation-of-duties policy in force. */
export const SEPARATION_OF_DUTIES_POLICY = Symbol(
  'SEPARATION_OF_DUTIES_POLICY',
);

/** A past workflow event, as far as a separation-of-duties rule needs to know. */
export interface PriorEvent {
  action: WorkflowAction;
  actorId: string;
}

export interface SeparationOfDutiesContext {
  action: WorkflowAction;
  actorId: string;
  /** The lesson's earlier workflow events, newest first. */
  priorEvents: readonly PriorEvent[];
}

/**
 * A separation-of-duties policy: returns why the actor may not do this, or null
 * when they may. Policies are plain functions so stricter ones can be added
 * without touching the workflow.
 */
export type SeparationOfDutiesPolicy = (
  context: SeparationOfDutiesContext,
) => string | null;

/**
 * Policy S0, the one in force: nothing is enforced. The same person may submit,
 * approve and publish. Every actor is still recorded in the workflow events, so a
 * stricter policy can be introduced (and audited) later.
 */
export const NO_SEPARATION_OF_DUTIES: SeparationOfDutiesPolicy = () => null;

export function checkSeparationOfDuties(
  policy: SeparationOfDutiesPolicy,
  context: SeparationOfDutiesContext,
): void {
  const violation = policy(context);
  if (violation !== null) throw new ForbiddenError(violation);
}
