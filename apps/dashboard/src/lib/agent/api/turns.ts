import { AGENT_TURN_PREFIX, isAgentTurnContent } from "@clerk/agent/tools";
import type { AgentTurn } from "@/types";

export type AgentTurnAction = AgentTurn["actions"][number];

// The note carries only the metadata the threads UI needs to render a turn
// inline. The canonical per-action record lives in the AgentAction table.
// `id` is the turnId , the join key into AgentAction so we can hydrate actions
// when reading.
interface SerializedAgentTurnNote {
  id?: string;
  instruction: string;
  summary: string | null;
  error: string | null;
  mode?: AgentTurn["mode"];
  senderPhone?: string | null;
  clerkUserId?: string | null;
}

function toNoteShape(turn: AgentTurn): SerializedAgentTurnNote {
  return {
    ...(turn.id ? { id: turn.id } : {}),
    instruction: turn.instruction,
    summary: turn.summary,
    error: turn.error,
    ...(turn.mode ? { mode: turn.mode } : {}),
    ...(turn.senderPhone !== undefined ? { senderPhone: turn.senderPhone } : {}),
    ...(turn.clerkUserId !== undefined ? { clerkUserId: turn.clerkUserId } : {}),
  };
}

export function serializeAgentTurn(turn: AgentTurn): string {
  return `${AGENT_TURN_PREFIX}${JSON.stringify(toNoteShape(turn))}`;
}

function parseAgentTurn(contentText: string | null | undefined): AgentTurn | null {
  if (!contentText?.startsWith(AGENT_TURN_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(contentText.slice(AGENT_TURN_PREFIX.length)) as Partial<AgentTurn>;
    return {
      ...(parsed.id ? { id: parsed.id } : {}),
      instruction: parsed.instruction ?? "",
      // Legacy notes carry the full actions array; new notes omit it because
      // AgentAction is now the canonical per-tool record. Hydration happens in
      // extractAgentTurnsFromMessages when an actionsByTurnId map is supplied.
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      summary: parsed.summary ?? null,
      error: parsed.error ?? null,
      ...(parsed.mode ? { mode: parsed.mode } : {}),
      ...(parsed.senderPhone !== undefined ? { senderPhone: parsed.senderPhone } : {}),
      ...(parsed.clerkUserId !== undefined ? { clerkUserId: parsed.clerkUserId } : {}),
    };
  } catch {
    return null;
  }
}

type MessageWithAgentTurn = {
  id: string;
  contentText: string | null;
};

export function extractAgentTurnsFromMessages<T extends MessageWithAgentTurn>(
  messages: T[],
  actionsByTurnId?: Record<string, AgentTurnAction[]>,
): AgentTurn[] {
  return messages
    .map((message) => parseAgentTurn(message.contentText))
    .filter((turn): turn is AgentTurn => turn !== null)
    .map((turn) => {
      if (!actionsByTurnId || !turn.id) return turn;
      const hydrated = actionsByTurnId[turn.id];
      return hydrated ? { ...turn, actions: hydrated } : turn;
    });
}

export function excludeAgentTurnMessages<T extends MessageWithAgentTurn>(messages: T[]): T[] {
  return messages.filter((message) => !isAgentTurnContent(message.contentText));
}

export const agentTurnMessageFilter = {
  senderType: "note" as const,
  contentText: { startsWith: AGENT_TURN_PREFIX },
};
