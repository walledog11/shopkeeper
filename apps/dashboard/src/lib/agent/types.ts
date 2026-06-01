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
  shipping_address: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
}

// Module-agnostic agent context: the org identity, customer memory, and the
// conversation any module's agent loop operates on. Future modules compose
// their own context on top of this base.
export interface BaseAgentContext {
  orgId: string;
  orgName: string;
  customerMemory: CustomerMemory | null;
  recentMessages: { senderType: string; contentText: string | null }[];
}

// Support module context: the base plus the ticket, customer, Shopify linkage,
// recent orders, and KB articles the support agent needs.
export interface SupportContext extends BaseAgentContext {
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
  openThreadCount: number;
  shopify: { shop: string; accessToken: string } | null;
  recentOrders: ShopifyOrderSummary[];
  linkedShopifyCustomerName: string | null;
  kbArticles: { title: string; body: string }[];
}

export type AgentContext = SupportContext;

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
