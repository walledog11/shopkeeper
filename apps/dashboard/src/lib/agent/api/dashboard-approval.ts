import { randomUUID } from "node:crypto";
import { createMessage, db, Prisma } from "@shopkeeper/db";
import { buildContext, hashInstructionForLog, planAgent } from "@/lib/agent/runner";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { classifyHomePlan } from "@shopkeeper/agent/plan-preview";
import {
  isAutoExecuteEnabled,
} from "@/lib/agent/api/plan-execution";
import { resolvePlanExecutionLedgerMode } from "@shopkeeper/agent/plan-execution";
import {
  claimPlanExecution,
  claimStoredPlanExecution,
  completePlanExecution,
  observePlanExecution,
  type PlanExecutionIdentity,
} from "@shopkeeper/agent/execution-ledger";
import { hashInstruction, hashPlan } from "@shopkeeper/agent/agent-actions";
import { ConflictError } from "@shopkeeper/agent/errors";
import { TOOL_CATEGORIES } from "@shopkeeper/agent/tools";
import logger from "@/lib/server/logger";
import type { AgentPlan, OrgSettings, RawToolCall } from "@/types";
import type { AgentResult } from "@shopkeeper/agent/context";
import { captureAgentPlanGenerated } from "@/lib/server/product-analytics";

const APPROVAL_INTENT_RE =
  /\b(create|place|make|refund|issue\s+a?\s*refund|cancel|update|change|edit|swap|remove|add|note|email|send|close|tag)\b/i;
const APPROVAL_RE = /^(yes|y|yeah|yep|approve|approved|confirm|confirmed|go ahead|do it|create it|place it|run it|looks good|that works|proceed|yes please|please do)$/i;
const APPROVAL_WITH_EDIT_RE = /\b(but|except|instead|change|edit|update|different|switch|swap|make it)\b/i;
const DISMISS_RE = /^(no|nope|cancel|never mind|nevermind|stop|discard|don't|do not|no thanks)$/i;
const DASHBOARD_PENDING_APPROVAL_VERSION = 1;

export const DASHBOARD_APPROVAL_DISMISS_SUMMARY = "No problem. I won't create the order.";

export interface DashboardPendingApproval {
  kind: "dashboard_pending_approval";
  version: number;
  instruction: string;
  instructionHash: string;
  summary: string;
  plan: AgentPlan;
  planId?: string;
  createdAt: string;
}

export type DashboardApprovalReplyKind = "approve" | "dismiss" | "revise";

// Every autonomy tier plans an action instruction before executing: watch/guarded
// hold for approval, and the auto-execute tiers still route through planning (the
// classifier + autoExecuteMode gate decide whether to fire). So this reduces to
// "does the instruction ask for an action" — no per-tier branch is meaningful.
export function shouldPlanBeforeExecuting(instruction: string): boolean {
  return APPROVAL_INTENT_RE.test(instruction);
}

function normalizeApprovalReply(instruction: string): string {
  return instruction
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function isApprovalReply(instruction: string): boolean {
  const normalized = normalizeApprovalReply(instruction);
  return APPROVAL_RE.test(normalized) && !APPROVAL_WITH_EDIT_RE.test(normalized);
}

function isDismissReply(instruction: string): boolean {
  return DISMISS_RE.test(normalizeApprovalReply(instruction));
}

export function getDashboardApprovalReplyKind(instruction: string): DashboardApprovalReplyKind {
  if (isApprovalReply(instruction)) return "approve";
  if (isDismissReply(instruction)) return "dismiss";
  return "revise";
}

export function readDashboardPendingApproval(value: unknown): DashboardPendingApproval | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DashboardPendingApproval>;
  if (
    candidate.kind !== "dashboard_pending_approval" ||
    candidate.version !== DASHBOARD_PENDING_APPROVAL_VERSION ||
    typeof candidate.instruction !== "string" ||
    typeof candidate.instructionHash !== "string" ||
    typeof candidate.summary !== "string" ||
    !candidate.plan ||
    typeof candidate.plan !== "object"
  ) {
    return null;
  }
  return candidate as DashboardPendingApproval;
}

async function loadDashboardPendingApproval(threadId: string): Promise<DashboardPendingApproval | null> {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { cachedPlan: true },
  });
  return readDashboardPendingApproval(thread?.cachedPlan);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getDashboardActionCalls(plan: AgentPlan): RawToolCall[] {
  const actionStepIds = new Set(
    plan.steps.flatMap((step) => step.category === "action" ? [step.id] : [])
  );
  return plan.rawToolCalls.filter((toolCall) => (
    actionStepIds.has(toolCall.id) &&
    TOOL_CATEGORIES[toolCall.name] === "action"
  ));
}

