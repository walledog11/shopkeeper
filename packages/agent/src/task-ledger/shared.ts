// What every part of the task ledger shares: dispatch states, budgets,
// claim identity and leases, and the suspension shape every exit from
// `running` writes.

import { requireDurableAgentRuntime } from "../runtime-modes.js";
import type { AgentActionDispatchState } from "@prisma/client";
import { db } from "@shopkeeper/db";
import { BadRequestError } from "../errors.js";

// A task whose actions reached any of these has touched a provider, so it is
// never replayed from the top — claiming, settling, stopping, and resuming all
// read the same list.
export const DISPATCHED_STATES: AgentActionDispatchState[] = [
  "dispatch_authorized", "submitted", "unknown", "settled",
];

// Writes that may not have finished. Only these put a task in `reconciling`: a
// settled write's outcome is known and on the record, so there is nothing to
// reconcile, and a follow-up may run beside one but never beside these.
export const UNSETTLED_DISPATCH_STATES: AgentActionDispatchState[] = [
  "dispatch_authorized", "submitted", "unknown",
];

/**
 * What a task's actions did at a provider: whether any reached one, which its
 * failure code records, and whether any of those outcomes is still open, which
 * is the only thing a stop or failure sends to `reconciling`.
 */
export async function taskDispatches(
  tx: Pick<typeof db, "agentAction">,
  task: { organizationId: string; taskId: string },
): Promise<{ dispatched: boolean; unsettled: boolean }> {
  const states = await tx.agentAction.findMany({
    where: {
      organizationId: task.organizationId, taskId: task.taskId,
      dispatchState: { in: DISPATCHED_STATES },
    },
    select: { dispatchState: true },
    distinct: ["dispatchState"],
  });
  return {
    dispatched: states.length > 0,
    unsettled: states.some(({ dispatchState }) => (
      dispatchState !== null && UNSETTLED_DISPATCH_STATES.includes(dispatchState)
    )),
  };
}

export interface TaskBudget {
  runtimeVersion: number;
  modelCallLimit: number;
  activeTimeMsLimit: number;
  spendNanoUsdLimit: bigint;
}

export function validateTaskBudget(budget: TaskBudget): void {
  requireDurableAgentRuntime(budget.runtimeVersion);
  for (const value of [budget.runtimeVersion, budget.modelCallLimit, budget.activeTimeMsLimit]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
      throw new BadRequestError("Runtime version and task limits must be positive integers.");
    }
  }
  if (budget.spendNanoUsdLimit <= 0n) throw new BadRequestError("Spend limit must be positive.");
}

export interface TaskClaimIdentity {
  organizationId: string; taskId: string; expectedRevision: number;
}

export interface ActiveTaskClaim extends TaskClaimIdentity {
  claimToken: string;
}

export function activeTimeDeltaMs(checkpoint: Date | null, now: Date): number {
  if (!checkpoint) return 0;
  return Math.max(0, Math.min(2147483647, now.getTime() - checkpoint.getTime()));
}

export function leaseExpiry(now: Date, leaseMs: number): Date {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > 300000) {
    throw new BadRequestError("Lease duration must be 1–300000 ms.");
  }
  return new Date(now.getTime() + leaseMs);
}

// The four pending-question columns are all-or-nothing in the database and the
// active proposal must belong to this task, so every exit from `running` writes
// the whole suspension shape rather than one field of it.
export const NO_SUSPENSION = {
  activeProposalId: null,
  pendingQuestionId: null,
  pendingQuestion: null,
  pendingAnswererKind: null,
  pendingAnswererKey: null,
} as const;

/**
 * The parked proposal stops being the one the merchant is being asked about.
 *
 * Three things end an approval wait without deciding it — a superseding customer
 * message, the merchant's revision guidance, and a stop — and all three clear
 * `activeProposalId`. Clearing it alone leaves the proposal itself saying
 * `ready`, which is the one thing `authorizeAgentProposal` accepts, so the
 * status is written here rather than left to be inferred from a task that no
 * longer points at it.
 *
 * Only a `ready` proposal is superseded. An approved one belongs to the run it
 * authorized and rewriting its status would erase who approved what.
 */
export async function supersedeActiveProposal(
  tx: Pick<typeof db, "agentProposal">,
  input: { organizationId: string; activeProposalId: string | null },
  now: Date,
): Promise<void> {
  if (!input.activeProposalId) return;
  await tx.agentProposal.updateMany({
    where: {
      id: input.activeProposalId,
      organizationId: input.organizationId,
      status: "ready",
    },
    data: { status: "superseded", decidedAt: now },
  });
}

export function checkpointSourceRequestIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const ids = (value as Record<string, unknown>).sourceRequestIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string").slice(-31);
}
