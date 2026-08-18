import Anthropic from "@anthropic-ai/sdk";

let anthropicClient: Anthropic | null = null;

// The SDK defaults — a 10-minute timeout and 2 retries — are wrong for both
// hosts. Dashboard agent routes declare `maxDuration = 60`, so the platform
// kills the request long before the SDK timeout can fire, and the caller gets an
// opaque function timeout instead of a logged provider error. In the gateway
// there is no platform cap at all, so a wedged call holds a BullMQ worker slot
// for ten minutes.
//
// 60s clears the worst legitimate completion with room to spare: every call site
// is non-streaming and bounded at or below PLAN_REPLAN_MAX_TOKENS (2048), which
// lands well under a minute. Retries drop to 1 because the gateway already
// retries at the job level (`attempts: 3`), and the two multiply — SDK 2 + BullMQ
// 3 is up to nine provider calls for one job.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

function resolveAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
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