interface VariantInfo {
  title: string;
  productTitle: string;
  price: string | null;
}

function buildVariantIndex(plan: AgentPlan): Map<string, VariantInfo> {
  const index = new Map<string, VariantInfo>();
  const readResults = plan.readResults ?? {};
  for (const toolCall of plan.rawToolCalls) {
    if (toolCall.name !== "search_shopify_products") continue;
    const raw = readResults[toolCall.id];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const product of parsed) {
        const productTitle = typeof product?.title === "string" ? product.title : "";
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        for (const variant of variants) {
          const variantId = typeof variant?.variant_id === "string" ? variant.variant_id : null;
          if (!variantId) continue;
          index.set(variantId, {
            title: typeof variant?.title === "string" ? variant.title : "",
            productTitle,
            price: typeof variant?.price === "string" ? variant.price : null,
          });
        }
      }
    } catch {
      // best-effort
    }
  }
  return index;
}

function describeLineItem(
  lineItem: Record<string, unknown>,
  variantIndex: Map<string, VariantInfo>,
  fallbackProductQuery: string | null
): { text: string; lineTotal: number | null } {
  const quantity = typeof lineItem.quantity === "number" ? lineItem.quantity : 1;
  const variantId = stringValue(lineItem.variant_id);
  const info = variantId ? variantIndex.get(variantId) : undefined;

  const productTitle = info?.productTitle || stringValue(lineItem.title) || fallbackProductQuery || "item";
  const variantLabel = info?.title && info.title.toLowerCase() !== "default title" ? info.title : null;
  const label = variantLabel ? `${productTitle} (${variantLabel})` : productTitle;

  const priceSource = info?.price ?? stringValue(lineItem.price);
  const unitPrice = priceSource !== null ? Number(priceSource) : NaN;
  const lineTotal = Number.isFinite(unitPrice) ? unitPrice * quantity : null;

  return { text: `${quantity}× ${label}`, lineTotal };
}

