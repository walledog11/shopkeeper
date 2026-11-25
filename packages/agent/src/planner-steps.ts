import type { PlanStep, RawToolCall } from "./types.js";
import { PLAN_STEP_LABELS, TOOL_CATEGORIES } from "./tools/registry/index.js";
import { lineItemWriteSentence } from "./line-item-display.js";

function describeTool(name: string, input: unknown): string {
  const lineItemSentence = lineItemWriteSentence(name, input);
  if (lineItemSentence) return lineItemSentence;
  const a = input as Record<string, unknown>;
  switch (name) {
    case "search_kb":
      return `Search knowledge base for "${String(a.query ?? "")}"`;
    // Every value the write sets, because this is what the merchant approves:
    // on the card and in the dashboard, a bare label asks for a blind yes.
    case "update_shopify_order_address": {
      const parts = [a.address1, a.address2, a.city, a.province, a.zip, a.country].filter(Boolean);
      return `Update their shipping address on Shopify to ${parts.join(", ")}`;
    }
    case "update_shopify_customer_info": {
      const changes: string[] = [];
      if (a.email) changes.push(`email to ${a.email}`);
      if (a.phone) changes.push(`phone to ${a.phone}`);
      if (a.first_name || a.last_name) changes.push(`name to ${[a.first_name, a.last_name].filter(Boolean).join(" ")}`);
      return changes.length ? `Change their ${changes.join(", ")} on Shopify` : "Update their details on Shopify";
    }
    case "create_refund":
      return a.amount ? `Refund $${a.amount}` : "Refund the whole order";
    case "cancel_order":
      return `Cancel the order and refund the payment${a.reason ? ` (${a.reason})` : ""}`;
    case "create_shopify_order": {
      const items = (a.line_items as { title?: string; variant_id?: string; quantity: number }[] ?? [])
        .map(li => `${li.quantity}x ${li.title ?? `variant ${li.variant_id}`}`)
        .join(", ");
      return `Create an order for ${a.first_name} ${a.last_name}${items ? `: ${items}` : ""}`;
    }
    case "add_shopify_customer_note":
      return a.note ? `Add a note to their Shopify profile: "${String(a.note).trim()}"` : "Add a note to their Shopify profile";
    case "send_reply": {
      const text = String(a.text ?? "");
      return text.length > 80 ? `"${text.slice(0, 80)}…"` : `"${text}"`;
    }
    case "send_email": {
      const body = String(a.body ?? "");
      const preview = body.length > 60 ? `${body.slice(0, 60)}…` : body;
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
    case "issue_discount":
      return `Issue a ${a.percentage}% discount code${a.reason ? ` (${a.reason})` : ""}`;
    case "create_exchange":
      return `Set up exchange - return variant ${a.variant_id}, record replacement variant ${a.exchange_variant_id}${a.quantity ? ` (${a.quantity}x)` : ""}`;
    case "issue_store_credit":
      return `Issue $${a.amount} in store credit`;
    case "create_gift_card":
      return `Create a $${a.amount} gift card${a.reason ? ` (${a.reason})` : ""}`;
    case "attach_return_label":
      return `Attach the return label${a.tracking_number ? ` (tracking ${a.tracking_number})` : ""}`;
    case "fulfill_order":
      return `Mark the order fulfilled${a.tracking_number ? ` (tracking ${a.tracking_number})` : ""}${a.notify_customer === false ? ", without emailing them" : ""}`;
    default:
      return name.replace(/_/g, " ");
  }
}

export function buildPlanSteps(rawToolCalls: RawToolCall[]): PlanStep[] {
  return rawToolCalls.flatMap((tc) => (
    TOOL_CATEGORIES[tc.name] !== "read" ? [{
      id: tc.id,
      tool: tc.name,
      label: PLAN_STEP_LABELS[tc.name] ?? tc.name.replace(/_/g, " "),
      description: describeTool(tc.name, tc.input),
      category: TOOL_CATEGORIES[tc.name] ?? "internal",
      enabled: true,
    }] : []
  ));
}
