import { db } from "@clerk/db";
import type { OrgSettings } from "@/types";
import { resolveAgentSettings } from "../settings";
import {
  addInternalNote,
  sendReply,
  sendEmail,
  updateThreadStatus,
  updateThreadTag,
  escalateToHuman,
} from "./thread";
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
} from "./shopify";
import { checkStaticToolPolicy } from "./static-policy";
import { toolError, toolNotFound, toolOk, type ToolResult, type ToolStatus } from "./result";
import { getDailyRefundSpendCents, incrementDailyRefundSpendCents } from "@/lib/server/refund-spend";
import type { AgentContext } from "../types";
import type {
  SearchShopifyProductsInput,
  SearchShopifyCustomersInput,
  GetShopifyCustomerInput,
  UpdateShopifyCustomerInfoInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
  AddShopifyCustomerNoteInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
  CreateRefundInput,
  CancelOrderInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
  AddInternalNoteInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
  EscalateToHumanInput,
  SearchKbInput,
} from "./registry";
export type { StaticPolicyResult } from "./static-policy";

function cast<T>(v: unknown): T {
  return v as T;
}

function formatPolicyError(message: string): string {
  return `Error: ${message}`;
}

async function enforceToolPolicy(name: string, args: unknown, orgId: string, settings?: OrgSettings): Promise<string | null> {
  const s = resolveAgentSettings(settings);
  const staticResult = checkStaticToolPolicy(name, args, s);
  if (staticResult.blocked) return formatPolicyError(staticResult.reason);

  if (name === "create_refund") {
    const input = cast<CreateRefundInput>(args);
    const hasDailyCap = s.dailyRefundCap !== null && s.dailyRefundCap > 0;
    if (hasDailyCap && input.amount) {
      const amount = Number(input.amount);
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

async function runToolBody(
  name: string,
  args: unknown,
  ctx: AgentContext,
  settings?: OrgSettings
): Promise<ToolResult> {
  const noShopify = toolError("Error: no Shopify integration connected.");
  const threadCtx = { threadId: ctx.thread.id, orgId: ctx.orgId, orgName: ctx.orgName };
  const resolvedSettings = resolveAgentSettings(settings);

  switch (name) {
    case "search_shopify_products":
      return ctx.shopify ? searchShopifyProducts(cast<SearchShopifyProductsInput>(args), ctx.shopify) : noShopify;

    case "search_shopify_customers":
      return ctx.shopify ? searchShopifyCustomers(cast<SearchShopifyCustomersInput>(args), ctx.shopify) : noShopify;

    case "get_shopify_customer":
      return ctx.shopify ? getShopifyCustomer(cast<GetShopifyCustomerInput>(args), ctx.shopify) : noShopify;

    case "update_shopify_customer_info":
      return ctx.shopify ? updateShopifyCustomerInfo(cast<UpdateShopifyCustomerInfoInput>(args), ctx.shopify) : noShopify;

    case "get_shopify_orders":
      return ctx.shopify ? getShopifyOrders(cast<GetShopifyOrdersInput>(args), ctx.shopify) : noShopify;

    case "update_shopify_order_address":
      return ctx.shopify ? updateShopifyOrderAddress(cast<UpdateShopifyOrderAddressInput>(args), ctx.shopify) : noShopify;

    case "add_shopify_customer_note":
      return ctx.shopify ? addShopifyCustomerNote(cast<AddShopifyCustomerNoteInput>(args), ctx.shopify) : noShopify;

    case "get_order_by_name":
      return ctx.shopify ? getOrderByName(cast<GetOrderByNameInput>(args), ctx.shopify) : noShopify;

    case "get_order_tracking":
      return ctx.shopify ? getOrderTracking(cast<GetOrderTrackingInput>(args), ctx.shopify) : noShopify;

    case "create_refund": {
      if (!ctx.shopify) return noShopify;
      const refund = await createRefund(cast<CreateRefundInput>(args), ctx.shopify);
      if (refund.refundedCents !== null && refund.refundedCents > 0) {
        await incrementDailyRefundSpendCents(ctx.orgId, refund.refundedCents);
      }
      return refund;
    }

    case "cancel_order":
      return ctx.shopify ? cancelOrder(cast<CancelOrderInput>(args), ctx.shopify) : noShopify;

    case "create_shopify_order":
      return ctx.shopify
        ? createShopifyOrder(cast<CreateShopifyOrderInput>(args), ctx.shopify, {
            allowCustomLineItems: !resolvedSettings.blockCustomLineItems,
          })
        : noShopify;

    case "edit_shopify_order":
      return ctx.shopify ? editShopifyOrder(cast<EditShopifyOrderInput>(args), ctx.shopify) : noShopify;

    case "add_internal_note":
      return addInternalNote(cast<AddInternalNoteInput>(args), threadCtx);

    case "send_reply":
      return sendReply(cast<SendReplyInput>(args), threadCtx);

    case "send_email":
      return sendEmail(cast<SendEmailInput>(args), threadCtx);

    case "update_thread_status":
      return updateThreadStatus(cast<UpdateThreadStatusInput>(args), threadCtx);

    case "update_thread_tag":
      return updateThreadTag(cast<UpdateThreadTagInput>(args), threadCtx);

    case "escalate_to_human":
      return escalateToHuman(cast<EscalateToHumanInput>(args), threadCtx);

    case "search_kb": {
      const { query } = cast<SearchKbInput>(args);
      const words = query.trim().split(/\s+/).filter((word) => word.length >= 2);
      if (words.length === 0) return toolNotFound("No knowledge base articles found for that query.");

      const wordConditions = words.flatMap(w => [
        { title: { contains: w, mode: "insensitive" as const } },
        { body:  { contains: w, mode: "insensitive" as const } },
      ]);
      const articles = await db.kbArticle.findMany({
        where: { organizationId: ctx.orgId, OR: wordConditions },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, body: true, tags: true },
      });
      if (articles.length === 0) return toolNotFound("No knowledge base articles found for that query.");

      await db.kbCitation.createMany({
        data: articles.map(a => ({
          organizationId: ctx.orgId,
          kbArticleId: a.id,
          threadId: ctx.thread.id,
        })),
      });

      return toolOk(JSON.stringify(articles.map(a => ({ title: a.title, body: a.body, tags: a.tags }))));
    }

    default:
      return toolError(`Error: unknown tool "${name}".`);
  }
}

export async function executeTool(
  name: string,
  args: unknown,
  ctx: AgentContext,
  settings?: OrgSettings
): Promise<string> {
  const policyError = await enforceToolPolicy(name, args, ctx.orgId, settings);
  if (policyError) return policyError;
  return (await runToolBody(name, args, ctx, settings)).message;
}

// Structured variant used by the planner, which derives plan warnings from the
// semantic status (e.g. not_found) rather than scraping the model-facing text.
export async function executeToolStructured(
  name: string,
  args: unknown,
  ctx: AgentContext,
  settings?: OrgSettings
): Promise<ToolResult> {
  const policyError = await enforceToolPolicy(name, args, ctx.orgId, settings);
  if (policyError) return toolError(policyError);
  return runToolBody(name, args, ctx, settings);
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
  ctx: AgentContext,
  settings?: OrgSettings
): Promise<ExecuteToolResult> {
  const policyError = await enforceToolPolicy(name, args, ctx.orgId, settings);
  if (policyError) return { result: policyError, status: "policy_block" };

  const { status, message } = await runToolBody(name, args, ctx, settings);
  return { result: message, status: TOOL_STATUS_TO_EXECUTE_STATUS[status] };
}
