import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";

export const UNTRUSTED_OPEN_TAG = "<customer_message>";
export const UNTRUSTED_CLOSE_TAG = "</customer_message>";

// Wrap untrusted external text (customer / supplier / social-DM prose) in
// explicit boundary tags so the model can tell data from instructions. Any
// forged copy of the boundary tags inside the content is defanged first, so a
// hostile message can't close the wrapper early and smuggle in instructions.
function wrapUntrusted(text: string): string {
  const defanged = text
    .split(UNTRUSTED_OPEN_TAG).join("<customer_message >")
    .split(UNTRUSTED_CLOSE_TAG).join("</customer_message >");
  return `${UNTRUSTED_OPEN_TAG}\n${defanged}\n${UNTRUSTED_CLOSE_TAG}`;
}

export function buildMessageHistory(
  recentMessages: AgentContext["recentMessages"],
  instruction: string,
  options?: { segregateUntrusted?: boolean }
): Anthropic.MessageParam[] {
  const segregateUntrusted = options?.segregateUntrusted ?? false;
  const rawHistory = recentMessages.flatMap((m) => m.senderType !== "note" ? [{
      role: m.senderType === "agent" ? "assistant" as const : "user" as const,
      content: segregateUntrusted && m.senderType === "customer"
        ? wrapUntrusted(m.contentText ?? "(media)")
        : (m.contentText ?? "(media)"),
    }] : []);

  const merged: Anthropic.MessageParam[] = [];
  for (const msg of rawHistory) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role && typeof last.content === "string") {
      last.content += "\n" + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }
  while (merged.length > 0 && merged[0].role === "assistant") {
    merged.shift();
  }

  const tail = merged[merged.length - 1];
  if (tail && tail.role === "user" && typeof tail.content === "string" && tail.content === instruction) {
    return merged;
  }

  return [...merged, { role: "user", content: instruction }];
}
