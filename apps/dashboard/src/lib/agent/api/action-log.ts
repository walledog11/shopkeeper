import { db } from "@clerk/db";
import { AGENT_TURN_PREFIX } from "@/lib/agent/tools";
import {
  encodeActionLogCursor,
  parseAgentTurn,
  toActionLogEntry,
  type ActionLogCursor,
} from "@/lib/agent/api/turns";
import type { ActionLogEntry, AgentTurn } from "@/types";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_BATCH_SIZE = 100;

export const agentTurnMessageFilter = {
  senderType: "note" as const,
  contentText: { startsWith: AGENT_TURN_PREFIX },
};

type MessageWithAgentTurn = {
  id: string;
  contentText: string | null;
};

export function isAgentTurnContent(contentText: string | null | undefined): boolean {
  return !!contentText?.startsWith(AGENT_TURN_PREFIX);
}

export function extractAgentTurnsFromMessages<T extends MessageWithAgentTurn>(messages: T[]): AgentTurn[] {
  return messages
    .map((message) => parseAgentTurn(message.contentText))
    .filter((turn): turn is AgentTurn => turn !== null);
}

export function excludeAgentTurnMessages<T extends MessageWithAgentTurn>(messages: T[]): T[] {
  return messages.filter((message) => !isAgentTurnContent(message.contentText));
}

export async function listAgentActionLogEntries(params: {
  orgId: string;
  cursor?: ActionLogCursor | null;
  pageSize?: number;
  batchSize?: number;
}): Promise<{ entries: ActionLogEntry[]; nextCursor: string | null }> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const batchSize = params.batchSize ?? DEFAULT_BATCH_SIZE;

  const entries: ActionLogEntry[] = [];
  let nextQueryCursor = params.cursor ?? null;
  let nextCursor: string | null = null;

  while (entries.length < pageSize) {
    const messages = await db.message.findMany({
      where: {
        ...agentTurnMessageFilter,
        deletedAt: null,
        thread: { organizationId: params.orgId },
        ...(nextQueryCursor ? {
          OR: [
            { sentAt: { lt: new Date(nextQueryCursor.sentAt) } },
            {
              sentAt: new Date(nextQueryCursor.sentAt),
              id: { lt: nextQueryCursor.id },
            },
          ],
        } : {}),
      },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      take: batchSize,
      select: {
        id: true,
        sentAt: true,
        contentText: true,
        thread: {
          select: {
            id: true,
            channelType: true,
            tag: true,
            customer: {
              select: {
                name: true,
                platformId: true,
              },
            },
          },
        },
      },
    });

    if (messages.length === 0) {
      nextCursor = null;
      break;
    }

    for (const message of messages) {
      const turn = parseAgentTurn(message.contentText);
      if (!turn) {
        continue;
      }

      const entry = toActionLogEntry(message, turn);
      if (!entry) {
        continue;
      }

      entries.push(entry);
      if (entries.length === pageSize) {
        break;
      }
    }

    const lastMessage = messages[messages.length - 1];
    nextQueryCursor = { sentAt: lastMessage.sentAt.toISOString(), id: lastMessage.id };
    nextCursor = messages.length < batchSize ? null : encodeActionLogCursor(nextQueryCursor);

    if (messages.length < batchSize) {
      break;
    }
  }

  return { entries, nextCursor };
}

export async function listAgentTurnsForOrgInRange(orgId: string, from: Date, to: Date): Promise<AgentTurn[]> {
  const messages = await db.message.findMany({
    where: {
      ...agentTurnMessageFilter,
      sentAt: { gte: from, lte: to },
      deletedAt: null,
      thread: { organizationId: orgId },
    },
    select: {
      id: true,
      contentText: true,
    },
    take: 5000,
  });

  return extractAgentTurnsFromMessages(messages);
}
