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
