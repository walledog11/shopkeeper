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
import { ConflictError, ForbiddenError } from "./errors.js";
import { authorizeAgentProposal } from "./task-approval.js";
import { buildAgentPlanCacheRecord } from "./plan-cache.js";
import {
  ANY_MEMBER_ACTOR_KEY,
  acceptCustomerAgentRequest,
  acceptTicketAgentRequest,
  acceptMemberAgentRequest,
  attachMemberAgentTask,
  getMemberAgentRequest,
  listMemberAgentRequests,
  claimAgentTask,
  claimContinuedAgentTask,
  findQueuedAgentTasks,
  settleAgentTaskClaim,
} from "./task-ledger/index.js";
import { budget, orgIds, seed } from "./test-fixtures/task-ledger.js";

afterEach(async () => {
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe("scoped question continuation", () => {
  async function park(input: Awaited<ReturnType<typeof seed>>) {
    const { request } = await acceptMemberAgentRequest({ ...input, dedupeKey: randomUUID() });
    const task = await attachMemberAgentTask({ ...input, requestId: request.id, budget });
    const claim = await claimAgentTask({
      organizationId: task.organizationId, taskId: task.id, expectedRevision: 0,
    });
    await settleAgentTaskClaim({
      organizationId: task.organizationId, taskId: task.id, expectedRevision: 0,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: { status: "waiting_input", question: "Which order did they mean?" },
    });
    return { request, task };
  }
  function answer(input: Awaited<ReturnType<typeof seed>>) {
    return acceptMemberAgentRequest({
      ...input, dedupeKey: randomUUID(), instruction: "The black one", budget,
    });
  }

  it("continues the task its answer belongs to instead of opening a second one", async () => {
    const input = await seed();
    const { task } = await park(input);
    const answered = await answer(input);
    expect(answered.task?.id).toBe(task.id);
    expect(answered.request.taskId).toBe(task.id);
    expect(answered.request.state).toBe("attached");
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    // A fresh revision invalidates the parked attempt's claim and names nothing
    // to wait on, so the resumed attempt runs the answer rather than the question.
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "queued", revision: 1, pendingQuestionId: null, pendingQuestion: null,
      pendingAnswererKind: null, pendingAnswererKey: null,
    });
  });

  it("leaves a question parked for another actor unanswered", async () => {
    const input = await seed();
    const { task } = await park(input);
    await db.agentTask.update({
      where: { id: task.id }, data: { pendingAnswererKey: `member:${randomUUID()}` },
    });
    const answered = await answer(input);
    expect(answered.task?.id).not.toBe(task.id);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "waiting_input", revision: 0, pendingQuestion: "Which order did they mean?" });
  });

  it("resumes neither task when two parked questions make the answer ambiguous", async () => {
    const input = await seed();
    const first = await park(input);
    const second = await park(input);
    const answered = await answer(input);
    expect([first.task.id, second.task.id]).not.toContain(answered.task?.id);
    expect(await db.agentTask.count({
      where: { organizationId: input.organizationId, status: "waiting_input" },
    })).toBe(2);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(3);
  });

  it("does not attach an answer to work no worker may claim", async () => {
    const input = await seed();
    const { task } = await park(input);
    await db.agentAction.create({ data: {
      organizationId: task.organizationId, threadId: task.threadId, taskId: task.id,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1, operationId: randomUUID(), actionIndex: 0,
    } });
    expect((await answer(input)).task?.id).not.toBe(task.id);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("waiting_input");
  });

  it("resumes once when two answers race for one parked question", async () => {
    const input = await seed();
    const { task } = await park(input);
    const answers = await Promise.all([answer(input), answer(input)]);
    expect(answers.filter((result) => result.task?.id === task.id)).toHaveLength(1);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(2);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(1);
  });
});

