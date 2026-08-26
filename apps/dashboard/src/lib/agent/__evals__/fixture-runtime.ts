import { randomUUID } from "node:crypto"
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
import { emptyIntents, emptyRequestFacts } from "@shopkeeper/agent/classifier-signals"
import {
  CONTEXT_BUDGETS,
  budgetKbArticles,
  budgetRecentMessages,
  truncateContextText,
} from "@shopkeeper/agent/context-budget"
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
import { isInvalidPlan } from "@shopkeeper/agent/plan-validation"
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
  const recentMessages = setup.messages.map(message => ({
    senderType: message.senderType,
    contentText: message.contentText,
  }))
  const kbArticles = setup.kbArticles ?? []
  return {
    orgId,
    orgName: "Test Store",
    ...(setup.authState ? { authState: setup.authState } : {}),
    ...(setup.verifiedOrders ? { verifiedOrders: setup.verifiedOrders } : {}),
    thread: {
      id: threadId,
      status: "open",
      channelType: setup.channelType,
      tag: setup.tag ?? "Support",
      aiSummary: setup.aiSummary
        ? truncateContextText(setup.aiSummary, CONTEXT_BUDGETS.priorSummaryChars)
        : null,
      shopifyCustomerId: setup.shopifyCustomerId ?? null,
    },
    // Built here rather than in the fixture so the JSON only has to name the
    // intents that fired. Left undefined when the fixture declares none, which
    // keeps "the classifier never ran" a distinct, testable state.
    ...(setup.classifierIntents
      ? {
          classifierSignals: {
            // Keep aligned with email-classification.ts. Routing is tolerant of
            // old versions, but evals should model the shape production writes.
            version: 5,
            language: "en",
            intents: { ...emptyIntents(), ...setup.classifierIntents },
            requestFacts: emptyRequestFacts(),
          },
        }
      : {}),
    customer: {
      id: customerId,
      name: setup.customerName ?? null,
      platformId: setup.customerPlatformId ?? "customer@test.com",
    },
    recentMessages: budgetRecentMessages(recentMessages).messages,
    openThreadCount: setup.openThreadCount ?? 1,
    shopify: setup.shopify ?? null,
    recentOrders: setup.recentOrders ?? [],
    linkedShopifyCustomerName: setup.linkedShopifyCustomerName ?? null,
    kbArticles: budgetKbArticles(kbArticles).articles,
    merchantPreferences: (setup.merchantPreferences ?? []).map((preference) => ({
      id: preference.id ?? randomUUID(),
      category: preference.category,
      guidance: preference.guidance,
    })),
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
  if (isInvalidPlan(plan)) {
    throw new Error("Eval runtime refused to execute an invalid agent plan")
  }
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
