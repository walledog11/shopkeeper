import type { CustomerMemory } from "@clerk/db";

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency?: string | null;
  items: {
    line_item_id: string | null;
    title: string;
    quantity: number;
    variant_id: string | null;
    fulfillable_quantity: number | null;
    current_quantity: number | null;
    fulfillment_status: string | null;
  }[];
}

export interface AgentContext {
  orgId: string;
  orgName: string;
  thread: {
    id: string;
    status: string;
    channelType: string;
    tag: string | null;
    aiSummary: string | null;
    shopifyCustomerId: string | null;
  };
  customer: {
    id: string;
    name: string | null;
    platformId: string;
  };
  customerMemory: CustomerMemory | null;
  recentMessages: { senderType: string; contentText: string | null }[];
  openThreadCount: number;
  shopify: { shop: string; accessToken: string } | null;
  recentOrders: ShopifyOrderSummary[];
  kbArticles: { title: string; body: string }[];
}

export type AgentActionStatus = "success" | "error" | "policy_block" | "escalated";
export type AgentActionMode = "human_approved" | "auto_executed" | "read_only";

export interface ActionEntry {
  tool: string;
  result: string;
  input?: unknown;
  durationMs?: number;
  status?: AgentActionStatus;
  mode?: AgentActionMode;
  errorDetail?: string;
  category?: string;
}

export interface AgentResult {
  summary: string;
  actionsPerformed: ActionEntry[];
}
