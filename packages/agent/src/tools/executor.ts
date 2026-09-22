import { randomUUID } from "node:crypto";
import {
  commitDailyRefundSpendReservation,
  db,
  markDailyRefundSpendReservationUnknown,
  recordReturnWatch,
  releaseDailyRefundSpendReservation,
  reserveDailyRefundSpend,
} from "@shopkeeper/db";
import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";
import {
  searchShopifyProducts,
  getInventoryStatus,
  findCustomer,
  updateShopifyCustomerInfo,
  getShopifyOrders,
  updateShopifyOrderAddress,
  addShopifyCustomerNote,
  getOrderByName,
  getOrderFulfillmentStatus,
  getOrderTracking,
  createRefund,
  createPartialRefund,
  createReturn,
  createExchange,
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
  issueDiscount,
  issueStoreCredit,
  createGiftCard,
  attachReturnLabel,
  fulfillOrder,
} from "./shopify.js";
import { checkParsedStaticToolPolicy, checkStorefrontToolAllowed } from "./static-policy.js";
import { getSupportStats } from "./support-stats.js";
import {
  ReceiptValidationError,
  receiptAsUnknown,
  toolError,
  toolPolicyBlock,
  toolUnknown,
  validateToolResultReceipt,
  type CompensationReservation,
  type ReceiptV1,
  type ToolResult,
  type ToolStatus,
} from "./result.js";
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
} from "../context-budget.js";
export type { StaticPolicyResult } from "./static-policy.js";

type PreparedToolCall =
  | { ok: true; definition: AgentToolDefinition; input: unknown }
  | { ok: false; result: ToolResult };

function formatPolicyError(message: string): string {
  return `Error: ${message}`;
}

/**
 * The storefront allowlist, checked before the arguments are parsed — the same
 * ordering `checkStaticToolPolicy` uses for the preview path.
 *
 * Post-parse is too late for this half: a guest naming `find_customer` with
 * anything malformed was answered "input.by is required", which refuses the
 * call but tells the shopper the tool exists and what it takes. Whether an
 * actor may call a tool at all does not depend on the arguments, so it is
 * decided first. Selection never offers these, so arriving here means a plan
 * named a tool outside the actor's set.
 */
function storefrontToolBlock(name: string, ctx: BaseAgentContext): string | null {
  const blocked = checkStorefrontToolAllowed(name, {
    authState: ctx.authState,
    verifiedOrders: ctx.verifiedOrders,
  });
  return blocked?.blocked ? formatPolicyError(blocked.reason) : null;
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
    const message = `Error: ${formatToolInputValidationError(name, error)}`;
    const isCompensationTool = name === "create_refund" || name === "create_gift_card";
    return {
      ok: false,
      result: isCompensationTool ? toolPolicyBlock(message) : toolError(message),
    };
  }
}

async function enforceToolPolicy(
  definition: AgentToolDefinition,
  input: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings,
): Promise<string | null> {
  // A merchant's "yes" approves the plan they were shown. When the control tool
  // could not find that plan, the turn has no standing authorization at all, and
  // the model improvising the action itself is the one outcome that must not
  // happen — it moved real money in production on 2026-09-10 with no plan, no
  // execution claim and no approver. Checked before the static policy because
  // this is about whether the turn may act, not about what the input says.
  //
  // Registry tools only. A module's own control tools are the adjudication
  // surface, not improvisation: they are all category "action" too, so blocking
  // them would take out `answer_operator_question` — the correct recovery when a
  // bare "yes" turns out to answer a question rather than approve a plan.
  if (
    ctx.actionAuthorityBlock
    && definition.category === "action"
    && getToolDefinition(definition.name)
  ) {
    return formatPolicyError(ctx.actionAuthorityBlock.message);
  }

  const s = resolveAgentSettings(settings);
  const staticResult = checkParsedStaticToolPolicy(definition, input, s, {
    authState: ctx.authState,
    verifiedOrders: ctx.verifiedOrders,
  });
  if (staticResult.blocked) return formatPolicyError(staticResult.reason);

  return null;
}

const TOOL_EXECUTION_DEPS: ToolExecutionDeps = {
  searchShopifyProducts,
  getInventoryStatus,
  createPartialRefund,
  findCustomer,
  updateShopifyCustomerInfo,
  getShopifyOrders,
  updateShopifyOrderAddress,
  addShopifyCustomerNote,
  getOrderByName,
  getOrderFulfillmentStatus,
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
  fulfillOrder,
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
    logger.info({
      orgId,
      purpose: "search_kb",
      kbArticles: budgetedArticles.stats,
    }, "[agent:context] budget");
    return budgetedArticles.articles;
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
  recordReturnWatch,
};

