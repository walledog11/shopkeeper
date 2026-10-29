import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import { ForbiddenError } from "./errors.js";
import {
  ANY_MEMBER_ACTOR_KEY,
  acceptCustomerAgentRequest,
  acceptMemberAgentRequest,
  attachMemberAgentTask,
  claimAgentTask,
  findQueuedAgentTasks,
  settleAgentTaskClaim,
} from "./task-ledger/index.js";
import { budget, orgIds, seed } from "./test-fixtures/task-ledger.js";

afterEach(async () => {
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe("support conversation request boundary", () => {
  async function seedSupport(channel: "email" | "operator" = "email") {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, channel);
    const message = await createTestMessage(thread.id, "Where is my order?");
    return {
      organizationId: org.id, threadId: thread.id, customerId: customer.id,
      sourceMessageId: message.id, objective: "Handle this customer's latest request",
      budget,
    };
  }

  it("accepts one request per inbound message however often planning runs", async () => {
    const input = await seedSupport();
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      acceptCustomerAgentRequest(input)));
    expect(new Set(results.map(r => r.request.id)).size).toBe(1);
    expect(new Set(results.map(r => r.task.id)).size).toBe(1);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect(results[0].request).toMatchObject({
      actorKind: "customer", actorKey: `customer:${input.customerId}`,
      channel: "email", sourceMessageId: input.sourceMessageId, state: "attached",
    });
    expect(results[0].task).toMatchObject({
      initiatingActorKind: "customer", objective: input.objective, status: "queued",
    });
  });

  // The objective comes from the thread's request summary, which the summary job
  // fills in after the message lands. Hashing it would make the second planning
  // job for one message conflict with the first.
  it("re-accepts the same message under a later objective", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest(input);
    const second = await acceptCustomerAgentRequest({
      ...input, objective: "Customer is asking where their order is",
    });
    expect(second.request.id).toBe(first.request.id);
    expect(second.task.id).toBe(first.task.id);
    expect(second.task.objective).toBe(input.objective);
  });

  it("mints no customer actor on an operator conversation", async () => {
    const input = await seedSupport("operator");
    await expect(acceptCustomerAgentRequest(input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(0);
  });

  it("refuses a message that is not the customer's own", async () => {
    const input = await seedSupport();
    const agentMessage = await createTestMessage(input.threadId, "On it", "agent");
    await expect(acceptCustomerAgentRequest({ ...input, sourceMessageId: agentMessage.id }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a message from another organization's conversation", async () => {
    const mine = await seedSupport();
    const theirs = await seedSupport();
    await expect(acceptCustomerAgentRequest({ ...mine, sourceMessageId: theirs.sourceMessageId }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("advances the thread's open task instead of opening a second beside it", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    const claim = await claimAgentTask({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: (await db.agentRequest.findFirstOrThrow({
        where: { organizationId: input.organizationId },
      })).id,
      settlement: { status: "waiting_approval", proposal: {
        instruction: "Refund them", sourceRequestIds: [],
        rawToolCalls: [{ id: "t1", name: "create_refund", input: { order_id: "1" } }],
      } },
    });
    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(parked.status).toBe("waiting_approval");
    expect(parked.activeProposalId).not.toBeNull();

    const next = await createTestMessage(input.threadId, "Actually, cancel it");
    const later = await acceptCustomerAgentRequest({ ...input, sourceMessageId: next.id });
    expect(later.task.id).toBe(task.id);
    // The revision increment is the supersede: the parked proposal is no longer
    // what this task is waiting on.
    expect(later.task).toMatchObject({ status: "queued", revision: 1, activeProposalId: null });
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(2);
  });

  it("keeps independent classified topics as separate tasks", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    const next = await createTestMessage(input.threadId, "Also, where is order 2002?");
    const second = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: next.id,
      continuity: { ask: "order_status", order: "#2002", subject: null },
    });

    expect(second.task.id).not.toBe(first.task.id);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(2);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: first.task.id } })).revision).toBe(0);
  });

  it("does not supersede a parked task when runtime-v2 classification is absent", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuityMode: "classified",
      continuity: { ask: "return", order: "#1001", subject: null },
    });
    const terseMessage = await createTestMessage(input.threadId, "Yes, that one");
    const terse = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: terseMessage.id,
      continuityMode: "classified",
    });

    expect(terse.task.id).not.toBe(first.task.id);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: first.task.id } })).revision).toBe(0);
  });

  it("continues the exact task when its customer answers a durable question", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuityMode: "classified",
      continuity: { ask: "address_change", order: "#1001", subject: null },
    });
    const claim = await claimAgentTask({
      organizationId: input.organizationId,
      taskId: first.task.id,
      expectedRevision: first.task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: input.organizationId,
      taskId: first.task.id,
      expectedRevision: first.task.revision,
      claimToken: claim!.claimToken,
      requestId: first.request.id,
      settlement: {
        status: "waiting_input",
        question: "What is the full postal code?",
        answerer: { kind: "customer", key: first.task.initiatingActorKey },
      },
    });

    const answer = await createTestMessage(input.threadId, "It is 94107");
    const resumed = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: answer.id,
      continuityMode: "classified",
    });

    expect(resumed.task.id).toBe(first.task.id);
    expect(resumed.task).toMatchObject({ status: "queued", revision: 1 });
    expect((resumed.task.checkpoint as { sourceRequestIds: string[] }).sourceRequestIds)
      .toEqual([first.request.id, resumed.request.id]);
  });

  it("returns to the one task matching the classified topic and entity", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    const otherMessage = await createTestMessage(input.threadId, "Where is order 2002?");
    await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: otherMessage.id,
      continuity: { ask: "order_status", order: "#2002", subject: null },
    });
    const returnMessage = await createTestMessage(input.threadId, "Back to returning order 1001");
    const resumed = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: returnMessage.id,
      continuity: { ask: "return", order: "#1001", subject: null },
    });

    expect(resumed.task.id).toBe(first.task.id);
    expect(resumed.task.revision).toBe(1);
    expect((resumed.task.checkpoint as { sourceRequestIds: string[] }).sourceRequestIds).toEqual([
      first.request.id,
      resumed.request.id,
    ]);
  });

  it("keeps two items on the same order separate and resumes only the named item", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    const secondMessage = await createTestMessage(input.threadId, "I also need to return the black shoes from that order");
    const second = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: secondMessage.id,
      continuity: { ask: "return", order: "#1001", subject: "black shoes" },
    });
    expect(second.task.id).not.toBe(first.task.id);

    const followUp = await createTestMessage(input.threadId, "About the blue shirt on order 1001");
    const resumed = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: followUp.id,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    expect(resumed.task.id).toBe(first.task.id);
    expect(resumed.task.revision).toBe(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: second.task.id } })).revision).toBe(0);

    const terse = await createTestMessage(input.threadId, "Yes, that one");
    const ambiguous = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: terse.id,
      continuityMode: "classified",
      continuity: { ask: "return", order: "#1001", subject: null },
    });
    expect(ambiguous.task.id).not.toBe(first.task.id);
    expect(ambiguous.task.id).not.toBe(second.task.id);
  });

  it("does not choose between two tasks for an ambiguous terse follow-up", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: null, subject: "blue shirt" },
    });
    const secondMessage = await createTestMessage(input.threadId, "I also need to return the black shoes");
    const second = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: secondMessage.id,
      continuity: { ask: "return", order: null, subject: "black shoes" },
    });
    const ambiguousMessage = await createTestMessage(input.threadId, "Yes, that one");
    const ambiguous = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: ambiguousMessage.id,
      continuity: { ask: "return", order: null, subject: null },
    });

    expect(new Set([first.task.id, second.task.id, ambiguous.task.id]).size).toBe(3);
    const originals = await db.agentTask.findMany({
      where: { id: { in: [first.task.id, second.task.id] } },
      select: { revision: true },
    });
    expect(originals).toEqual([{ revision: 0 }, { revision: 0 }]);
  });

  it("opens a new task rather than replaying one that reached a provider", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    await db.agentAction.create({ data: {
      organizationId: input.organizationId, threadId: input.threadId, taskId: task.id,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1, operationId: randomUUID(), actionIndex: 0,
    } });
    const next = await createTestMessage(input.threadId, "Any update?");
    const later = await acceptCustomerAgentRequest({ ...input, sourceMessageId: next.id });
    expect(later.task.id).not.toBe(task.id);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(0);
  });

  it("opens a new task rather than resetting a completed one", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    await db.agentTask.update({ where: { id: task.id }, data: { status: "completed" } });
    const next = await createTestMessage(input.threadId, "One more thing");
    const later = await acceptCustomerAgentRequest({ ...input, sourceMessageId: next.id });
    expect(later.task.id).not.toBe(task.id);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(2);
  });

  // The durable task worker runs a member's own request and fails anything else
  // as invalid_task_owner, so its recovery sweep must not find support work.
  it("keeps customer-initiated work out of the member task queue", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    expect(task.status).toBe("queued");
    const memberInput = await seed();
    const memberRequest = await acceptMemberAgentRequest(memberInput);
    const memberTask = await attachMemberAgentTask({
      ...memberInput, requestId: memberRequest.request.id, budget,
    });
    const queued = (await findQueuedAgentTasks(100)).map(row => row.id);
    // Both are queued; only the member's belongs to that worker's queue.
    expect(queued).toContain(memberTask.id);
    expect(queued).not.toContain(task.id);
  });

  it("parks a support question on every member rather than on the customer", async () => {
    const input = await seedSupport();
    const { request, task } = await acceptCustomerAgentRequest(input);
    const claim = await claimAgentTask({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    expect(await settleAgentTaskClaim({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_input", question: "Do you want to refund this one?",
        answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    })).toBe(true);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "waiting_input",
      pendingQuestion: "Do you want to refund this one?",
      pendingAnswererKind: "member",
      pendingAnswererKey: ANY_MEMBER_ACTOR_KEY,
    });
  });
});
