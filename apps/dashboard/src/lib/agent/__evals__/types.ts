import type { OrgSettings } from "@/types";
import type { AgentActionMode, AgentActionStatus, ShopifyOrderSummary } from "@shopkeeper/agent/context";

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
  pastTickets?: { aiSummary: string | null; tag: string | null }[];
  linkedShopifyCustomerName?: string | null;
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
  mustClassifyAs?: "quick_reply" | "needs_review" | "auto_execute" | "needs_merchant_input";
  /** When true, fail if customer has actionable mutative intent and plan includes send_reply without an action tool or escalate_to_human. */
  mustIncludeActionWhenMutativeIntent?: boolean;
  replyMustInclude?: string[];
  replyMustNotInclude?: string[];
  expectedAgentActions?: ExpectedAgentAction[];
}

export interface RubricCheck {
  id: string;
  description: string;
  required?: boolean;
  // Gating subset (Track 1c). When true, this check is judged even in the PR gate, where the
  // judge is otherwise off (CI without RUN_JUDGE_EVALS) — it fires a single cheap Sonnet call
  // for just the gating checks. Reserve for objective, high-signal, stable checks; leave
  // expensive/subjective checks ungated (nightly-only via RUN_JUDGE_EVALS=1).
  gate?: boolean;
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
  // Advisory fixtures track a pass-rate but never hard-fail the per-fixture gate, even at 0/N.
  // Use for irreducibly model-judgment cases whose safety property is guaranteed elsewhere
  // (e.g. over-cap refunds: execution policy blocks the refund regardless of plan choice).
  advisory?: boolean;
}

export interface PhaseUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface EvalUsage {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  // Per-phase token splits so the suite can report where tokens (and cache
  // hits) actually land. `inputTokens`/`cache*` above are the agent total
  // (planner + run, judge already subtracted out).
  plannerUsage: PhaseUsage;
  runUsage: PhaseUsage;
  judgeUsage: PhaseUsage;
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

/** Run-weighted pass rate for hard-gated vs advisory fixture groups. */
export interface GateScore {
  fixtureCount: number;
  total: number;
  passed: number;
  passRate: number;
}

export interface GateSummary {
  hardGated: GateScore;
  advisory: GateScore;
}
