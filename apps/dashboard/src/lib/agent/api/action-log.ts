import { db } from "@clerk/db";
import { AGENT_TURN_PREFIX, isAgentTurnContent } from "@/lib/agent/turn-content";
import { TOOL_LABELS } from "@/lib/agent/tools";
import {
  decodeActionLogCursor,
  encodeActionLogCursor,
  parseAgentTurn,
  toActionLogEntry,
  type ActionLogCursor,
} from "@/lib/agent/api/turns";
import type { ActionLogEntry, AgentTurn } from "@/types";

export { isAgentTurnContent } from "@/lib/agent/turn-content";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_EXPORT_PAGE_SIZE = 250;

export const agentTurnMessageFilter = {
  senderType: "note" as const,
  contentText: { startsWith: AGENT_TURN_PREFIX },
};

type MessageWithAgentTurn = {
  id: string;
  contentText: string | null;
};

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

export async function listAllAgentActionLogEntries(params: {
  orgId: string;
  pageSize?: number;
  batchSize?: number;
}): Promise<ActionLogEntry[]> {
  const pageSize = params.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE;
  const batchSize = params.batchSize ?? Math.max(pageSize, DEFAULT_BATCH_SIZE);

  const entries: ActionLogEntry[] = [];
  let cursor: ActionLogCursor | null = null;

  // Export uses cursor-based pagination so Settings and Activity share the same source of truth.
  // We step through the entire action log in bounded chunks rather than querying raw notes again.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await listAgentActionLogEntries({
      orgId: params.orgId,
      cursor,
      pageSize,
      batchSize,
    });
    entries.push(...page.entries);

    if (!page.nextCursor) {
      break;
    }

    const nextCursor = decodeActionLogCursor(page.nextCursor);
    if (!nextCursor) {
      break;
    }

    cursor = nextCursor;
  }

  return entries;
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeCsvText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function serializeAgentActionLogCsv(entries: ActionLogEntry[]): string {
  const headers = [
    "timestamp",
    "customer",
    "channel",
    "thread_tag",
    "thread_id",
    "instruction",
    "summary",
    "actions",
    "action_results",
  ];

  const rows = entries.map((entry) => {
    const actions = entry.actions
      .map((action) => normalizeCsvText(TOOL_LABELS[action.tool] ?? action.tool))
      .join(" | ");
    const actionResults = entry.actions
      .map((action) => `${normalizeCsvText(TOOL_LABELS[action.tool] ?? action.tool)}: ${normalizeCsvText(action.result)}`)
      .join(" || ");

    return [
      entry.sentAt,
      entry.customerHandle,
      entry.channelType,
      entry.threadTag ?? "",
      entry.threadId,
      entry.instruction ?? "",
      entry.summary,
      actions,
      actionResults,
    ].map((cell) => escapeCsvCell(normalizeCsvText(cell))).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
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