type ReservationInput = Parameters<typeof reserveDailyRefundSpend>[0]["input"];

interface PreparedExecutionResult {
  result: ToolResult;
  policyBlocked: boolean;
}

async function executeDefinitionWithValidatedReceipt(
  definition: AgentToolDefinition,
  input: unknown,
  ctx: BaseAgentContext,
  settings: ReturnType<typeof resolveAgentSettings>,
): Promise<ToolResult> {
  const result = await definition.execute(input, ctx, settings, TOOL_EXECUTION_DEPS);
  try {
    const receipt = validateToolResultReceipt(result, {
      tool: definition.name,
      ...(ctx.execution?.operationId || ctx.shopify?.operationId
        ? { operationId: ctx.execution?.operationId ?? ctx.shopify!.operationId }
        : {}),
      ...(ctx.execution?.executionId || ctx.shopify?.executionId
        ? { executionId: ctx.execution?.executionId ?? ctx.shopify!.executionId }
        : {}),
    });
    if (
      definition.requiredReceiptVersion !== null
      && (ctx.execution?.operationId || ctx.shopify?.operationId)
      && (ctx.execution?.executionId || ctx.shopify?.executionId)
      && receipt === undefined
    ) {
      throw new ReceiptValidationError(
        `${definition.name} requires a v${definition.requiredReceiptVersion} execution receipt`,
      );
    }
    return result;
  } catch (error) {
    if (!(error instanceof ReceiptValidationError)) throw error;
    logger.error({ tool: definition.name, err: error.message }, "[agent] invalid tool receipt");
    return toolUnknown(`Unknown: ${definition.name} returned an invalid execution receipt; its outcome requires reconciliation.`);
  }
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
    return toolError("Error: this compensation action was already attempted and released without a provider charge.");
  }
  return toolUnknown(`Unknown: this compensation action already has a ${status} budget record and will not be sent to the provider again.`);
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
      result: await executeDefinitionWithValidatedReceipt(definition, input, ctx, resolvedSettings),
      policyBlocked: false,
    };
  }

  const operationKey = ctx.shopify?.operationId ?? `unscoped:${randomUUID()}`;
  const capCents = resolvedSettings.dailyRefundCap !== null
    && resolvedSettings.dailyRefundCap > 0
    ? Math.round(resolvedSettings.dailyRefundCap * 100)
    : null;

  // One reservation per execution either way. What differs is when it is made:
  // an amount the model named is reserved before dispatch, an amount the
  // provider prices is reserved by the adapter that priced it.
  let reservationId: string | null = null;
  const reserve = async (requestedCents: number): Promise<CompensationReservation> => {
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
        kind: "refused",
        result: toolError(formatPolicyError(
          `daily compensation cap of $${cap} reached (shared across refunds and gift cards); $${(reservation.remainingCents / 100).toFixed(2)} remaining today.`,
        )),
        policyBlocked: true,
      };
    }
    if (reservation.kind === "duplicate") {
      return {
        kind: "refused",
        result: duplicateReservationResult(reservation.reservation.status),
        policyBlocked: false,
      };
    }
    reservationId = reservation.reservation.id;
    return { kind: "reserved" };
  };

  const providerPriced = definition.policy.dailyRefundSpendLimit === "provider";
  if (!providerPriced) {
    const amount = Number((input as { amount?: unknown }).amount);
    const requestedCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(requestedCents) || requestedCents <= 0) {
      return {
        result: toolError("Error: compensation amount must be a positive currency amount."),
        policyBlocked: true,
      };
    }
    const reserved = await reserve(requestedCents);
    if (reserved.kind === "refused") {
      return { result: reserved.result, policyBlocked: reserved.policyBlocked };
    }
  }

  const executionCtx = ctx.shopify
    ? {
        ...ctx,
        shopify: {
          ...ctx.shopify,
          operationId: ctx.shopify.operationId ?? operationKey,
          ...(providerPriced ? { reserveCompensation: reserve } : {}),
        },
      }
    : ctx;

  let result: ToolResult;
  try {
    result = await executeDefinitionWithValidatedReceipt(definition, input, executionCtx, resolvedSettings);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reservationId) {
      await markDailyRefundSpendReservationUnknown(reservationId, reason).catch(() => undefined);
    }
    throw error;
  }

  // A provider-priced tool that stopped before pricing never reserved anything,
  // so there is nothing to settle.
  if (!reservationId) {
    return { result, policyBlocked: result.status === "policy_block" };
  }

  if (result.status === "unknown") {
    await markDailyRefundSpendReservationUnknown(reservationId, result.message);
    return { result, policyBlocked: false };
  }
  if (result.status !== "ok") {
    await releaseDailyRefundSpendReservation(reservationId, result.message);
    return { result, policyBlocked: result.status === "policy_block" };
  }

  const committedCents = committedSpendCents(result);
  if (committedCents === null) {
    const message = "Unknown: provider reported success but the committed compensation amount could not be verified.";
    await markDailyRefundSpendReservationUnknown(reservationId, message);
    const unknown = toolUnknown(message);
    return {
      result: result.receipt
        ? { ...unknown, receipt: receiptAsUnknown(result.receipt, "committed_amount_unverified") }
        : unknown,
      policyBlocked: false,
    };
  }
  try {
    await commitDailyRefundSpendReservation(reservationId, committedCents);
    return { result, policyBlocked: false };
  } catch {
    const message = "Unknown: the provider action completed but its compensation budget record could not be finalized.";
    await markDailyRefundSpendReservationUnknown(reservationId, message).catch(() => undefined);
    const unknown = toolUnknown(message);
    return {
      result: result.receipt
        ? { ...unknown, receipt: receiptAsUnknown(result.receipt, "budget_record_persistence_failed") }
        : unknown,
      policyBlocked: false,
    };
  }
}

