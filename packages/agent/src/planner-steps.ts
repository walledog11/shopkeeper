import type { PlanStep, RawToolCall } from "./types.js";
import { PLAN_STEP_LABELS, TOOL_CATEGORIES } from "./tools/registry/index.js";

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
      return `Issue ${a.percentage}% discount code${a.reason ? ` (${a.reason})` : ""}`;
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
