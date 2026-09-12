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
  reconcileStaleAgentActionDispatches,
  reconcileUnknownAgentAction,
  runUnknownOutcomeReconciliation,
  STALE_CLAIMED_EXECUTION_ERROR,
  STALE_RESERVED_SPEND_ERROR,
  STALE_ACTION_DISPATCH_ERROR,
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

  it("turns stale authorized and submitted dispatches into unknown without touching prepared work", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const base = {
      turnId: crypto.randomUUID(),
      organizationId: org.id,
      tool: "cancel_order",
      category: "action",
      input: { order_id: "1" },
      output: "Execution started; completion has not been recorded.",
      status: "unknown",
      errorDetail: "Execution started; completion has not been recorded.",
      mode: "human_approved",
      actionIndex: 0,
      executedAt: null,
      durationMs: null,
      createdAt: ELEVEN_MINUTES_AGO(),
    } as const;
    const prepared = await db.agentAction.create({
      data: { ...base, operationId: crypto.randomUUID(), dispatchState: "prepared" },
    });
    const authorized = await db.agentAction.create({
      data: {
        ...base,
        id: undefined,
        operationId: crypto.randomUUID(),
        actionIndex: 1,
        dispatchState: "dispatch_authorized",
      },
    });
    const submitted = await db.agentAction.create({
      data: {
        ...base,
        id: undefined,
        operationId: crypto.randomUUID(),
        actionIndex: 2,
        dispatchState: "submitted",
        submittedAt: ELEVEN_MINUTES_AGO(),
      },
    });

    await expect(reconcileStaleAgentActionDispatches(
      new Date(Date.now() - 10 * 60 * 1000),
      STALE_ACTION_DISPATCH_ERROR,
    )).resolves.toBe(2);

    await expect(db.agentAction.findUniqueOrThrow({ where: { id: prepared.id } }))
      .resolves.toMatchObject({ dispatchState: "prepared", executedAt: null });
    for (const id of [authorized.id, submitted.id]) {
      const row = await db.agentAction.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({
        dispatchState: "unknown",
        status: "unknown",
        errorDetail: STALE_ACTION_DISPATCH_ERROR,
        durationMs: 0,
      });
      expect(row.executedAt).toBeInstanceOf(Date);
    }
  });

  it("probes a stale standalone dispatch from storage without replaying the write", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const providerOperationKey = `${crypto.randomUUID()}:tool_call_create_order`;
    const operationId = crypto.randomUUID();
    const action = await db.agentAction.create({
      data: {
        turnId: crypto.randomUUID(),
        organizationId: org.id,
        operationId,
        actionIndex: 0,
        providerOperationKey,
        dispatchState: "dispatch_authorized",
        createdAt: ELEVEN_MINUTES_AGO(),
        tool: "create_shopify_order",
        category: "action",
        input: {
          email: "buyer@example.com",
          first_name: "Test",
          last_name: "Buyer",
          address1: "1 Main St",
          city: "San Francisco",
          province: "CA",
          zip: "94105",
          country: "US",
          line_items: [{ variant_id: "1", quantity: 1 }],
        },
        output: "Execution started; completion has not been recorded.",
        status: "unknown",
        errorDetail: "Execution started; completion has not been recorded.",
        mode: "human_approved",
        executedAt: null,
        durationMs: null,
      },
    });
    const providerRead = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      orders: [{ id: 123, name: "#1001", tags: shopifyOperationTag(providerOperationKey) }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", providerRead);

    const result = await runUnknownOutcomeReconciliation({
      staleBefore: new Date(Date.now() - 10 * 60 * 1000),
      loadShopifyContext: async () => ({ shop: "test.myshopify.com", accessToken: "test" }),
    });

    expect(result.staleActionDispatches).toBe(1);
    expect(result.stillUnknownStandaloneActions).toBe(1);
    expect(providerRead).toHaveBeenCalledOnce();
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: action.id } }))
      .resolves.toMatchObject({
        operationId,
        providerOperationKey,
        dispatchState: "unknown",
        status: "unknown",
      });
  });

  it.each([
    ["create_return", { order_id: "456" }],
    ["create_exchange", {
      order_id: "456",
      variant_id: "999",
      exchange_variant_id: "1000",
      quantity: 1,
    }],
  ] as const)("keeps a reconciled %s commit unknown when the probe cannot rebuild its receipt facts", async (tool, input) => {
    const org = await createTestOrg();
    orgId = org.id;
    const operationId = crypto.randomUUID();
    const action = await db.agentAction.create({
      data: {
        turnId: crypto.randomUUID(),
        organizationId: org.id,
        operationId,
        actionIndex: 0,
        providerOperationKey: operationId,
        dispatchState: "unknown",
        submittedAt: ELEVEN_MINUTES_AGO(),
        tool,
        category: "action",
        input,
        output: "Unknown provider result",
        status: "unknown",
        errorDetail: "Unknown provider result",
        mode: "human_approved",
        executedAt: ELEVEN_MINUTES_AGO(),
        durationMs: 1,
      },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          order: { id: "gid://shopify/Order/456" },
          returnableFulfillments: { edges: [] },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          order: {
            returns: {
              edges: [{
                node: {
                  id: "gid://shopify/Return/999",
                  name: "#1001-R1",
                  status: "OPEN",
                  reverseFulfillmentOrders: { edges: [] },
                },
              }],
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const outcome = await reconcileUnknownAgentAction({
      actionId: action.id,
      organizationId: org.id,
      executionId: null,
      providerOperationKey: operationId,
      tool: action.tool,
      input: action.input,
      shopify: { shop: "test.myshopify.com", accessToken: "test" },
    });

    expect(outcome).toBe("still_unknown");
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: action.id } }))
      .resolves.toMatchObject({
        operationId,
        providerOperationKey: operationId,
        dispatchState: "unknown",
        status: "unknown",
        receiptVersion: null,
        receipt: null,
      });
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
