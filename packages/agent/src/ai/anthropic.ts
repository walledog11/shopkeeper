import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export function buildCachedSystemPrompt(text: string): Anthropic.TextBlockParam[] {
  return [{
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  }];
}

// Two cache breakpoints: a stable prefix shared across every request of the same
// module (cross-thread / cross-fixture hits) and a volatile suffix that varies
// per thread/customer but is still reused across a single request's calls
// (planner steps, run iterations). When `stable` is empty, collapses to the
// single-block behavior of buildCachedSystemPrompt.
export function buildSplitCachedSystemPrompt(stable: string, volatile: string): Anthropic.TextBlockParam[] {
  if (!stable) return buildCachedSystemPrompt(volatile);
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: volatile, cache_control: { type: "ephemeral" } },
  ];
}
