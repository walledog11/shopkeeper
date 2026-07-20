import { randomUUID } from "node:crypto";
import {
  commitDailyRefundSpendReservation,
  db,
  markDailyRefundSpendReservationUnknown,
  releaseDailyRefundSpendReservation,
  reserveDailyRefundSpend,
} from "@shopkeeper/db";
import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";
import {
  searchShopifyProducts,
  searchShopifyCustomers,
  getShopifyCustomer,
  updateShopifyCustomerInfo,
  getShopifyOrders,
  updateShopifyOrderAddress,
  addShopifyCustomerNote,
  getOrderByName,
  getOrderTracking,
  createRefund,
  createReturn,
  createExchange,
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
  issueDiscount,
  issueStoreCredit,
  createGiftCard,
  attachReturnLabel,
} from "./shopify.js";
import { checkParsedStaticToolPolicy } from "./static-policy.js";
import { getSupportStats } from "./support-stats.js";
import { toolError, toolUnknown, type ToolResult, type ToolStatus } from "./result.js";
import type { BaseAgentContext } from "../agent-context.js";
import type {
  AgentToolDefinition,
  KnowledgeBaseToolArticle,
  ToolExecutionDeps,
} from "./registry/index.js";
import { formatToolInputValidationError, getToolDefinition, unmetToolCapability } from "./registry/index.js";
import { MEMORY_OVERRIDE_TAG, memoryOverrideTargetId, resolveEffectiveMemoryArticles } from "../kb-memory.js";
import logger from "../logger.js";
import {
  CONTEXT_BUDGETS,
  budgetKbArticles,
  resolveContextBudgetMode,
} from "../context-budget.js";
export type { StaticPolicyResult } from "./static-policy.js";

type PreparedToolCall =
  | { ok: true; definition: AgentToolDefinition; input: unknown }
  | { ok: false; result: ToolResult };

function formatPolicyError(message: string): string {
  return `Error: ${message}`;
}

function prepareToolCall(
  name: string,
  args: unknown,
  moduleTools?: Record<string, AgentToolDefinition>,
): PreparedToolCall {
  const definition = moduleTools?.[name] ?? getToolDefinition(name);
  if (!definition) {
    return { ok: false, result: toolError(`Error: unknown tool "${name}".`) };
  }

  try {
    return { ok: true, definition, input: definition.parse(args) };
  } catch (error) {
    return { ok: false, result: toolError(`Error: ${formatToolInputValidationError(name, error)}`) };
  }
}

async function enforceToolPolicy(
  definition: AgentToolDefinition,
  input: unknown,
  settings?: OrgSettings,
): Promise<string | null> {
  const s = resolveAgentSettings(settings);
  const staticResult = checkParsedStaticToolPolicy(definition, input, s);
  if (staticResult.blocked) return formatPolicyError(staticResult.reason);

  return null;
}

