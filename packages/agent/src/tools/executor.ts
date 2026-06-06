import { db, getDailyRefundSpendCents, incrementDailyRefundSpendCents } from "@clerk/db";
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
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
} from "./shopify.js";
import { checkParsedStaticToolPolicy } from "./static-policy.js";
import { toolError, type ToolResult, type ToolStatus } from "./result.js";
import type { BaseAgentContext } from "../agent-context.js";
import type {
  AgentToolDefinition,
  CreateRefundInput,
  KnowledgeBaseToolArticle,
  ToolExecutionDeps,
} from "./registry.js";
import { formatToolInputValidationError, getToolDefinition } from "./registry.js";
export type { StaticPolicyResult } from "./static-policy.js";

type PreparedToolCall =
  | { ok: true; definition: AgentToolDefinition; input: unknown }
  | { ok: false; result: ToolResult };

function formatPolicyError(message: string): string {
  return `Error: ${message}`;
}

function prepareToolCall(name: string, args: unknown): PreparedToolCall {
  const definition = getToolDefinition(name);
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
  orgId: string,
  settings?: OrgSettings,
): Promise<string | null> {
  const s = resolveAgentSettings(settings);
  const staticResult = checkParsedStaticToolPolicy(definition, input, s);
  if (staticResult.blocked) return formatPolicyError(staticResult.reason);

  if (definition.policy.dailyRefundSpendLimit) {
    const refundInput = input as CreateRefundInput;
    const hasDailyCap = s.dailyRefundCap !== null && s.dailyRefundCap > 0;
    if (hasDailyCap) {
      const amount = Number(refundInput.amount);
      const capCents = Math.round((s.dailyRefundCap as number) * 100);
      const requestedCents = Math.round(amount * 100);
      const spentCents = await getDailyRefundSpendCents(orgId);
      if (spentCents + requestedCents > capCents) {
        const remaining = Math.max(0, capCents - spentCents) / 100;
        return formatPolicyError(`daily refund cap of $${s.dailyRefundCap} reached; $${remaining.toFixed(2)} remaining today.`);
      }
    }
  }

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
  cancelOrder,
  createShopifyOrder,
  editShopifyOrder,
  incrementDailyRefundSpendCents,
  async searchKnowledgeBaseArticles(orgId: string, words: readonly string[]): Promise<KnowledgeBaseToolArticle[]> {
    const wordConditions = words.flatMap((word) => [
      { title: { contains: word, mode: "insensitive" as const } },
      { body: { contains: word, mode: "insensitive" as const } },
    ]);

    return db.kbArticle.findMany({
      where: { organizationId: orgId, OR: wordConditions },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, body: true, tags: true },
    });
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
};

export async function executeTool(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings
): Promise<string> {
  const prepared = prepareToolCall(name, args);
  if (!prepared.ok) return prepared.result.message;

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, ctx.orgId, settings);
  if (policyError) return policyError;
  const resolvedSettings = resolveAgentSettings(settings);
  return (await prepared.definition.execute(prepared.input, ctx, resolvedSettings, TOOL_EXECUTION_DEPS)).message;
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

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, ctx.orgId, settings);
  if (policyError) return toolError(policyError);
  const resolvedSettings = resolveAgentSettings(settings);
  return prepared.definition.execute(prepared.input, ctx, resolvedSettings, TOOL_EXECUTION_DEPS);
}

export interface ExecuteToolResult {
  result: string;
  status: "success" | "error" | "policy_block" | "escalated";
}

const TOOL_STATUS_TO_EXECUTE_STATUS: Record<ToolStatus, ExecuteToolResult["status"]> = {
  ok: "success",
  not_found: "success",
  error: "error",
  escalated: "escalated",
};

export async function executeToolWithStatus(
  name: string,
  args: unknown,
  ctx: BaseAgentContext,
  settings?: OrgSettings
): Promise<ExecuteToolResult> {
  const prepared = prepareToolCall(name, args);
  if (!prepared.ok) return { result: prepared.result.message, status: "error" };

  const policyError = await enforceToolPolicy(prepared.definition, prepared.input, ctx.orgId, settings);
  if (policyError) return { result: policyError, status: "policy_block" };

  const resolvedSettings = resolveAgentSettings(settings);
  const { status, message } = await prepared.definition.execute(prepared.input, ctx, resolvedSettings, TOOL_EXECUTION_DEPS);
  return { result: message, status: TOOL_STATUS_TO_EXECUTE_STATUS[status] };
}
