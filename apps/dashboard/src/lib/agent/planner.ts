import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/ai/anthropic";
import { AI_MODEL } from "@/lib/ai";
import logger from "@/lib/server/logger";
import type { AgentPlan, OrgSettings, PlanStep, RawToolCall } from "@/types";
import { PLAN_STEP_LABELS, TOOL_CATEGORIES, selectAgentTools } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { selectToolNamesForInstruction, isOperatorChannel } from "./intent";
import { executeTool } from "./tools/executor";
import { buildMessageHistory } from "./message-history";
import type { AgentContext } from "./types";
import { createModelUsageMetrics, hashInstructionForLog, recordModelUsage } from "./usage";
import { enforceSpendCap, recordSpend } from "./spend";
import { resolveAgentSettings } from "./settings";

function describeTool(name: string, input: unknown): string {
  const a = input as Record<string, unknown>;
  switch (name) {
    case "search_kb":
      return `Search knowledge base for "${String(a.query ?? "")}"`;
    case "update_shopify_order_address": {
      const parts = [a.address1, a.city, a.province, a.zip].filter(Boolean);
      return `Update their shipping address on Shopify to ${parts.join(", ")}`;
    }
    case "update_shopify_customer_info": {
      const changes: string[] = [];
      if (a.email) changes.push(`email -> ${a.email}`);
      if (a.phone) changes.push(`phone -> ${a.phone}`);
      if (a.first_name || a.last_name) changes.push(`name -> ${[a.first_name, a.last_name].filter(Boolean).join(" ")}`);
      return changes.length ? `Update: ${changes.join(", ")}` : "Update customer info";
    }
    case "create_refund":
      return a.amount ? `Issue $${a.amount} refund` : "Issue full refund";
    case "cancel_order":
      return `Cancel order${a.reason ? ` (${a.reason})` : ""}`;
    case "create_shopify_order": {
      const items = (a.line_items as { title?: string; variant_id?: string; quantity: number }[] ?? [])
        .map(li => `${li.quantity}x ${li.title ?? `variant ${li.variant_id}`}`)
        .join(", ");
      return `Create order for ${a.first_name} ${a.last_name}${items ? ` - ${items}` : ""}`;
    }
    case "add_shopify_customer_note":
      return "Add note to Shopify customer";
    case "send_reply": {
      const text = String(a.text ?? "");
      return text.length > 80 ? `"${text.slice(0, 80)}..."` : `"${text}"`;
    }
    case "send_email": {
      const body = String(a.body ?? "");
      const preview = body.length > 60 ? `${body.slice(0, 60)}...` : body;
      return `Email to ${a.to}: "${preview}"`;
    }
    case "add_internal_note":
      return "Add internal note";
    case "update_thread_status":
      return `Set status to ${a.status}`;
    case "update_thread_tag":
      return `Tag as "${a.tag}"`;
    case "get_order_by_name":
      return `Look up order ${a.order_name}`;
    case "edit_shopify_order": {
      const qty = a.quantity as number | undefined;
      if (a.variant_id && a.remove_variant_id) return "Swap order item - add new variant, remove old";
      if (a.remove_variant_id) return `Remove item (variant ${a.remove_variant_id}) from order`;
      return qty ? `Add ${qty}x item to order` : "Edit order";
    }
    default:
      return name.replace(/_/g, " ");
  }
}

