import { anthropic } from "./anthropic.js";
import type Anthropic from "@anthropic-ai/sdk";
import type { OrgSettings } from "../types.js";
import { enforceSpendCap, recordSpend } from "../spend.js";
import { resolveAgentSettings } from "../settings.js";
import { readModelUsage } from "../usage.js";

// Model tiers for the dashboard. Two models, one place that maps a call's
// purpose to one of them. Judgment/mutative calls (the planner's re-plan
// decision and the mutative agent-run loop) run on Sonnet; everything else —
// reads, the forced reply draft, composer-ask, summaries, classification —
// stays on Haiku.
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";

// Single source of truth for non-agent AI calls (drafts, summaries,
// classification/tagging). Agent call sites pick their tier via pickModel().
export const AI_MODEL = HAIKU_MODEL;

// A call's purpose, not its channel. Enumerated in full so each call site is
// explicit about its tier even when it resolves to Haiku.
export type ModelTask =
  | "plan_initial"  // planner first pass: read-tool selection / context gather
  | "plan_replan"   // planner re-plan: the refund/cancel/edit/escalate decision
  | "reply_draft"   // planner forced send_reply drafting
  | "agent_run"     // run.ts mutative agent loop (operator + end-to-end)
  | "composer_ask"; // run.ts read-only Q&A

const SONNET_TASKS: ReadonlySet<ModelTask> = new Set<ModelTask>([
  "plan_replan",
  "agent_run",
]);

// Map a call's purpose to a model. The one place model tiering lives.
export function pickModel(task: ModelTask): string {
  return SONNET_TASKS.has(task) ? SONNET_MODEL : HAIKU_MODEL;
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Generate a text response from the AI given a system prompt and message history.
 * Use this for all non-agent AI calls (drafts, summaries, classifications, etc.).
 *
 * @param systemPrompt  Instructions for how the model should behave
 * @param messages      Conversation turns in chronological order
 * @param options.maxTokens  Max tokens in the response (default 1024)
 * @param options.temperature  0–1, higher = more creative (default 0.5)
 */
export interface GenerateTextOptions {
  maxTokens?: number;
  temperature?: number;
  // When provided, the call is gated by the org's daily LLM spend cap and the
  // token usage is recorded against the org. Omit only for tests / paths that
  // genuinely have no org context.
  orgId?: string;
  settings?: Partial<OrgSettings> | null;
}

export async function generateText(
  systemPrompt: string,
  messages: AIMessage[],
  options?: GenerateTextOptions,
): Promise<string> {
  if (isDeterministicE2EAIEnabled()) {
    return deterministicE2EText(systemPrompt, messages);
  }

  if (options?.orgId) {
    await enforceSpendCap(options.orgId, resolveAgentSettings(options.settings ?? null));
  }

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.5,
    system: systemPrompt,
    messages,
  });

  if (options?.orgId) {
    await recordSpend(options.orgId, readModelUsage(response), AI_MODEL);
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return textBlock?.text ?? "";
}

export function isDeterministicE2EAIEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.E2E_TEST_RUN === "true" && env.E2E_AI_MODE === "deterministic";
}

function deterministicE2EText(systemPrompt: string, messages: AIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find(message => message.role === "user")?.content.trim();
  if (systemPrompt.toLowerCase().includes("summarizing")) {
    return lastUserMessage ? `Customer needs help with: ${lastUserMessage.slice(0, 80)}` : "Customer needs help.";
  }
  return lastUserMessage ? `E2E deterministic response: ${lastUserMessage.slice(0, 160)}` : "E2E deterministic response.";
}
