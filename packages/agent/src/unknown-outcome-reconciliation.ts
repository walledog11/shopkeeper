import type { Prisma, RefundSpendReservation } from "@prisma/client";
import {
  commitDailyRefundSpendReservation,
  db,
  releaseDailyRefundSpendReservation,
} from "@shopkeeper/db";
import {
  finalizeReconciledPlanExecution,
  reconcileStaleClaimedPlanExecutions,
} from "./execution-ledger.js";
import {
  probeUnknownShopifyMutation,
  RECONCILABLE_SHOPIFY_MUTATION_TOOLS,
  type ShopifyReconciliationProbeResult,
} from "./shopify/reconciliation-probes.js";
import type { ShopifyContext } from "./shopify/client.js";

export const STALE_UNKNOWN_RECONCILIATION_MS = 10 * 60 * 1000;
export const STALE_CLAIMED_EXECUTION_ERROR =
  "Plan execution did not finish; claim reconciled to unknown for review. It is never auto-replayed.";
export const STALE_RESERVED_SPEND_ERROR =
  "Goodwill reservation did not reach a provider outcome; capacity released after the reservation window expired.";
export const RECONCILED_ACTION_PREFIX = "Reconciled after provider ambiguity review.";

export interface UnknownOutcomeSweepCounts {
  staleClaimedExecutions: number;
  staleReleasedReservations: number;
  resolvedExecutions: number;
  resolvedReservations: number;
  stillUnknownExecutions: number;
  stillUnknownReservations: number;
}

function canonicalJson(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(JSON.parse(JSON.stringify(value))));
}

function committedSpendCents(result: ShopifyReconciliationProbeResult): number | null {
  if (result.outcome !== "committed") return null;
  return result.spentCents ?? null;
}

