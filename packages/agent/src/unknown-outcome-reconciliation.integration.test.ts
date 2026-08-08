import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import {
  markDailyRefundSpendReservationUnknown,
  reserveDailyRefundSpend,
} from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import {
  reconcileStaleClaimedPlanExecutions,
  finalizeReconciledPlanExecution,
} from "./execution-ledger.js";
import {
  reconcileStaleReservedRefundSpendReservations,
  reconcileUnknownAgentAction,
  runUnknownOutcomeReconciliation,
  STALE_CLAIMED_EXECUTION_ERROR,
  STALE_RESERVED_SPEND_ERROR,
} from "./unknown-outcome-reconciliation.js";
import { shopifyOperationTag } from "./shopify/client.js";

const ELEVEN_MINUTES_AGO = () => new Date(Date.now() - 11 * 60 * 1000);

describe("unknown outcome reconciliation", () => {
  let orgId: string | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanupTestData(orgId);
    orgId = null;
  });

  it("reconciles stale claimed plan executions to unknown", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const execution = await db.planExecution.create({
      data: {
        planId: crypto.randomUUID(),
        organizationId: org.id,
        status: "claimed",
        claimToken: crypto.randomUUID(),
        claimedAt: ELEVEN_MINUTES_AGO(),
        planHash: "hash",
        instructionHash: "hash",
      },
    });

    const count = await reconcileStaleClaimedPlanExecutions(
      new Date(Date.now() - 10 * 60 * 1000),
      STALE_CLAIMED_EXECUTION_ERROR,
    );

    expect(count).toBe(1);
    const updated = await db.planExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.status).toBe("unknown");
    expect(updated.lastError).toBe(STALE_CLAIMED_EXECUTION_ERROR);
  });

  it("releases stale reserved goodwill reservations", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const reserved = await reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: "execution:stale",
      tool: "create_refund",
      input: { amount: "5.00" },
      requestedCents: 500,
      capCents: 1000,
      day: "2026-07-20",
    });
    if (reserved.kind !== "reserved") throw new Error("Expected reservation");
    await db.refundSpendReservation.update({
      where: { id: reserved.reservation.id },
      data: { updatedAt: ELEVEN_MINUTES_AGO() },
    });

    const count = await reconcileStaleReservedRefundSpendReservations(
      new Date(Date.now() - 10 * 60 * 1000),
      STALE_RESERVED_SPEND_ERROR,
    );

    expect(count).toBe(1);
    const updated = await db.refundSpendReservation.findUniqueOrThrow({
      where: { id: reserved.reservation.id },
    });
    expect(updated.status).toBe("released");
    expect(updated.lastError).toBe(STALE_RESERVED_SPEND_ERROR);
  });

  it("finalizes a reconciled plan execution from its agent actions", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const execution = await db.planExecution.create({
      data: {
        planId: crypto.randomUUID(),
        organizationId: org.id,
        status: "unknown",
        claimToken: crypto.randomUUID(),
        claimedAt: ELEVEN_MINUTES_AGO(),
        completedAt: new Date(),
        planHash: "hash",
        instructionHash: "hash",
      },
    });
    await db.agentAction.create({
      data: {
        turnId: crypto.randomUUID(),
        organizationId: org.id,
        executionId: execution.id,
        tool: "create_refund",
        category: "action",
        input: { order_id: "1", amount: "5.00" },
        output: "ok",
        status: "success",
        mode: "human_approved",
        durationMs: 1,
      },
    });

    await expect(finalizeReconciledPlanExecution(execution.id)).resolves.toBe("committed");
    const updated = await db.planExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(updated.status).toBe("committed");
  });

  it("keeps unknown reservations when no Shopify integration is connected", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const reserved = await reserveDailyRefundSpend({
      orgId: org.id,
      operationKey: "execution:unknown",
      tool: "create_refund",
      input: { amount: "5.00" },
      requestedCents: 500,
      capCents: 1000,
      day: "2026-07-20",
    });
    if (reserved.kind !== "reserved") throw new Error("Expected reservation");
    await markDailyRefundSpendReservationUnknown(reserved.reservation.id, "provider timeout");

    const result = await runUnknownOutcomeReconciliation({
      loadShopifyContext: async () => null,
    });

    expect(result.stillUnknownReservations).toBeGreaterThanOrEqual(1);
    const updated = await db.refundSpendReservation.findUniqueOrThrow({
      where: { id: reserved.reservation.id },
    });
    expect(updated.status).toBe("unknown");
  });

  it("reconciles an order creation with the exact persisted provider operation key", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const execution = await db.planExecution.create({
      data: {
        planId: crypto.randomUUID(),
        organizationId: org.id,
        status: "unknown",
        claimToken: crypto.randomUUID(),
        claimedAt: ELEVEN_MINUTES_AGO(),
        completedAt: new Date(),
        planHash: "hash",
        instructionHash: "hash",
      },
    });
    const providerOperationKey = `${execution.id}:tool_call_create_order`;
    const input = {
      email: "buyer@example.com",
      first_name: "Test",
      last_name: "Buyer",
      address1: "1 Main St",
      city: "San Francisco",
      province: "CA",
      zip: "94105",
      country: "US",
      line_items: [{ variant_id: "1", quantity: 1 }],
    };
    const action = await db.agentAction.create({
      data: {
        turnId: crypto.randomUUID(),
        organizationId: org.id,
        executionId: execution.id,
        providerOperationKey,
        tool: "create_shopify_order",
        category: "action",
        input,
        output: "Unknown provider result",
        status: "unknown",
        mode: "human_approved",
        durationMs: 1,
      },
    });
    const tag = shopifyOperationTag(providerOperationKey);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      orders: [{ id: 123, name: "#1001", tags: tag }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const outcome = await reconcileUnknownAgentAction({
      actionId: action.id,
      organizationId: org.id,
      executionId: execution.id,
      providerOperationKey,
      tool: action.tool,
      input,
      shopify: { shop: "test.myshopify.com", accessToken: "test" },
    });

    expect(outcome).toBe("resolved");
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: action.id } }))
      .resolves.toMatchObject({ status: "success", providerOperationKey });
    await expect(db.planExecution.findUniqueOrThrow({ where: { id: execution.id } }))
      .resolves.toMatchObject({ status: "committed" });
  });
});
