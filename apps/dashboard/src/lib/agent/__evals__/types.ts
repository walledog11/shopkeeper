import type { CustomerMemory } from "@clerk/db";
import type { OrgSettings } from "@/types";
import type { AgentActionMode, AgentActionStatus, ShopifyOrderSummary } from "../types";

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
  linkedShopifyCustomerName?: string | null;
  shopify?: { shop: string; accessToken: string } | null;
  shopifyCustomerId?: string | null;
  openThreadCount?: number;
  orgSettings?: Partial<OrgSettings>;
  simulateToolResults?: SimulatedToolResult[];
  customerMemory?: CustomerMemory;
}

export interface ToolInputExpectation {
  tool: string;
  inputIncludes: Record<string, unknown>;
}

export interface ExpectedAgentAction {
  tool: string;
  status: AgentActionStatus;
  mode: AgentActionMode;
}

export interface ExpectedPlan {
  mustCallTools?: string[];
  mustCallToolsInOrder?: string[];
  mustCallToolsWithInput?: ToolInputExpectation[];
  mustNotCallTools?: string[];
  mustEscalate?: boolean;
  mustClassifyAs?: "quick_reply" | "needs_review" | "auto_execute";
  replyMustInclude?: string[];
  replyMustNotInclude?: string[];
  expectedAgentActions?: ExpectedAgentAction[];
}

export interface RubricCheck {
  id: string;
  description: string;
  required?: boolean;
}

export interface JudgeResult {
  checkId: string;
  pass: boolean;
  reasoning: string;
}

export interface ExpectedRubric {
  checks: RubricCheck[];
}

export interface Fixture {
  id: string;
  description: string;
  setup: ThreadSetup;
  instruction: string;
  expectedPlan: ExpectedPlan;
  expectedRubric?: ExpectedRubric;
}

export interface EvalUsage {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  judgeUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export interface EvalResult {
  id: string;
  pass: boolean;
  failures: string[];
  usage: EvalUsage;
  latencyMs: number;
}

export interface CategoryScore {
  total: number;
  passed: number;
  passRate: number;
}

export interface FixtureScore {
  repeats: number;
  passes: number;
  passRate: number;
}

// Aggregates the N repeats of a single fixture into one pass-rate. `results` holds each
// repeat so callers can surface latency/usage and the failures of the last failing run.
export interface FixtureRunSummary {
  id: string;
  repeats: number;
  passes: number;
  passRate: number;
  results: EvalResult[];
}

export interface EvalBaseline {
  generatedAt: string;
  // Repeats-per-fixture used to generate this baseline. `total`/`passed` count individual
  // runs (fixtures × repeats), so passRate = passed / total reduces to today's numbers at repeats=1.
  repeats: number;
  total: number;
  passed: number;
  passRate: number;
  categories: Record<string, CategoryScore>;
  fixtures: Record<string, FixtureScore>;
}
