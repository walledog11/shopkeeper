import { Buffer } from "node:buffer";
import { AGENT_TURN_PREFIX } from "@/lib/agent/tools";
import type { ActionLogEntry, AgentTurn } from "@/types";

export interface ActionLogCursor {
  sentAt: string;
  id: string;
}

export function serializeAgentTurn(turn: AgentTurn): string {
  return `${AGENT_TURN_PREFIX}${JSON.stringify(turn)}`;
}

export function parseAgentTurn(contentText: string | null | undefined): AgentTurn | null {
  if (!contentText?.startsWith(AGENT_TURN_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(contentText.slice(AGENT_TURN_PREFIX.length)) as AgentTurn;
  } catch {
    return null;
  }
}

export function encodeActionLogCursor(cursor: ActionLogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeActionLogCursor(cursor: string): ActionLogCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ActionLogCursor>;
    if (!parsed.sentAt || !parsed.id) {
      return null;
    }
    if (Number.isNaN(new Date(parsed.sentAt).getTime())) {
      return null;
    }
    return { sentAt: parsed.sentAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function toActionLogEntry(
  message: {
    id: string;
    sentAt: Date;
    thread: {
      id: string;
      channelType: string;
      tag: string | null;
      customer: {
        name: string | null;
        platformId: string;
      };
    };
  },
  turn: AgentTurn,
): ActionLogEntry | null {
  if (!turn.actions?.length) {
    return null;
  }

  const handle = message.thread.customer.name ??
    (message.thread.customer.platformId.startsWith("dashboard:")
      ? "Dashboard session"
      : message.thread.customer.platformId);

  return {
    id: message.id,
    sentAt: message.sentAt.toISOString(),
    threadId: message.thread.id,
    channelType: message.thread.channelType,
    threadTag: message.thread.tag,
    customerHandle: handle,
    instruction: turn.instruction ?? null,
    summary: turn.summary ?? "",
    actions: turn.actions,
  };
}
