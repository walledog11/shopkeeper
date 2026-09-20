import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import {
  cleanupTestData, createTestCustomer, createTestOrg, createTestThread,
} from "@shopkeeper/db/test-helpers";
import {
  authorizeAgentActionDispatch,
  beginAgentActionAttempt,
  completeAgentActionAttempt,
  markAgentActionSubmitted,
  recordAgentActionsBatch,
} from "./agent-actions.js";
import type { ReceiptV1 } from "./tools/result.js";
import { acceptMemberAgentRequest, cancelMemberAgentTask, claimAgentTask } from "./task-ledger.js";

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

function receipt(): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-1",
    executionId: "execution-1",
    tool: "create_refund",
    target: { kind: "order", id: "gid://shopify/Order/1" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/Refund/2",
    facts: {
      orderId: "gid://shopify/Order/1",
      refundId: "gid://shopify/Refund/2",
      amount: "40.00",
      currency: "USD",
      transactionStatus: "SUCCESS",
      transactionReference: "transaction-3",
      classification: "partial",
    },
  };
}

describe("agent action receipts", () => {
  it("persists a validated versioned receipt while legacy actions remain null", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const turnId = randomUUID();

    await recordAgentActionsBatch({
      orgId: org.id,
      turnId,
      mode: "human_approved",
      actions: [
        {
          tool: "create_refund",
          result: "Display wording A",
          status: "success",
          providerOperationKey: "operation-1",
          receipt: receipt(),
        },
        { tool: "search_kb", result: "Legacy display text", status: "success" },
      ],
    });

    const rows = await db.agentAction.findMany({ where: { organizationId: org.id }, orderBy: { executedAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tool: "create_refund",
      output: "Display wording A",
      receiptVersion: 1,
      receipt: receipt(),
    });
    expect(rows[1]).toMatchObject({ tool: "search_kb", receiptVersion: null, receipt: null });
  });

  it("rejects receipt/action disagreement before inserting a row", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);

    await expect(recordAgentActionsBatch({
      orgId: org.id,
      mode: "auto_executed",
      actions: [{ tool: "cancel_order", result: "Done", status: "success", receipt: receipt() }],
    })).rejects.toThrow("does not match action tool");
    expect(await db.agentAction.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("rejects a receipt bound to another provider operation", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);

    await expect(recordAgentActionsBatch({
      orgId: org.id,
      mode: "auto_executed",
      actions: [{
        tool: "create_refund",
        result: "Done",
        status: "success",
        providerOperationKey: "operation-2",
        receipt: receipt(),
      }],
    })).rejects.toThrow("provider operation key");
    expect(await db.agentAction.count({ where: { organizationId: org.id } })).toBe(0);
  });
});

