import { afterEach, describe, expect, it } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import { getOperatorPendingPlans } from "@/lib/agent/api/operator-pending";

// Parked plan ids are the durable `PlanExecution.planId` (a uuid column), so the
// liveness lookup only exercises its real path with real uuids.
const PLAN_ONE = "2660b813-918a-497d-b633-edef698d4954";
const PLAN_DONE = "ec84a83d-cf2f-42a0-a71b-e453b80415ba";
const PLAN_OLD = "0bf30273-c0dd-4092-8363-073baace427a";
const PLAN_NEW = "7a9ea3c1-e98b-4eec-9b49-ce88b365fa2b";

let orgId: string | null = null;

afterEach(async () => {
  if (orgId) await cleanupTestData(orgId);
  orgId = null;
});

async function seed(clerkUserId: string) {
  const org = await createTestOrg();
  orgId = org.id;
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId },
  });
  const customer = await createTestCustomer(org.id, `cust_${org.id}`, { name: "Sarah Jones" });
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  return { orgId: org.id, memberKey: `member:${member.id}`, threadId: thread.id };
}

function plan(threadId: string, planId: string) {
  return {
    threadId,
    planId,
    instruction: "Refund the late order",
    customerName: "Sarah Jones",
    actionLabel: "reply to Sarah",
    rawToolCalls: [
      { id: "tc1", name: "get_shopify_orders", input: { customer_id: "1" } },
      { id: "tc2", name: "create_refund", input: { order_id: "1", amount: 12 } },
      { id: "tc3", name: "send_reply", input: { text: "Refunded $12 — sorry about the delay." } },
    ],
  };
}

describe("getOperatorPendingPlans", () => {
  it("returns nothing when the merchant has no membership yet", async () => {
    const org = await createTestOrg();
    orgId = org.id;
    expect(await getOperatorPendingPlans(org.id, "usr_never_seen")).toEqual([]);
  });

  it("renders the queued plan with its action, steps, and draft", async () => {
    const { memberKey, threadId } = await seed("usr_desk");
    await db.operatorContext.create({
      data: { organizationId: orgId!, memberKey, pendingPlans: [plan(threadId, PLAN_ONE)] },
    });

    const [view, ...rest] = await getOperatorPendingPlans(orgId!, "usr_desk");

    expect(rest).toEqual([]);
    expect(view).toMatchObject({
      planId: PLAN_ONE,
      threadId,
      customerName: "Sarah Jones",
      actionLabel: "reply to Sarah",
      draft: "Refunded $12 — sorry about the delay.",
    });
    // Read tools are plumbing, not something the merchant is approving.
    expect(view!.steps).not.toContain("get_shopify_orders");
    expect(view!.steps.length).toBe(2);
  });

  // The queue is mutable from the merchant's phone. A plan they approved there
  // must stop being offered here even before the gateway resolves the row.
  it("drops a plan whose execution already finished elsewhere", async () => {
    const { memberKey, threadId } = await seed("usr_desk");
    await db.operatorContext.create({
      data: { organizationId: orgId!, memberKey, pendingPlans: [plan(threadId, PLAN_DONE)] },
    });
    await db.planExecution.create({
      data: {
        organizationId: orgId!,
        planId: PLAN_DONE,
        threadId,
        planHash: "a".repeat(64),
        instructionHash: "b".repeat(64),
        // A committed row must carry its full claim state; the ledger's check
        // constraint rejects a terminal status without one.
        status: "committed",
        claimToken: "8f2b1c74-2c2a-4c4f-9a41-2a2f6b6c5d10",
        claimedAt: new Date(),
        completedAt: new Date(),
      },
    });

    expect(await getOperatorPendingPlans(orgId!, "usr_desk")).toEqual([]);
  });

  it("leads with the most recently parked plan", async () => {
    const { memberKey, threadId } = await seed("usr_desk");
    const customer = await createTestCustomer(orgId!, `cust2_${orgId}`, { name: "Ann Lee" });
    const second = await createTestThread(orgId!, customer.id, ChannelType.email);
    await db.operatorContext.create({
      data: {
        organizationId: orgId!,
        memberKey,
        pendingPlans: [plan(threadId, PLAN_OLD), plan(second.id, PLAN_NEW)],
      },
    });

    const views = await getOperatorPendingPlans(orgId!, "usr_desk");
    expect(views.map((view) => view.planId)).toEqual([PLAN_NEW, PLAN_OLD]);
  });
});