describe("support question continuation", () => {
  async function seedAnswerable() {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "Where is my order?");
    // Two members, and the one that answers is never the one the attempt named:
    // a support question is pushed to every bound operator at once.
    const asked = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const answering = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id,
      objective: "Handle this customer's latest request", budget,
    });
    return {
      organizationId: org.id, threadId: thread.id, clerkUserId: answering.clerkUserId,
      endsWait: "question" as const, asked, answering, request, task,
    };
  }

  function current(seeded: Awaited<ReturnType<typeof seedAnswerable>>) {
    return { taskId: seeded.task.id, requestId: seeded.request.id };
  }

  // Runs one attempt on a support task and leaves it parked on a question, the
  // way the planning job does.
  async function park(
    seeded: { organizationId: string },
    on: { taskId: string; requestId: string },
    answerer = { kind: "member" as const, key: ANY_MEMBER_ACTOR_KEY },
  ) {
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: on.taskId } });
    const claim = await claimAgentTask({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: on.requestId,
      settlement: { status: "waiting_input", question: "Do we refund this one?", answerer },
    });
    return task.id;
  }

  it("lets any bound member end a support wait and claims the task for their answer", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    const continued = await claimContinuedAgentTask(seeded);
    expect(continued).toMatchObject({ taskId, requestId: seeded.request.id, expectedRevision: 1 });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: "running", revision: 1, claimToken: continued!.claimToken,
      pendingQuestionId: null, pendingQuestion: null,
      pendingAnswererKind: null, pendingAnswererKey: null,
    });
    // The claim it returns is the one the re-plan settles on.
    expect(await settleAgentTaskClaim({
      ...continued!, requestId: continued!.requestId, settlement: { status: "completed" },
    })).toBe(true);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("completed");
  });

  it("accepts the merchant answer as a durable request before continuing the task", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    const continued = await claimContinuedAgentTask({
      ...seeded,
      continuationInstruction: "Yes, refund this one.",
      continuationChannel: "operator",
    });

    expect(continued).toMatchObject({ taskId, expectedRevision: 1 });
    expect(continued!.requestId).not.toBe(seeded.request.id);
    expect(await db.agentRequest.findUniqueOrThrow({
      where: { id: continued!.requestId },
    })).toMatchObject({
      organizationId: seeded.organizationId,
      threadId: seeded.threadId,
      taskId,
      actorKind: "member",
      actorKey: `member:${seeded.answering.id}`,
      channel: "operator",
      state: "attached",
      normalizedInstruction: "Yes, refund this one.",
      sourceMessageId: seeded.request.sourceMessageId,
    });
  });

  it("refuses an answer from outside the organization", async () => {
    const seeded = await seedAnswerable();
    await park(seeded, current(seeded));
    const otherOrg = await createTestOrg();
    orgIds.push(otherOrg.id);
    const outsider = await db.orgMember.create({
      data: { organizationId: otherOrg.id, clerkUserId: randomUUID() },
    });
    await expect(claimContinuedAgentTask({
      ...seeded, clerkUserId: outsider.clerkUserId,
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).status)
      .toBe("waiting_input");
  });

  it("leaves a question scoped to one member for that member alone", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded), { kind: "member", key: `member:${seeded.asked.id}` });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: "waiting_input", revision: 0, pendingQuestion: "Do we refund this one?",
    });
    // The member it was actually asked of still ends it.
    expect(await claimContinuedAgentTask({
      ...seeded, clerkUserId: seeded.asked.clerkUserId,
    })).toMatchObject({ taskId });
  });

  it("continues neither task when two parked questions make the answer ambiguous", async () => {
    const seeded = await seedAnswerable();
    // A thread runs one task at a time, so the second message only opens a
    // second task while the first is claimed — which is the state that lets one
    // conversation hold two parked questions at all.
    const held = await claimAgentTask({
      organizationId: seeded.organizationId, taskId: seeded.task.id, expectedRevision: 0,
    });
    const second = await createTestMessage(seeded.threadId, "Actually, also this");
    const other = await acceptCustomerAgentRequest({
      organizationId: seeded.organizationId, threadId: seeded.threadId,
      sourceMessageId: second.id, objective: "Handle the follow-up", budget,
    });
    expect(other.task.id).not.toBe(seeded.task.id);
    await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: seeded.task.id, expectedRevision: 0,
      claimToken: held!.claimToken, requestId: seeded.request.id,
      settlement: {
        status: "waiting_input", question: "Do we refund this one?",
        answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    await park(seeded, { taskId: other.task.id, requestId: other.request.id });

    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect(await db.agentTask.count({
      where: { organizationId: seeded.organizationId, status: "waiting_input" },
    })).toBe(2);
  });

  it("does not replay a task that already reached a provider", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    await db.agentAction.create({ data: {
      organizationId: seeded.organizationId, threadId: seeded.threadId, taskId,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1, operationId: randomUUID(), actionIndex: 0,
    } });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status)
      .toBe("waiting_input");
  });

  it("claims once when two members answer the same question at the same time", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    const claims = await Promise.all([
      claimContinuedAgentTask(seeded),
      claimContinuedAgentTask({ ...seeded, clerkUserId: seeded.asked.clerkUserId }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).revision).toBe(1);
  });

  it("does not treat an approval wait as a question", async () => {
    const seeded = await seedAnswerable();
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } });
    const claim = await claimAgentTask({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: seeded.request.id,
      settlement: {
        status: "waiting_approval",
        proposal: {
          instruction: "Handle this customer's latest request",
          rawToolCalls: [{ id: "tc1", name: "create_refund", input: { order_id: "1" } }],
          sourceRequestIds: [seeded.request.id],
        },
        approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status)
      .toBe("waiting_approval");
  });
});