export async function planAgent(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings
): Promise<AgentPlan> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const readToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const operatorMode = isOperatorChannel(ctx.thread.channelType);
  const historyWindow = operatorMode ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const baseMessages = buildMessageHistory(historyWindow, instruction);
  const systemPrompt = buildSystemPrompt(ctx, settings);
  const tools = selectAgentTools(settings, selectToolNamesForInstruction(ctx, instruction));
  const resolvedSettings = resolveAgentSettings(settings);

  await enforceSpendCap(ctx.orgId, resolvedSettings);

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    channelType: ctx.thread.channelType,
    messageCount: baseMessages.length,
    toolCount: tools.length,
    tools: tools.map(t => t.name),
    instructionLength: instruction.length,
    instructionHash,
  }, "[agent:plan] start");

  const response1 = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: baseMessages,
    tools,
  });

  const blocks1 = response1.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const usage1 = recordModelUsage(usageTotals, response1);
  await recordSpend(ctx.orgId, usage1, AI_MODEL);
  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    phase: "initial",
    stopReason: response1.stop_reason,
    tools: blocks1.map(b => b.name),
    usage: usage1,
    usageTotals,
  }, "[agent:plan] model call");
  const rawToolCalls: RawToolCall[] = blocks1.map((b) => ({ id: b.id, name: b.name, input: b.input }));

  let planMessages: Anthropic.MessageParam[] = [
    ...baseMessages,
    { role: "assistant", content: response1.content },
  ];
  let lastBlocks: Anthropic.ToolUseBlock[] = blocks1;

  const readBlocks = blocks1.filter(b => TOOL_CATEGORIES[b.name] === "read");
  const warnings: string[] = [];
  const readResultsMap = new Map<string, string>();

  if (ctx.shopify && !ctx.thread.shopifyCustomerId && !operatorMode) {
    warnings.push("Couldn't find a Shopify customer - verify the correct account is linked before approving.");
  }

  if (readBlocks.length > 0) {
    await Promise.all(
      readBlocks.map(async (b) => {
        readToolCalls.push(b.name);
        const toolStartedAt = Date.now();
        const inputKeys = b.input && typeof b.input === "object" ? Object.keys(b.input) : [];
        logger.info({
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          tool: b.name,
          inputKeys,
          inputChars: JSON.stringify(b.input ?? null).length,
        }, "[agent:plan] read tool call");
        let content: string;
        try {
          content = await executeTool(b.name, b.input, ctx, settings);
        } catch {
          content = "Lookup failed";
        }
        logger.info({
          orgId: ctx.orgId,
          threadId: ctx.thread.id,
          tool: b.name,
          durationMs: Date.now() - toolStartedAt,
          resultChars: content.length,
        }, "[agent:plan] read tool result");
        readResultsMap.set(b.id, content);
      })
    );

    for (const [id, result] of readResultsMap.entries()) {
      const block = readBlocks.find(b => b.id === id);
      if (!block) continue;
      const lower = result.toLowerCase();
      const isMissing = lower.includes("not found") || lower.includes("no customer") || lower === "lookup failed";
      if (isMissing) {
        if ((block.name === "get_shopify_customer" || block.name === "search_shopify_customers") && !warnings.some(w => w.includes("Shopify customer"))) {
          warnings.push("Couldn't find a Shopify customer - verify the correct account is linked before approving.");
        } else if (block.name === "get_shopify_orders" || block.name === "get_order_by_name") {
          warnings.push("No matching order found - confirm the order number with the customer before proceeding.");
        } else if (block.name === "get_order_tracking") {
          warnings.push("No tracking information found - the order may not have been fulfilled yet.");
        } else if (block.name === "search_shopify_products") {
          warnings.push("No matching product found - the order edit step may need a corrected product name.");
        }
      }
      if (block.name === "search_kb" && (lower.includes("no articles") || result.trim() === "[]" || result.trim() === "")) {
        warnings.push("No relevant KB articles found - the reply is based only on the conversation, not your documentation.");
      }
    }

    planMessages = [
      ...planMessages,
      {
        role: "user",
        content: blocks1.map(b => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: readResultsMap.get(b.id) ?? "Not executed during planning.",
        })),
      },
    ];

    await enforceSpendCap(ctx.orgId, resolvedSettings);
    const response15 = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: planMessages,
      tools,
    });
    lastBlocks = response15.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const usage15 = recordModelUsage(usageTotals, response15);
    await recordSpend(ctx.orgId, usage15, AI_MODEL);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase: "after_read_results",
      stopReason: response15.stop_reason,
      tools: lastBlocks.map(b => b.name),
      usage: usage15,
      usageTotals,
    }, "[agent:plan] model call");
    rawToolCalls.push(...lastBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })));
    planMessages = [...planMessages, { role: "assistant", content: response15.content }];
  }

  const hasSendReply = rawToolCalls.some((tc) => tc.name === "send_reply");
  const sendReplyTool = tools.find(t => t.name === "send_reply");
  if (!operatorMode && !hasSendReply && sendReplyTool) {
    const phase2Messages: Anthropic.MessageParam[] = [
      ...planMessages,
      ...(lastBlocks.length > 0
        ? [{
            role: "user" as const,
            content: lastBlocks.map((b) => ({
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: "Not executed during planning.",
            })),
          }]
        : [{ role: "user" as const, content: "Now call send_reply to respond to the customer." }]
      ),
    ];

    await enforceSpendCap(ctx.orgId, resolvedSettings);
    const response2 = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: phase2Messages,
      tools: [sendReplyTool],
      tool_choice: { type: "any" },
    });

    const phase2ToolUse = response2.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "send_reply"
    );
    const usage2 = recordModelUsage(usageTotals, response2);
    await recordSpend(ctx.orgId, usage2, AI_MODEL);
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      phase: "reply_preview",
      stopReason: response2.stop_reason,
      tools: phase2ToolUse.map(b => b.name),
      usage: usage2,
      usageTotals,
    }, "[agent:plan] model call");
    rawToolCalls.push(...phase2ToolUse.map((b) => ({ id: b.id, name: b.name, input: b.input })));
  }

  const steps: PlanStep[] = rawToolCalls
    .filter((tc) => TOOL_CATEGORIES[tc.name] !== "read")
    .map((tc) => ({
      id: tc.id,
      tool: tc.name,
      label: PLAN_STEP_LABELS[tc.name] ?? tc.name.replace(/_/g, " "),
      description: describeTool(tc.name, tc.input),
      category: TOOL_CATEGORIES[tc.name] ?? "internal",
      enabled: true,
    }));

  logger.info({
    orgId: ctx.orgId,
    threadId: ctx.thread.id,
    durationMs: Date.now() - startedAt,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    readToolCalls,
    rawToolCallCount: rawToolCalls.length,
    rawToolCalls: rawToolCalls.map(tc => tc.name),
    visibleStepCount: steps.length,
    visibleSteps: steps.map(step => step.tool),
    warningCount: warnings.length,
    instructionHash,
  }, "[agent:plan] complete");

  const readResults = readResultsMap.size > 0 ? Object.fromEntries(readResultsMap) : undefined;
  return { instruction, steps, rawToolCalls, readResults, warnings: warnings.length > 0 ? warnings : undefined };
}