function formatAddress(input: Record<string, unknown>): string | null {
  const street = [stringValue(input.address1), stringValue(input.address2)].filter(Boolean).join(" ");
  const cityState = [stringValue(input.city), stringValue(input.province)].filter(Boolean).join(", ");
  const zip = stringValue(input.zip);
  const parts = [street, [cityState, zip].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function summarizeCreateOrderPlan(plan: AgentPlan, createOrderCall: RawToolCall): string {
  const input = asObject(createOrderCall.input);
  const firstName = stringValue(input.first_name);
  const lastName = stringValue(input.last_name);
  const email = stringValue(input.email);
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const customerLine = name
    ? email ? `${name} · ${email}` : name
    : email ?? "the customer";

  const variantIndex = buildVariantIndex(plan);
  const fallbackProductQuery = plan.rawToolCalls.reduce<string | null>((found, toolCall) => {
    if (found || toolCall.name !== "search_shopify_products") return found;
    return stringValue(asObject(toolCall.input).query);
  }, null);

  const rawLineItems = Array.isArray(input.line_items) ? input.line_items : [];
  const described = rawLineItems.map((item) =>
    describeLineItem(asObject(item), variantIndex, fallbackProductQuery)
  );

  const itemsText = described.map((d) => d.text).join(", ");
  const hasFullPricing = described.length > 0 && described.every((d) => d.lineTotal !== null);
  const total = hasFullPricing
    ? described.reduce((sum, d) => sum + (d.lineTotal ?? 0), 0)
    : null;
  const address = formatAddress(input);

  const rows: string[] = [];
  rows.push(`- Customer: ${customerLine}`);
  if (itemsText) rows.push(`- Item: ${itemsText}`);
  if (address) rows.push(`- Ship to: ${address}`);
  if (total !== null) rows.push(`- Total: $${total.toFixed(2)}`);

  return `Here's what I'll put together:\n\n${rows.join("\n")}\n\nReply yes to create it, or let me know what to change.`;
}

export function buildDashboardApprovalSummary(plan: AgentPlan): string {
  const createOrderCall = plan.rawToolCalls.find((toolCall) => toolCall.name === "create_shopify_order");
  if (createOrderCall) {
    return summarizeCreateOrderPlan(plan, createOrderCall);
  }

  const stepSummary = plan.steps
    .flatMap((step) => step.category === "action" ? [step.description] : [])
    .join("; ");
  return `I can run this action: ${stepSummary || "the requested Shopify update"}. Reply yes to continue, or let me know what to change.`;
}

async function storeDashboardPendingApproval(threadId: string, approval: DashboardPendingApproval) {
  await db.thread.update({
    where: { id: threadId },
    data: {
      cachedPlanMessageId: null,
      cachedPlan: approval as object,
    },
  });
}

export async function clearDashboardPendingApproval(threadId: string, expectedPlanId?: string) {
  await db.thread.updateMany({
    where: {
      id: threadId,
      ...(expectedPlanId
        ? { cachedPlan: { path: ["planId"], equals: expectedPlanId } }
        : {}),
    },
    data: {
      cachedPlanMessageId: null,
      cachedPlan: Prisma.DbNull,
    },
  });
}

async function persistDashboardExchange(threadId: string, userText: string, agentText: string) {
  await createMessage({
    threadId,
    senderType: "customer",
    contentText: userText,
  });
  await createMessage({
    threadId,
    senderType: "agent",
    contentText: agentText,
  });
}

export async function dismissDashboardPendingApproval(
  threadId: string,
  instruction: string,
  expectedPlanId?: string,
): Promise<string> {
  await clearDashboardPendingApproval(threadId, expectedPlanId);
  await persistDashboardExchange(threadId, instruction, DASHBOARD_APPROVAL_DISMISS_SUMMARY);
  return DASHBOARD_APPROVAL_DISMISS_SUMMARY;
}

export function buildRevisedDashboardInstruction(pendingApproval: DashboardPendingApproval, instruction: string): string {
  return `Original request: ${pendingApproval.instruction}\nRequested changes before approval: ${instruction}`;
}

function terminalStatus(result: AgentResult): "committed" | "failed" | "unknown" {
  if (result.actionsPerformed.some((action) => action.status === "unknown")) {
    return "unknown";
  }
  return result.actionsPerformed.some((action) => (
    action.status === "error" || action.status === "policy_block"
  )) ? "failed" : "committed";
}

function resultError(result: AgentResult): string | null {
  return result.actionsPerformed.find((action) => (
    action.status === "error" || action.status === "policy_block" || action.status === "unknown"
  ))?.result ?? null;
}

async function executeDashboardPlannedActions(params: {
  orgId: string;
  threadId: string;
  planId: string;
  plan: AgentPlan;
  identityInstruction: string;
  turnInstruction: string;
  settings: OrgSettings;
  actionCalls: RawToolCall[];
  mode: "human_approved" | "auto_executed";
  approverId?: string;
  requireStoredPlan: boolean;
}): Promise<AgentResult> {
  const approvedAt = params.mode === "human_approved" ? new Date() : undefined;
  const identity: PlanExecutionIdentity = {
    orgId: params.orgId,
    planId: params.planId,
    threadId: params.threadId,
    planHash: hashPlan(params.plan),
    instructionHash: hashInstruction(params.identityInstruction),
    mode: params.mode,
    approverId: params.approverId,
    approvedAt,
  };
  const ledgerMode = resolvePlanExecutionLedgerMode();
  let executionId: string | undefined;
  let claimToken: string | undefined;

  if (ledgerMode === "enforce") {
    const claim = params.requireStoredPlan
      ? await claimStoredPlanExecution(identity)
      : await claimPlanExecution(identity);
    if (!claim.claimed || !claim.claimToken) {
      throw new ConflictError("This plan has already been approved or is currently running.");
    }
    executionId = claim.execution.id;
    claimToken = claim.claimToken;
  } else if (ledgerMode === "shadow") {
    try {
      const observed = await observePlanExecution(identity);
      executionId = observed.id;
      if (observed.observationCount > 1) {
        logger.warn({
          orgId: params.orgId,
          threadId: params.threadId,
          planId: params.planId,
          observationCount: observed.observationCount,
        }, "[agent/chat] shadow observed repeated execution of one plan");
      }
    } catch (error) {
      logger.error({ err: error, orgId: params.orgId, threadId: params.threadId }, "[agent/chat] shadow observation failed");
    }
  }

  try {
    const result = await executeAgentTurn({
      orgId: params.orgId,
      threadId: params.threadId,
      instruction: params.turnInstruction,
      failureRoute: "/api/agent/chat",
      orgSettings: params.settings,
      approvedToolCalls: params.actionCalls,
      persistUserMessage: true,
      persistAgentMessage: true,
      persistAuditNote: true,
      persistAuditNoteWhenNoActions: false,
      auditMode: params.mode,
      ...(executionId ? { executionId } : {}),
      ...(approvedAt && params.approverId ? {
        approval: {
          approverId: params.approverId,
          approvedAt,
          approvedPlanHash: identity.planHash,
          instructionHash: identity.instructionHash,
        },
      } : {}),
    });
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalStatus(result),
        error: resultError(result),
      });
    }
    return result;
  } catch (error) {
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: "unknown",
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (params.requireStoredPlan && claimToken) {
      await clearDashboardPendingApproval(params.threadId, params.planId);
    }
  }
}