describe("agent action dispatch lifecycle", () => {
  async function claimedTask() {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, "operator");
    await db.thread.update({
      where: { id: thread.id }, data: { operatorKey: `member:${member.id}` },
    });
    const input = {
      organizationId: org.id, clerkUserId: member.clerkUserId,
      threadId: thread.id, dedupeKey: randomUUID(), instruction: "Refund order 1",
    };
    const { request, task } = await acceptMemberAgentRequest({
      ...input,
      budget: {
        runtimeVersion: 1, modelCallLimit: 20,
        activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n,
      },
    });
    const claim = await claimAgentTask({
      organizationId: org.id, taskId: task!.id, expectedRevision: task!.revision,
    });
    return { org, input, request, task: task!, claim: claim! };
  }

  it("orders cancellation and dispatch authorization on the task row", async () => {
    const seeded = await claimedTask();
    const authority = {
      kind: "claim" as const,
      taskId: seeded.task.id,
      expectedRevision: seeded.task.revision,
      claimToken: seeded.claim.claimToken,
    };
    const attempt = await beginAgentActionAttempt({
      orgId: seeded.org.id,
      threadId: seeded.input.threadId,
      turnId: seeded.request.id,
      mode: "human_approved",
      actionIndex: 0,
      operationId: randomUUID(),
      taskAuthority: authority,
      action: { tool: "create_refund", input: { order_id: "1" }, category: "action" },
    });
    await cancelMemberAgentTask({
      organizationId: seeded.org.id,
      clerkUserId: seeded.input.clerkUserId,
      taskId: seeded.task.id,
      expectedRevision: seeded.task.revision,
    });

    await expect(authorizeAgentActionDispatch(attempt))
      .rejects.toThrow("authority was lost");
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .resolves.toMatchObject({ taskId: seeded.task.id, dispatchState: "prepared" });
  });

  it("persists each dispatch boundary before recording a settled receipt", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const operationId = randomUUID();
    const attempt = await beginAgentActionAttempt({
      orgId: org.id,
      turnId: randomUUID(),
      mode: "human_approved",
      actionIndex: 0,
      operationId,
      action: {
        tool: "create_refund",
        input: { order_id: "gid://shopify/Order/1", amount: "40.00" },
        providerOperationKey: operationId,
        category: "action",
      },
    });

    await expect(db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .resolves.toMatchObject({
        operationId: attempt.operationId,
        actionIndex: 0,
        dispatchState: "prepared",
        submittedAt: null,
        executedAt: null,
        durationMs: null,
      });

    await authorizeAgentActionDispatch(attempt);
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .resolves.toMatchObject({ dispatchState: "dispatch_authorized", submittedAt: null });

    await markAgentActionSubmitted(attempt);
    const submitted = await db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(submitted.dispatchState).toBe("submitted");
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(submitted.executedAt).toBeNull();

    await completeAgentActionAttempt(attempt, {
      tool: "create_refund",
      input: { order_id: "gid://shopify/Order/1", amount: "40.00" },
      result: "Provider-confirmed refund",
      status: "success",
      providerOperationKey: operationId,
      durationMs: 25,
      receipt: { ...receipt(), operationId },
    });
    const completed = await db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(completed).toMatchObject({
      dispatchState: "settled",
      status: "success",
      durationMs: 25,
      receiptVersion: 1,
    });
    expect(completed.executedAt).toBeInstanceOf(Date);
  });

  it("leaves crash boundaries durable and rejects replayed transitions", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const attempt = await beginAgentActionAttempt({
      orgId: org.id,
      mode: "auto_executed",
      actionIndex: 0,
      operationId: randomUUID(),
      action: { tool: "cancel_order", input: { order_id: "1" }, category: "action" },
    });
    await authorizeAgentActionDispatch(attempt);

    // A fresh caller sees the durable boundary; it cannot reset or authorize it again.
    await expect(authorizeAgentActionDispatch(attempt)).rejects.toThrow("could not transition");
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .resolves.toMatchObject({ dispatchState: "dispatch_authorized", executedAt: null });

    await markAgentActionSubmitted(attempt);
    await expect(markAgentActionSubmitted(attempt)).rejects.toThrow("could not transition");
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .resolves.toMatchObject({ dispatchState: "submitted", status: "unknown" });
  });

  it("rejects a receipt bound to a different durable operation", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const attempt = await beginAgentActionAttempt({
      orgId: org.id,
      mode: "auto_executed",
      actionIndex: 0,
      operationId: randomUUID(),
      action: { tool: "create_refund", input: { order_id: "1", amount: "1.00" }, category: "action" },
    });
    await authorizeAgentActionDispatch(attempt);
    await markAgentActionSubmitted(attempt);

    await expect(completeAgentActionAttempt(attempt, {
      tool: "create_refund",
      input: { order_id: "1", amount: "1.00" },
      result: "Done",
      status: "success",
      receipt: receipt(),
    })).rejects.toThrow("durable action operation ID");
    await expect(db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .resolves.toMatchObject({ dispatchState: "submitted", status: "unknown", receipt: null });
  });

  it("enforces stable provider operation uniqueness within an organization", async () => {
    const firstOrg = await createTestOrg();
    const secondOrg = await createTestOrg();
    orgIds.push(firstOrg.id, secondOrg.id);
    const action = {
      tool: "cancel_order",
      input: { order_id: "1" },
      providerOperationKey: "stable-provider-operation",
      category: "action",
    } as const;
    await beginAgentActionAttempt({
      orgId: firstOrg.id,
      mode: "auto_executed",
      actionIndex: 0,
      operationId: randomUUID(),
      action,
    });
    await expect(beginAgentActionAttempt({
      orgId: firstOrg.id,
      mode: "auto_executed",
      actionIndex: 1,
      operationId: randomUUID(),
      action,
    })).rejects.toMatchObject({ code: "P2002" });
    await expect(beginAgentActionAttempt({
      orgId: secondOrg.id,
      mode: "auto_executed",
      actionIndex: 0,
      operationId: randomUUID(),
      action,
    })).resolves.toMatchObject({ id: expect.any(String) });
  });
});
