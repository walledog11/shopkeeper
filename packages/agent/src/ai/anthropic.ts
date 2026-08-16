import Anthropic from "@anthropic-ai/sdk";

let anthropicClient: Anthropic | null = null;

function resolveAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_target, property, receiver) {
    const client = resolveAnthropicClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
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
    { type: "text", text: stable, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: volatile, cache_control: { type: "ephemeral" } },
  ];
}