export async function executeDashboardPendingApproval(params: {
  orgId: string;
  threadId: string;
  approval: DashboardPendingApproval;
  turnInstruction: string;
  settings: OrgSettings;
  approverId: string;
}): Promise<AgentResult> {
  if (!params.approval.planId) {
    throw new ConflictError("This plan predates durable approvals. Regenerate it before executing.");
  }
  return executeDashboardPlannedActions({
    orgId: params.orgId,
    threadId: params.threadId,
    planId: params.approval.planId,
    plan: params.approval.plan,
    identityInstruction: params.approval.instruction,
    turnInstruction: params.turnInstruction,
    settings: params.settings,
    actionCalls: getDashboardActionCalls(params.approval.plan),
    mode: "human_approved",
    approverId: params.approverId,
    requireStoredPlan: true,
  });
}

export async function planDashboardApproval(params: {
  orgId: string;
  threadId: string;
  instruction: string;
  displayInstruction?: string;
  settings: OrgSettings;
}): Promise<
  | { approval: DashboardPendingApproval }
  | { autoExecuted: true; plan: AgentPlan; approvedToolCalls: RawToolCall[]; result: AgentResult }
  | null
> {
  const generationStartedAt = Date.now();
  // Concierge is an operator channel; planAgent slices operator history to the
  // last 4 messages, so cap the fetch instead of loading 50 rows.
  const ctx = await buildContext(params.threadId, params.orgId, { messageWindow: 4 });
  const plan = await planAgent(ctx, params.instruction, params.settings);
  const planId = randomUUID();
  if (plan.steps.length > 0) {
    void captureAgentPlanGenerated({
      cacheHit: false,
      channel: 'dashboard_agent',
      generationMs: Date.now() - generationStartedAt,
      organizationId: params.orgId,
      planId,
      stepCount: plan.steps.length,
    });
  }
  const actionCalls = getDashboardActionCalls(plan);
  const requiresApproval = actionCalls.length > 0;
  const instructionHash = hashInstructionForLog(params.instruction);

  logger.info({
    orgId: params.orgId,
    threadId: params.threadId,
    instructionHash,
    requiresApproval,
    rawToolCallCount: plan.rawToolCalls.length,
    visibleStepCount: plan.steps.length,
    actionCallCount: actionCalls.length,
  }, "[agent/chat] planned");

  if (!requiresApproval) {
    return null;
  }

  if (isAutoExecuteEnabled(params.settings)) {
    const classification = classifyHomePlan(plan, params.settings);
    if (classification.kind === "auto_execute") {
      const result = await executeDashboardPlannedActions({
        orgId: params.orgId,
        threadId: params.threadId,
        planId,
        plan,
        identityInstruction: params.instruction,
        turnInstruction: params.displayInstruction ?? params.instruction,
        settings: params.settings,
        actionCalls,
        mode: "auto_executed",
        requireStoredPlan: false,
      });

      return {
        autoExecuted: true,
        plan,
        approvedToolCalls: actionCalls,
        result,
      };
    }
  }

  const summary = buildDashboardApprovalSummary(plan);
  const approval: DashboardPendingApproval = {
    kind: "dashboard_pending_approval",
    version: DASHBOARD_PENDING_APPROVAL_VERSION,
    instruction: params.instruction,
    instructionHash,
    summary,
    plan,
    planId,
    createdAt: new Date().toISOString(),
  };

  await storeDashboardPendingApproval(params.threadId, approval);
  await persistDashboardExchange(params.threadId, params.displayInstruction ?? params.instruction, summary);

  return { approval };
}
