import { Buffer } from "node:buffer";
import type { Prisma } from "@prisma/client";
import { db, type DbChannelType as ChannelType } from "@clerk/db";
import { TOOL_LABELS } from "@/lib/agent/tools";
import type { ActionLogFilters } from "@/lib/agent/api/validation";
import type { ActionLogEntry, AgentTurn } from "@/types";

// Legacy note helpers , agent turns also write a slim summary note for inline
// thread rendering. These exports stay so callers that filter/exclude those
// notes (threads UI, page-level message counters, GDPR export) keep working.
export { isAgentTurnContent } from "@/lib/agent/tools/turn-content";
export {
  agentTurnMessageFilter,
  excludeAgentTurnMessages,
  extractAgentTurnsFromMessages,
} from "@/lib/agent/api/turns";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_EXPORT_BATCH_SIZE = 250;

const OPERATOR_DASHBOARD_PLATFORM_PREFIX = "dashboard:";

export interface AgentActionCursor {
  executedAt: string;
  turnId: string;
}

export function encodeAgentActionCursor(cursor: AgentActionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAgentActionCursor(cursor: string): AgentActionCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<AgentActionCursor>;
    if (!parsed.executedAt || !parsed.turnId) return null;
    if (Number.isNaN(new Date(parsed.executedAt).getTime())) return null;
    return { executedAt: parsed.executedAt, turnId: parsed.turnId };
  } catch {
    return null;
  }
}

function buildActionWhere(orgId: string, filters?: ActionLogFilters): Prisma.AgentActionWhereInput {
  const where: Prisma.AgentActionWhereInput = { organizationId: orgId };

  if (filters?.from || filters?.to) {
    where.executedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters?.channels?.length) {
    where.thread = { channelType: { in: filters.channels as ChannelType[] } };
  }

  return where;
}

function buildTurnSelectionWhere(orgId: string, filters?: ActionLogFilters): Prisma.AgentActionWhereInput {
  const where = buildActionWhere(orgId, filters);
  if (filters?.tools?.length) where.tool = { in: filters.tools };
  if (filters?.modes?.length) where.mode = { in: filters.modes };
  if (filters?.errorsOnly) where.status = { in: ["error", "policy_block"] };
  return where;
}

function applyCursor(
  where: Prisma.AgentActionWhereInput,
  cursor: AgentActionCursor | null,
): Prisma.AgentActionWhereInput {
  if (!cursor) return where;
  const at = new Date(cursor.executedAt);
  return {
    ...where,
    OR: [
      { executedAt: { lt: at } },
      { executedAt: at, turnId: { lt: cursor.turnId } },
    ],
  };
}

interface RawActionRow {
  id: string;
  turnId: string;
  threadId: string | null;
  tool: string;
  input: Prisma.JsonValue;
  output: string | null;
  status: string;
  mode: string;
  durationMs: number;
  approverId: string | null;
  instruction: string | null;
  summary: string | null;
  executedAt: Date;
  thread: {
    id: string;
    channelType: string;
    tag: string | null;
    customer: { name: string | null; platformId: string };
  } | null;
}

const ACTION_LOG_SELECT = {
  id: true,
  turnId: true,
  threadId: true,
  tool: true,
  input: true,
  output: true,
  status: true,
  mode: true,
  durationMs: true,
  approverId: true,
  instruction: true,
  summary: true,
  executedAt: true,
  thread: {
    select: {
      id: true,
      channelType: true,
      tag: true,
      customer: { select: { name: true, platformId: true } },
    },
  },
} satisfies Prisma.AgentActionSelect;

function customerHandle(customer: { name: string | null; platformId: string } | null): string {
  if (!customer) return "Unknown";
  if (customer.name) return customer.name;
  if (customer.platformId.startsWith(OPERATOR_DASHBOARD_PLATFORM_PREFIX)) {
    return "Dashboard session";
  }
  return customer.platformId;
}

function isValidMode(value: string): value is NonNullable<ActionLogEntry["mode"]> {
  return value === "human_approved" || value === "auto_executed" || value === "read_only";
}