describe("support approval-wait continuation", () => {
  const card = [{ id: "tc1", name: "create_refund", input: { order_id: "1" } }];
  const objective = "Handle this customer's latest request";

  // A support conversation parked on a card, the way the planning job leaves
  // one: the customer initiated it, and the card went to every bound operator.
  async function seedReviseable(options: { scopeToDrafter?: boolean; runtimeVersion?: number } = {}) {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "This is the wrong size");
    const drafted = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const revising = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id,
      objective, budget: { ...budget, runtimeVersion: options.runtimeVersion ?? budget.runtimeVersion },
    });
    const claim = await claimAgentTask({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    });
    const proposalId = randomUUID();
    await settleAgentTaskClaim({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_approval",
        proposal: { proposalId, instruction: objective, rawToolCalls: card, sourceRequestIds: [request.id] },
        approver: {
          kind: "member",
          key: options.scopeToDrafter ? `member:${drafted.id}` : ANY_MEMBER_ACTOR_KEY,
        },
      },
    });
    return {
      organizationId: org.id, threadId: thread.id, clerkUserId: revising.clerkUserId,
      endsWait: "proposal" as const, drafted, revising, request, task, proposalId, message,
    };
  }

  it("lets any bound member end an approval wait and supersede the card they revised", async () => {
    const seeded = await seedReviseable();
    const continued = await claimContinuedAgentTask(seeded);
    expect(continued).toMatchObject({
      taskId: seeded.task.id, requestId: seeded.request.id, expectedRevision: 1,
    });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).toMatchObject({
      status: "running", revision: 1, claimToken: continued!.claimToken, activeProposalId: null,
    });
    // The card stops being approvable, which is what keeps a merchant who still
    // has it on another device from running the draft they just replaced.
    const superseded = await db.agentProposal.findUniqueOrThrow({ where: { id: seeded.proposalId } });
    expect(superseded.status).toBe("superseded");
    expect(superseded.decidedAt).not.toBeNull();
    await expect(authorizeAgentProposal({
      organizationId: seeded.organizationId, clerkUserId: seeded.clerkUserId,
      proposalId: seeded.proposalId, instruction: objective, approvedToolCalls: card,
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it("queues composer regeneration on the waiting support task, retaining its budget and invalidating the old approval", async () => {
    const seeded = await seedReviseable({ runtimeVersion: 2 });
    await db.agentTask.update({ where: { id: seeded.task.id }, data: { modelCallsUsed: 3, activeTimeMsUsed: 250, spentNanoUsd: 123n } });
    const input = { ...seeded, dedupeKey: randomUUID(), instruction: "Actually, draft a return instead", force: true, budget };
    const results = await Promise.all([acceptTicketAgentRequest(input), acceptTicketAgentRequest(input)]);
    expect(new Set(results.map(result => result.request.id)).size).toBe(1);
    expect(results.filter(result => !result.deduplicated)).toHaveLength(1);
    const continued = results[0];
    expect(continued.task).toMatchObject({ id: seeded.task.id, status: "queued", revision: 1, runtimeVersion: 2, modelCallsUsed: 3, activeTimeMsUsed: 250, spentNanoUsd: 123n, activeProposalId: null });
    expect(continued.request.sourceMessageId).toBe(seeded.message.id);
    expect(await findQueuedAgentTasks()).toContainEqual(expect.objectContaining({ id: seeded.task.id, revision: 1 }));
    expect(await getMemberAgentRequest({ ...seeded, requestId: continued.request.id })).not.toBeNull();
    await expect(authorizeAgentProposal({ ...seeded, proposalId: seeded.proposalId, instruction: objective, approvedToolCalls: card })).rejects.toBeInstanceOf(ConflictError);
    const claim = await claimAgentTask({ organizationId: seeded.organizationId, taskId: continued.task.id, expectedRevision: 1 });
    const cache = buildAgentPlanCacheRecord({ instruction: input.instruction, lastCustomerMessageId: seeded.message.id, settings: {}, plan: { instruction: input.instruction, steps: [], rawToolCalls: card } });
    expect(await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: continued.task.id, expectedRevision: 1,
      claimToken: claim!.claimToken, requestId: continued.request.id,
      settlement: { status: "waiting_approval", approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY }, proposal: { proposalId: cache.planId!, instruction: input.instruction, rawToolCalls: card, sourceRequestIds: [continued.request.id] } },
      planCache: { threadId: seeded.threadId, sourceMessageId: seeded.message.id, cache },
    })).toBe(true);
    const published = await db.thread.findUniqueOrThrow({ where: { id: seeded.threadId } });
    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: continued.task.id } });
    expect(published.cachedPlan).toMatchObject({ planId: parked.activeProposalId });
    const history = await listMemberAgentRequests(seeded);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: continued.request.id,
      task: { id: continued.task.id, activeProposal: { id: parked.activeProposalId } },
      thread: { cachedPlan: { planId: parked.activeProposalId } },
    });
    expect(await listMemberAgentRequests({ ...seeded, clerkUserId: seeded.drafted.clerkUserId })).toEqual([]);
    const foreign = await seedReviseable();
    await expect(listMemberAgentRequests({ ...seeded, threadId: foreign.threadId })).rejects.toBeInstanceOf(ForbiddenError);
    await db.orgMember.delete({ where: { id: seeded.revising.id } });
    await expect(listMemberAgentRequests(seeded)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("orders composer regeneration against a concurrent approval without changing work that was approved", async () => {
    const seeded = await seedReviseable();
    const [approval, regeneration] = await Promise.allSettled([
      authorizeAgentProposal({ ...seeded, proposalId: seeded.proposalId, instruction: objective, approvedToolCalls: card }),
      acceptTicketAgentRequest({ ...seeded, dedupeKey: randomUUID(), instruction: "Draft a return instead", force: true, budget }),
    ]);
    expect([approval, regeneration].filter(result => result.status === "fulfilled")).toHaveLength(1);
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } });
    expect(task.revision).toBe(approval.status === "fulfilled" ? 0 : 1);
    const rejected = approval.status === "rejected" ? approval : regeneration;
    expect(rejected.status === "rejected" && rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("refuses guidance from outside the organization", async () => {
    const seeded = await seedReviseable();
    const otherOrg = await createTestOrg();
    orgIds.push(otherOrg.id);
    const outsider = await db.orgMember.create({
      data: { organizationId: otherOrg.id, clerkUserId: randomUUID() },
    });
    await expect(claimContinuedAgentTask({
      ...seeded, clerkUserId: outsider.clerkUserId,
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).status)
      .toBe("waiting_approval");
  });

  it("leaves a card scoped to one member for that member alone", async () => {
    const seeded = await seedReviseable({ scopeToDrafter: true });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).status)
      .toBe("waiting_approval");
    // The member it was actually shown to still ends it.
    expect(await claimContinuedAgentTask({
      ...seeded, clerkUserId: seeded.drafted.clerkUserId,
    })).toMatchObject({ taskId: seeded.task.id });
  });

  it("does not re-draft a card whose approval already decided it", async () => {
    const seeded = await seedReviseable();
    expect(await authorizeAgentProposal({
      organizationId: seeded.organizationId, clerkUserId: seeded.clerkUserId,
      proposalId: seeded.proposalId, instruction: objective, approvedToolCalls: card,
    })).not.toBeNull();
    // Approval leaves the task `waiting_approval` until the run completes, and
    // does not move its revision, so the proposal's own status is the only thing
    // that stops guidance from claiming a task that is about to execute.
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).toMatchObject({
      status: "waiting_approval", activeProposalId: seeded.proposalId,
    });
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: seeded.proposalId } })).status)
      .toBe("approved");
  });

  it("does not treat a parked question as a card", async () => {
    const seeded = await seedReviseable();
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } });
    const claim = await claimContinuedAgentTask(seeded);
    await settleAgentTaskClaim({
      ...claim!, requestId: claim!.requestId,
      settlement: {
        status: "waiting_input", question: "Which size did they want?",
        answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status)
      .toBe("waiting_input");
  });

  it("claims once when two members revise the same card at the same time", async () => {
    const seeded = await seedReviseable();
    const claims = await Promise.all([
      claimContinuedAgentTask(seeded),
      claimContinuedAgentTask({ ...seeded, clerkUserId: seeded.drafted.clerkUserId }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).revision).toBe(1);
  });

  it("supersedes the card when a later customer message advances the task instead", async () => {
    const seeded = await seedReviseable();
    const second = await createTestMessage(seeded.threadId, "Actually, make it the black one");
    const advanced = await acceptCustomerAgentRequest({
      organizationId: seeded.organizationId, threadId: seeded.threadId,
      sourceMessageId: second.id, objective, budget,
    });
    expect(advanced.task.id).toBe(seeded.task.id);
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: seeded.proposalId } })).status)
      .toBe("superseded");
  });
});