async function findUnknownReservationForAction(params: {
  organizationId: string;
  executionId: string | null;
  tool: string;
  input: Prisma.JsonValue;
}): Promise<RefundSpendReservation | null> {
  const candidates = await db.refundSpendReservation.findMany({
    where: {
      organizationId: params.organizationId,
      tool: params.tool,
      status: "unknown",
      ...(params.executionId ? { operationKey: { startsWith: `${params.executionId}:` } } : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  const target = canonicalJson(params.input);
  return candidates.find((candidate) => canonicalJson(candidate.input) === target) ?? null;
}

async function applyReservationProbeResult(
  reservation: RefundSpendReservation,
  probe: ShopifyReconciliationProbeResult,
): Promise<boolean> {
  if (probe.outcome === "committed") {
    const committedCents = committedSpendCents(probe) ?? reservation.reservedCents;
    await commitDailyRefundSpendReservation(reservation.id, committedCents);
    return true;
  }
  if (probe.outcome === "no_effect") {
    await releaseDailyRefundSpendReservation(reservation.id, probe.message);
    return true;
  }
  return false;
}

export async function reconcileUnknownRefundSpendReservation(
  reservation: RefundSpendReservation,
  shopify: ShopifyContext,
): Promise<"resolved" | "still_unknown"> {
  if (reservation.status !== "unknown") return "still_unknown";
  if (!RECONCILABLE_SHOPIFY_MUTATION_TOOLS.has(reservation.tool)) {
    return "still_unknown";
  }

  const probe = await probeUnknownShopifyMutation(
    reservation.tool,
    reservation.input,
    { ...shopify, operationId: reservation.operationKey },
  );
  return (await applyReservationProbeResult(reservation, probe)) ? "resolved" : "still_unknown";
}

export async function reconcileStaleReservedRefundSpendReservations(
  staleBefore: Date,
  reason: string,
): Promise<number> {
  const updated = await db.refundSpendReservation.updateMany({
    where: {
      status: "reserved",
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: "released",
      resolvedAt: new Date(),
      lastError: reason,
    },
  });
  return updated.count;
}

export async function reconcileUnknownAgentAction(params: {
  actionId: string;
  organizationId: string;
  executionId: string | null;
  tool: string;
  input: Prisma.JsonValue;
  shopify: ShopifyContext | null;
}): Promise<"resolved" | "still_unknown"> {
  const action = await db.agentAction.findFirst({
    where: {
      id: params.actionId,
      organizationId: params.organizationId,
      status: "unknown",
    },
    select: { id: true, status: true },
  });
  if (!action) return "still_unknown";

  let resolved = false;
  if (params.shopify && RECONCILABLE_SHOPIFY_MUTATION_TOOLS.has(params.tool)) {
    const reservation = await findUnknownReservationForAction({
      organizationId: params.organizationId,
      executionId: params.executionId,
      tool: params.tool,
      input: params.input,
    });
    const operationId = reservation?.operationKey
      ?? (params.executionId ? `${params.executionId}:reconcile` : undefined);
    const probe = await probeUnknownShopifyMutation(
      params.tool,
      params.input,
      { ...params.shopify, operationId },
    );

    if (probe.outcome === "committed" || probe.outcome === "no_effect") {
      await db.agentAction.updateMany({
        where: { id: params.actionId, status: "unknown" },
        data: {
          status: probe.outcome === "committed" ? "success" : "error",
          output: `${RECONCILED_ACTION_PREFIX} ${probe.message}`,
          errorDetail: probe.outcome === "no_effect" ? probe.message : null,
        },
      });
      if (reservation) {
        await applyReservationProbeResult(reservation, probe);
      }
      resolved = true;
    }
  }

  if (!resolved) return "still_unknown";
  if (params.executionId) {
    await finalizeReconciledPlanExecution(params.executionId);
  }
  return "resolved";
}

export async function reconcileUnknownOutcomesForOrganization(params: {
  organizationId: string;
  shopify: ShopifyContext | null;
  batchSize?: number;
}): Promise<Pick<UnknownOutcomeSweepCounts, "resolvedExecutions" | "resolvedReservations" | "stillUnknownExecutions" | "stillUnknownReservations">> {
  const batchSize = params.batchSize ?? 25;
  let resolvedExecutions = 0;
  let resolvedReservations = 0;
  let stillUnknownExecutions = 0;
  let stillUnknownReservations = 0;

  const unknownReservations = await db.refundSpendReservation.findMany({
    where: { organizationId: params.organizationId, status: "unknown" },
    orderBy: { updatedAt: "asc" },
    take: batchSize,
  });
  for (const reservation of unknownReservations) {
    if (!params.shopify) {
      stillUnknownReservations += 1;
      continue;
    }
    const outcome = await reconcileUnknownRefundSpendReservation(reservation, params.shopify);
    if (outcome === "resolved") {
      resolvedReservations += 1;
    } else {
      stillUnknownReservations += 1;
    }
  }

  const unknownExecutions = await db.planExecution.findMany({
    where: { organizationId: params.organizationId, status: "unknown" },
    orderBy: { completedAt: "asc" },
    take: batchSize,
    select: { id: true },
  });
  for (const execution of unknownExecutions) {
    const unknownActions = await db.agentAction.findMany({
      where: { executionId: execution.id, status: "unknown" },
      orderBy: { executedAt: "asc" },
      select: {
        id: true,
        tool: true,
        input: true,
        executionId: true,
      },
    });
    if (unknownActions.length === 0) {
      stillUnknownExecutions += 1;
      continue;
    }

    let executionResolved = false;
    for (const action of unknownActions) {
      const outcome = await reconcileUnknownAgentAction({
        actionId: action.id,
        organizationId: params.organizationId,
        executionId: action.executionId,
        tool: action.tool,
        input: action.input,
        shopify: params.shopify,
      });
      if (outcome === "resolved") {
        executionResolved = true;
      }
    }

    const remainingUnknown = await db.agentAction.count({
      where: { executionId: execution.id, status: "unknown" },
    });
    if (remainingUnknown === 0) {
      await finalizeReconciledPlanExecution(execution.id);
      resolvedExecutions += 1;
    } else if (executionResolved) {
      stillUnknownExecutions += 1;
    } else {
      stillUnknownExecutions += 1;
    }
  }

  return {
    resolvedExecutions,
    resolvedReservations,
    stillUnknownExecutions,
    stillUnknownReservations,
  };
}

export async function runUnknownOutcomeReconciliation(params: {
  loadShopifyContext: (organizationId: string) => Promise<ShopifyContext | null>;
  staleBefore?: Date;
  batchSize?: number;
}): Promise<UnknownOutcomeSweepCounts> {
  const staleBefore = params.staleBefore ?? new Date(Date.now() - STALE_UNKNOWN_RECONCILIATION_MS);

  const staleClaimedExecutions = await reconcileStaleClaimedPlanExecutions(
    staleBefore,
    STALE_CLAIMED_EXECUTION_ERROR,
  );
  const staleReleasedReservations = await reconcileStaleReservedRefundSpendReservations(
    staleBefore,
    STALE_RESERVED_SPEND_ERROR,
  );

  const organizationIds = new Set<string>();
  const [executionOrgs, reservationOrgs] = await Promise.all([
    db.planExecution.findMany({
      where: { status: "unknown" },
      distinct: ["organizationId"],
      select: { organizationId: true },
      take: 100,
    }),
    db.refundSpendReservation.findMany({
      where: { status: "unknown" },
      distinct: ["organizationId"],
      select: { organizationId: true },
      take: 100,
    }),
  ]);
  for (const row of executionOrgs) organizationIds.add(row.organizationId);
  for (const row of reservationOrgs) organizationIds.add(row.organizationId);

  const totals: UnknownOutcomeSweepCounts = {
    staleClaimedExecutions,
    staleReleasedReservations,
    resolvedExecutions: 0,
    resolvedReservations: 0,
    stillUnknownExecutions: 0,
    stillUnknownReservations: 0,
  };

  for (const organizationId of organizationIds) {
    const shopify = await params.loadShopifyContext(organizationId);
    const result = await reconcileUnknownOutcomesForOrganization({
      organizationId,
      shopify,
      batchSize: params.batchSize,
    });
    totals.resolvedExecutions += result.resolvedExecutions;
    totals.resolvedReservations += result.resolvedReservations;
    totals.stillUnknownExecutions += result.stillUnknownExecutions;
    totals.stillUnknownReservations += result.stillUnknownReservations;
  }

  return totals;
}