function isValidActionStatus(value: string): value is NonNullable<ActionLogEntry["actions"][number]["status"]> {
  return value === "success" || value === "error" || value === "policy_block" || value === "escalated";
}

// approverId is denormalized as `<clerkUserId>:<displayName>` (or bare id if
// no display name was available at approval time). See formatApproverId.
function parseApprover(raw: string | null): ActionLogEntry["approver"] {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx === -1) return { id: raw, displayName: null };
  return { id: raw.slice(0, idx), displayName: raw.slice(idx + 1) || null };
}

function buildEntryFromRows(turnId: string, rows: RawActionRow[]): ActionLogEntry | null {
  if (rows.length === 0) return null;
  // Within a turn every row shares the turn-level fields; first row is canonical.
  const first = rows[0];
  if (!first.thread) return null;

  const actions = rows.map((row) => ({
    tool: row.tool,
    result: row.output ?? "",
    input: row.input ?? undefined,
    durationMs: row.durationMs,
    ...(isValidActionStatus(row.status) ? { status: row.status } : {}),
  }));
  const summary = first.summary?.trim()
    || actions.map((action) => TOOL_LABELS[action.tool] ?? action.tool).join(" · ");

  return {
    id: turnId,
    sentAt: first.executedAt.toISOString(),
    threadId: first.thread.id,
    channelType: first.thread.channelType,
    threadTag: first.thread.tag,
    customerHandle: customerHandle(first.thread.customer),
    instruction: first.instruction ?? null,
    summary,
    actions,
    mode: isValidMode(first.mode) ? first.mode : null,
    approver: parseApprover(first.approverId),
  };
}

async function fetchTurnsPage(params: {
  orgId: string;
  cursor: AgentActionCursor | null;
  filters?: ActionLogFilters;
  pageSize: number;
}): Promise<{ turns: ActionLogEntry[]; nextCursor: AgentActionCursor | null }> {
  const { orgId, cursor, filters, pageSize } = params;

  // Phase 1: select which turn IDs go on this page. We filter at row level (so
  // tool/errorsOnly narrow the turn set) and then group up to pageSize turns.
  const selectionWhere = applyCursor(buildTurnSelectionWhere(orgId, filters), cursor);
  const turnGroups = await db.agentAction.groupBy({
    by: ["turnId"],
    where: selectionWhere,
    _max: { executedAt: true },
    orderBy: [{ _max: { executedAt: "desc" } }, { turnId: "desc" }],
    take: pageSize + 1,
  });

  if (turnGroups.length === 0) {
    return { turns: [], nextCursor: null };
  }

  const hasMore = turnGroups.length > pageSize;
  const pageTurns = hasMore ? turnGroups.slice(0, pageSize) : turnGroups;
  const turnIds = pageTurns.map((g) => g.turnId);

  // Phase 2: load every row for the selected turns (unfiltered at row level ,
  // we want the full action breakdown even when the user filters by one tool).
  const rows = await db.agentAction.findMany({
    where: { ...buildActionWhere(orgId, filters), turnId: { in: turnIds } },
    select: ACTION_LOG_SELECT,
    orderBy: [{ executedAt: "asc" }, { id: "asc" }],
  });

  const byTurn = new Map<string, RawActionRow[]>();
  for (const row of rows) {
    const bucket = byTurn.get(row.turnId);
    if (bucket) bucket.push(row);
    else byTurn.set(row.turnId, [row]);
  }

  const entries: ActionLogEntry[] = [];
  for (const turnId of turnIds) {
    const entry = buildEntryFromRows(turnId, byTurn.get(turnId) ?? []);
    if (entry) entries.push(entry);
  }

  const last = pageTurns[pageTurns.length - 1];
  const nextCursor = hasMore && last._max.executedAt
    ? { executedAt: last._max.executedAt.toISOString(), turnId: last.turnId }
    : null;

  return { turns: entries, nextCursor };
}