export async function executeTool(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings
): Promise<string> {
  const storefrontBlock = storefrontToolBlock(name, ctx);
  if (storefrontBlock) return storefrontBlock;

  const prepared = prepareToolCall(name, args);
  if (!prepared.ok) return prepared.result.message;

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, ctx, settings);
  if (policyError) return policyError;
  const capabilityError = unmetToolCapability(prepared.definition, ctx);
  if (capabilityError) return capabilityError.message;
  return (await executePreparedTool(prepared.definition, prepared.input, ctx, settings)).result.message;
}

// Structured variant used by the planner, which derives plan signals from the
// semantic status (e.g. not_found) rather than scraping the model-facing text.
export async function executeToolStructured(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings
): Promise<ToolResult> {
  const storefrontBlock = storefrontToolBlock(name, ctx);
  if (storefrontBlock) return toolPolicyBlock(storefrontBlock);

  const prepared = prepareToolCall(name, args);
  if (!prepared.ok) return prepared.result;

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, ctx, settings);
  if (policyError) return toolError(policyError);
  const capabilityError = unmetToolCapability(prepared.definition, ctx);
  if (capabilityError) return capabilityError;
  return (await executePreparedTool(prepared.definition, prepared.input, ctx, settings)).result;
}

export interface ExecuteToolResult {
  result: string;
  status: "success" | "error" | "policy_block" | "escalated" | "unknown";
  receipt?: ReceiptV1;
}

const TOOL_STATUS_TO_EXECUTE_STATUS: Record<ToolStatus, ExecuteToolResult["status"]> = {
  ok: "success",
  not_found: "success",
  error: "error",
  policy_block: "policy_block",
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
  const storefrontBlock = storefrontToolBlock(name, ctx);
  if (storefrontBlock) return { result: storefrontBlock, status: "policy_block" };

  const prepared = prepareToolCall(name, args, moduleTools);
  if (!prepared.ok) {
    return {
      result: prepared.result.message,
      status: prepared.result.status === "policy_block" ? "policy_block" : "error",
    };
  }

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, ctx, settings);
  if (policyError) return { result: policyError, status: "policy_block" };
  const capabilityError = unmetToolCapability(prepared.definition, ctx);
  if (capabilityError) {
    return {
      result: capabilityError.message,
      status: capabilityError.status === "policy_block" ? "policy_block" : "error",
    };
  }

  const executed = await executePreparedTool(prepared.definition, prepared.input, ctx, settings);
  if (executed.policyBlocked) {
    return {
      result: executed.result.message,
      status: "policy_block",
      ...(executed.result.receipt ? { receipt: executed.result.receipt } : {}),
    };
  }
  return {
    result: executed.result.message,
    status: TOOL_STATUS_TO_EXECUTE_STATUS[executed.result.status],
    ...(executed.result.receipt ? { receipt: executed.result.receipt } : {}),
  };
}
