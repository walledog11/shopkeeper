import { anthropic } from "./anthropic";
import type Anthropic from "@anthropic-ai/sdk";

// Single source of truth for the AI model used across the dashboard.
// Change this one constant to upgrade or swap models everywhere.
export const AI_MODEL = "claude-haiku-4-5-20251001";

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
export async function generateText(
  systemPrompt: string,
  messages: AIMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  if (isDeterministicE2EAIEnabled()) {
    return deterministicE2EText(systemPrompt, messages);
  }

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.5,
    system: systemPrompt,
    messages,
  });

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
