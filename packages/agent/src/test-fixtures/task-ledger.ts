// Seeded member tasks shared by the task-ledger integration suites.
import { randomUUID } from "node:crypto";
import { db } from "@shopkeeper/db";
import { createTestOrg, createTestCustomer, createTestThread } from "@shopkeeper/db/test-helpers";
import { acceptMemberAgentRequest, attachMemberAgentTask } from "../task-ledger/index.js";

export const orgIds: string[] = [];
export const budget = { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n };
export async function seed() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: randomUUID() } });
  const customer = await createTestCustomer(org.id, randomUUID());
  const thread = await createTestThread(org.id, customer.id, "operator");
  await db.thread.update({ where: { id: thread.id }, data: { operatorKey: `member:${member.id}` } });
  return {
    organizationId: org.id, clerkUserId: member.clerkUserId, threadId: thread.id,
    dedupeKey: randomUUID(), instruction: "Find the order and check its status", member,
  };
}
export async function seedTask() {
  const input = await seed();
  const { request } = await acceptMemberAgentRequest(input);
  const task = await attachMemberAgentTask({ ...input, requestId: request.id, budget });
  return { input, request, task };
}
export function proposalData(task: { id: string; organizationId: string; revision: number }) {
  return {
    organizationId: task.organizationId, taskId: task.id, taskRevision: task.revision,
    schemaVersion: 1, instruction: "Find the order and check its status",
    canonicalActions: [], dependencies: [], proposalHash: "a".repeat(64),
    sourceRequestIds: [],
    approverScopeKind: "member" as const, approverScopeKey: `member:${task.id}`,
  };
}
