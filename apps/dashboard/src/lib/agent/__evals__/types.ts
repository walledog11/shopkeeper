import type { OrgSettings } from "@/types";
import type { ShopifyOrderSummary } from "../types";

export interface FixtureMessage {
  senderType: "customer" | "agent" | "ai" | "note";
  contentText: string;
}

export interface FixtureKbArticle {
  title: string;
  body: string;
}

export interface SimulatedToolResult {
  tool: string;
  result: string;
}

export interface ThreadSetup {
  channelType: "email" | "instagram" | "telegram" | "shopify" | "dashboard_agent" | "sms_agent";
  tag?: string;
  aiSummary?: string;
  customerName?: string;
  customerPlatformId?: string;
  messages: FixtureMessage[];
  kbArticles?: FixtureKbArticle[];
  recentOrders?: ShopifyOrderSummary[];
  shopify?: { shop: string; accessToken: string } | null;
  shopifyCustomerId?: string | null;
  openThreadCount?: number;
  orgSettings?: Partial<OrgSettings>;
  simulateToolResults?: SimulatedToolResult[];
}

export interface ToolInputExpectation {
  tool: string;
  inputIncludes: Record<string, unknown>;
}

export interface ExpectedPlan {
  mustCallTools?: string[];
  mustCallToolsInOrder?: string[];
  mustCallToolsWithInput?: ToolInputExpectation[];
  mustNotCallTools?: string[];
  mustEscalate?: boolean;
  mustClassifyAs?: "quick_reply" | "needs_review";
  replyMustInclude?: string[];
  replyMustNotInclude?: string[];
}

export interface Fixture {
  id: string;
  description: string;
  setup: ThreadSetup;
  instruction: string;
  expectedPlan: ExpectedPlan;
}

export interface EvalUsage {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface EvalResult {
  id: string;
  pass: boolean;
  failures: string[];
  usage: EvalUsage;
  latencyMs: number;
}