const TOOL_EXECUTION_DEPS: ToolExecutionDeps = {
  searchShopifyProducts,
  searchShopifyCustomers,
  getShopifyCustomer,
  updateShopifyCustomerInfo,
  getShopifyOrders,
  updateShopifyOrderAddress,
  addShopifyCustomerNote,
  getOrderByName,
  getOrderTracking,
  createRefund,
  createReturn,
  createExchange,
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
  issueDiscount,
  issueStoreCredit,
  createGiftCard,
  attachReturnLabel,
  async searchKnowledgeBaseArticles(orgId: string, words: readonly string[]): Promise<KnowledgeBaseToolArticle[]> {
    const wordConditions = words.flatMap((word) => [
      { title: { contains: word, mode: "insensitive" as const } },
      { body: { contains: word, mode: "insensitive" as const } },
    ]);

    const [articles, corrections] = await Promise.all([
      db.kbArticle.findMany({
        where: { organizationId: orgId, OR: wordConditions },
        take: 10,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, body: true, tags: true },
      }),
      db.kbArticle.findMany({
        where: { organizationId: orgId, tags: { has: MEMORY_OVERRIDE_TAG } },
        take: 50,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, body: true, tags: true },
      }),
    ]);
    const candidateIds = new Set(articles.map(article => article.id));
    const relevantCorrections = corrections.filter(correction => {
      const targetId = memoryOverrideTargetId(correction.tags);
      return Boolean(targetId && candidateIds.has(targetId));
    });
    const effectiveArticles = resolveEffectiveMemoryArticles([...articles, ...relevantCorrections]);
    const budgetedArticles = budgetKbArticles(
      effectiveArticles,
      {
        maxCount: CONTEXT_BUDGETS.searchedKbArticleCount,
        maxTotalChars: CONTEXT_BUDGETS.searchedKbTotalChars,
      },
    );
    const contextBudgetMode = resolveContextBudgetMode();
    if (contextBudgetMode !== "off") {
      logger.info({
        orgId,
        purpose: "search_kb",
        mode: contextBudgetMode,
        kbArticles: budgetedArticles.stats,
      }, "[agent:context] budget");
    }
    return contextBudgetMode === "enforce"
      ? budgetedArticles.articles
      : effectiveArticles.slice(0, CONTEXT_BUDGETS.searchedKbArticleCount);
  },
  recordKnowledgeBaseCitations(orgId: string, threadId: string, articleIds: readonly string[]): Promise<unknown> {
    return db.kbCitation.createMany({
      data: articleIds.map((articleId) => ({
        organizationId: orgId,
        kbArticleId: articleId,
        threadId,
      })),
    });
  },
  getSupportStats,
};

type ReservationInput = Parameters<typeof reserveDailyRefundSpend>[0]["input"];

interface PreparedExecutionResult {
  result: ToolResult;
  policyBlocked: boolean;
}

function reservationJson(value: unknown): ReservationInput {
  const serialized = JSON.stringify(value);
  return (serialized === undefined ? null : JSON.parse(serialized)) as ReservationInput;
}

function committedSpendCents(result: ToolResult): number | null {
  const candidate = "refundedCents" in result
    ? (result as ToolResult & { refundedCents?: unknown }).refundedCents
    : (result as ToolResult & { spentCents?: unknown }).spentCents;
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) {
    return null;
  }
  return Math.round(candidate);
}

function duplicateReservationResult(status: string): ToolResult {
  if (status === "released") {
    return toolError("Error: this goodwill action was already attempted and released without a provider charge.");
  }
  return toolUnknown(`Unknown: this goodwill action already has a ${status} budget record and will not be sent to the provider again.`);
}