export async function listAgentActionLogEntries(params: {
  orgId: string;
  cursor?: AgentActionCursor | null;
  filters?: ActionLogFilters;
  pageSize?: number;
}): Promise<{ entries: ActionLogEntry[]; nextCursor: string | null }> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const { turns, nextCursor } = await fetchTurnsPage({
    orgId: params.orgId,
    cursor: params.cursor ?? null,
    filters: params.filters,
    pageSize,
  });
  return {
    entries: turns,
    nextCursor: nextCursor ? encodeAgentActionCursor(nextCursor) : null,
  };
}

// Async iterator over every action-log entry for an org, streamed in
// bounded-size pages so CSV export does not load the full history into memory.
export async function* iterateAgentActionLogEntries(params: {
  orgId: string;
  filters?: ActionLogFilters;
  batchSize?: number;
}): AsyncGenerator<ActionLogEntry> {
  const batchSize = params.batchSize ?? DEFAULT_EXPORT_BATCH_SIZE;
  let cursor: AgentActionCursor | null = null;
  while (true) {
    const { turns, nextCursor } = await fetchTurnsPage({
      orgId: params.orgId,
      cursor,
      filters: params.filters,
      pageSize: batchSize,
    });
    for (const entry of turns) yield entry;
    if (!nextCursor) return;
    cursor = nextCursor;
  }
}

export async function listAllAgentActionLogEntries(params: {
  orgId: string;
  filters?: ActionLogFilters;
  batchSize?: number;
}): Promise<ActionLogEntry[]> {
  const out: ActionLogEntry[] = [];
  for await (const entry of iterateAgentActionLogEntries(params)) {
    out.push(entry);
  }
  return out;
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeCsvText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export const ACTION_LOG_CSV_HEADERS = [
  "timestamp",
  "customer",
  "channel",
  "thread_tag",
  "thread_id",
  "mode",
  "instruction",
  "summary",
  "actions",
  "action_results",
];

export function actionLogEntryToCsvRow(entry: ActionLogEntry): string {
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
    entry.mode ?? "",
    entry.instruction ?? "",
    entry.summary,
    actions,
    actionResults,
  ].map((cell) => escapeCsvCell(normalizeCsvText(cell))).join(",");
}

export function serializeAgentActionLogCsv(entries: ActionLogEntry[]): string {
  const rows = entries.map(actionLogEntryToCsvRow);
  return [ACTION_LOG_CSV_HEADERS.join(","), ...rows].join("\n");
}

export function streamAgentActionLogCsv(params: {
  orgId: string;
  filters?: ActionLogFilters;
  batchSize?: number;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = iterateAgentActionLogEntries(params);
  let wroteHeader = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!wroteHeader) {
        wroteHeader = true;
        controller.enqueue(encoder.encode(`${ACTION_LOG_CSV_HEADERS.join(",")}\n`));
        return;
      }
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${actionLogEntryToCsvRow(value)}\n`));
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}

export async function listAgentTurnsForOrgInRange(orgId: string, from: Date, to: Date): Promise<AgentTurn[]> {
  const rows = await db.agentAction.findMany({
    where: {
      organizationId: orgId,
      executedAt: { gte: from, lte: to },
    },
    select: {
      turnId: true,
      tool: true,
      output: true,
      instruction: true,
      summary: true,
      mode: true,
      executedAt: true,
    },
    orderBy: [{ executedAt: "asc" }, { id: "asc" }],
    take: 50_000,
  });

  const byTurn = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byTurn.get(row.turnId);
    if (bucket) bucket.push(row);
    else byTurn.set(row.turnId, [row]);
  }

  const turns: AgentTurn[] = [];
  for (const turnRows of byTurn.values()) {
    const first = turnRows[0];
    turns.push({
      instruction: first.instruction ?? "",
      actions: turnRows.map((row) => ({ tool: row.tool, result: row.output ?? "" })),
      summary: first.summary,
      error: null,
      ...(isValidMode(first.mode) ? { mode: first.mode } : {}),
    });
  }

  return turns;
}
