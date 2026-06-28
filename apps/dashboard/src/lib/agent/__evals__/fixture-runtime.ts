import {
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers"
import {
  SenderType,
  db,
  type DbChannelType,
  type DbSenderType,
} from "@shopkeeper/db"
import type { AgentContext, AgentActionMode } from "@shopkeeper/agent/context"
import {
  hashInstruction,
  hashPlan,
  type AgentActionApproval,
} from "@shopkeeper/agent/agent-actions"
import { runAgent, type RunAgentOptions } from "../run"
import {
  addInternalNote,
  escalateToHuman,
  sendEmail,
  sendReply,
  updateThreadStatus,
  updateThreadTag,
} from "../tools/thread"
import type { AgentPlan, OrgSettings } from "@/types"
import type { ExpectedAgentAction, Fixture } from "./types"

const SENDER_TYPE_MAP: Record<string, DbSenderType> = {
  customer: SenderType.customer,
  agent: SenderType.agent,
  ai: SenderType.ai,
  note: SenderType.note,
}

function buildContext(
  fixture: Fixture,
  orgId: string,
  threadId: string,
  customerId: string,
): AgentContext {
  const { setup } = fixture
  const toolContext = { threadId, orgId, orgName: "Test Store" }
  return {
    orgId,
    orgName: "Test Store",
    thread: {
      id: threadId,
      status: "open",
      channelType: setup.channelType,
      tag: setup.tag ?? "Support",
      aiSummary: setup.aiSummary ?? null,
      shopifyCustomerId: setup.shopifyCustomerId ?? null,
    },
    customer: {
      id: customerId,
      name: setup.customerName ?? null,
      platformId: setup.customerPlatformId ?? "customer@test.com",
    },
    recentMessages: setup.messages.map(message => ({
      senderType: message.senderType,
      contentText: message.contentText,
    })),
    openThreadCount: setup.openThreadCount ?? 1,
    pastTickets: setup.pastTickets ?? [],
    shopify: setup.shopify ?? null,
    recentOrders: setup.recentOrders ?? [],
    linkedShopifyCustomerName: setup.linkedShopifyCustomerName ?? null,
    kbArticles: setup.kbArticles ?? [],
    escalate: reason => escalateToHuman({ reason }, toolContext).then(() => {}),
    io: {
      addInternalNote: input => addInternalNote(input, toolContext),
      sendReply: input => sendReply(input, toolContext),
      sendEmail: input => sendEmail(input, toolContext),
      updateThreadStatus: input => updateThreadStatus(input, toolContext),
      updateThreadTag: input => updateThreadTag(input, toolContext),
    },
  }
}

export async function createFixtureEnvironment(
  fixture: Fixture,
  onOrgCreated?: (orgId: string) => void,
) {
  const org = await createTestOrg()
  onOrgCreated?.(org.id)
  const customer = await createTestCustomer(
    org.id,
    fixture.setup.customerPlatformId ?? "customer@test.com",
    fixture.setup.customerName ? { name: fixture.setup.customerName } : {},
  )
  const thread = await createTestThread(
    org.id,
    customer.id,
    fixture.setup.channelType as DbChannelType,
    { tag: fixture.setup.tag },
  )
  for (const message of fixture.setup.messages) {
    const sender = SENDER_TYPE_MAP[message.senderType] ?? SenderType.customer
    await createTestMessage(thread.id, message.contentText, sender)
  }
  return {
    orgId: org.id,
    threadId: thread.id,
    ctx: buildContext(fixture, org.id, thread.id, customer.id),
  }
}

export function inferRunMode(expected: ExpectedAgentAction[]): AgentActionMode {
  return expected[0]?.mode ?? "read_only"
}

export function isJudgeEnabled(): boolean {
  const flag = process.env.RUN_JUDGE_EVALS
  if (flag !== undefined) {
    const normalized = flag.trim().toLowerCase()
    return normalized !== "" && normalized !== "0" && normalized !== "false"
  }
  return !process.env.CI
}

export async function executeRunForFixture(params: {
  ctx: AgentContext
  fixture: Fixture
  plan: AgentPlan
  mode: AgentActionMode
  settings: OrgSettings
}): Promise<void> {
  const { ctx, fixture, plan, mode, settings } = params
  const approvedToolCalls = mode === "read_only" || plan.rawToolCalls.length === 0
    ? undefined
    : plan.rawToolCalls
  const options: RunAgentOptions = { mode }
  if (mode === "read_only") options.readOnly = true
  if (mode === "human_approved") {
    const approval: AgentActionApproval = {
      approverId: "eval_runner:Eval Runner",
      approvedAt: new Date(),
      approvedPlanHash: hashPlan(plan),
      instructionHash: hashInstruction(fixture.instruction),
    }
    options.approval = approval
  }
  await runAgent(ctx, fixture.instruction, approvedToolCalls, settings, options)
}

export async function fetchObservedAgentActions(
  orgId: string,
  threadId: string,
): Promise<ExpectedAgentAction[]> {
  const rows = await db.agentAction.findMany({
    where: { organizationId: orgId, threadId },
    orderBy: { executedAt: "asc" },
    select: { tool: true, status: true, mode: true },
  })
  return rows.map(row => ({
    tool: row.tool,
    status: row.status as ExpectedAgentAction["status"],
    mode: row.mode as ExpectedAgentAction["mode"],
  }))
}