async function executePreparedTool(
  definition: AgentToolDefinition,
  input: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings,
): Promise<PreparedExecutionResult> {
  const resolvedSettings = resolveAgentSettings(settings);
  if (!definition.policy.dailyRefundSpendLimit) {
    return {
      result: await definition.execute(input, ctx, resolvedSettings, TOOL_EXECUTION_DEPS),
      policyBlocked: false,
    };
  }

  const amount = Number((input as { amount?: unknown }).amount);
  const requestedCents = Math.round(amount * 100);
  if (!Number.isSafeInteger(requestedCents) || requestedCents <= 0) {
    return {
      result: toolError("Error: goodwill amount must be a positive currency amount."),
      policyBlocked: true,
    };
  }

  const operationKey = ctx.shopify?.operationId ?? `unscoped:${randomUUID()}`;
  const executionCtx = ctx.shopify?.operationId || !ctx.shopify
    ? ctx
    : {
        ...ctx,
        shopify: { ...ctx.shopify, operationId: operationKey },
      };
  const capCents = resolvedSettings.dailyRefundCap !== null
    && resolvedSettings.dailyRefundCap > 0
    ? Math.round(resolvedSettings.dailyRefundCap * 100)
    : null;
  const reservation = await reserveDailyRefundSpend({
    orgId: ctx.orgId,
    operationKey,
    tool: definition.name,
    input: reservationJson(input),
    requestedCents,
    capCents,
  });
  if (reservation.kind === "blocked") {
    const cap = resolvedSettings.dailyRefundCap;
    return {
      result: toolError(formatPolicyError(
        `daily goodwill cap of $${cap} reached (shared across refunds, store credit, and gift cards); $${(reservation.remainingCents / 100).toFixed(2)} remaining today.`,
      )),
      policyBlocked: true,
    };
  }
  if (reservation.kind === "duplicate") {
    return {
      result: duplicateReservationResult(reservation.reservation.status),
      policyBlocked: false,
    };
  }

  let result: ToolResult;
  try {
    result = await definition.execute(input, executionCtx, resolvedSettings, TOOL_EXECUTION_DEPS);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markDailyRefundSpendReservationUnknown(reservation.reservation.id, reason).catch(() => undefined);
    throw error;
  }

  if (result.status === "unknown") {
    await markDailyRefundSpendReservationUnknown(reservation.reservation.id, result.message);
    return { result, policyBlocked: false };
  }
  if (result.status !== "ok") {
    await releaseDailyRefundSpendReservation(reservation.reservation.id, result.message);
    return { result, policyBlocked: false };
  }

  const committedCents = committedSpendCents(result);
  if (committedCents === null) {
    const message = "Unknown: provider reported success but the committed goodwill amount could not be verified.";
    await markDailyRefundSpendReservationUnknown(reservation.reservation.id, message);
    return { result: toolUnknown(message), policyBlocked: false };
  }
  try {
    await commitDailyRefundSpendReservation(reservation.reservation.id, committedCents);
    return { result, policyBlocked: false };
  } catch {
    const message = "Unknown: the provider action completed but its goodwill budget record could not be finalized.";
    await markDailyRefundSpendReservationUnknown(reservation.reservation.id, message).catch(() => undefined);
    return { result: toolUnknown(message), policyBlocked: false };
  }
}

export async function executeTool(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings
): Promise<string> {
  const prepared = prepareToolCall(name, args);
  if (!prepared.ok) return prepared.result.message;

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, settings);
  if (policyError) return policyError;
  const capabilityError = unmetToolCapability(prepared.definition, ctx);
  if (capabilityError) return capabilityError.message;
  return (await executePreparedTool(prepared.definition, prepared.input, ctx, settings)).result.message;
}

// Structured variant used by the planner, which derives plan warnings from the
// semantic status (e.g. not_found) rather than scraping the model-facing text.
export async function executeToolStructured(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings
): Promise<ToolResult> {
  const prepared = prepareToolCall(name, args);
  if (!prepared.ok) return prepared.result;

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, settings);
  if (policyError) return toolError(policyError);
  const capabilityError = unmetToolCapability(prepared.definition, ctx);
  if (capabilityError) return capabilityError;
  return (await executePreparedTool(prepared.definition, prepared.input, ctx, settings)).result;
}

export interface ExecuteToolResult {
  result: string;
  status: "success" | "error" | "policy_block" | "escalated" | "unknown";
}

const TOOL_STATUS_TO_EXECUTE_STATUS: Record<ToolStatus, ExecuteToolResult["status"]> = {
  ok: "success",
  not_found: "success",
  error: "error",
  escalated: "escalated",
  unknown: "unknown",
};

export async function executeToolWithStatus(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings,
  // Module-supplied tool definitions (e.g. order-ops' flag_order) resolved ahead
  // of the shared registry, so a module can inject its own terminal tool without
  // registering it in the support tool set.
  moduleTools?: Record<string, AgentToolDefinition>,
): Promise<ExecuteToolResult> {
  const prepared = prepareToolCall(name, args, moduleTools);
  if (!prepared.ok) return { result: prepared.result.message, status: "error" };

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, settings);
  if (policyError) return { result: policyError, status: "policy_block" };
  const capabilityError = unmetToolCapability(prepared.definition, ctx);
  if (capabilityError) return { result: capabilityError.message, status: "error" };

  const executed = await executePreparedTool(prepared.definition, prepared.input, ctx, settings);
  if (executed.policyBlocked) {
    return { result: executed.result.message, status: "policy_block" };
  }
  return {
    result: executed.result.message,
    status: TOOL_STATUS_TO_EXECUTE_STATUS[executed.result.status],
  };
}
