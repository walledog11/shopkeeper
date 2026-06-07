import { Buffer } from "node:buffer";
import type { Prisma } from "@prisma/client";
import { db, Prisma as PrismaRuntime } from "@shopkeeper/db";
import { TOOL_LABELS } from "@shopkeeper/agent/tools";
import type { ActionLogFilters } from "@/lib/agent/api/validation";
import type { ActionLogEntry } from "@/types";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_EXPORT_BATCH_SIZE = 250;

const OPERATOR_DASHBOARD_PLATFORM_PREFIX = "dashboard:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID_RE.test(parsed.turnId)) return null;
    return { executedAt: parsed.executedAt, turnId: parsed.turnId };
  } catch {
    return null;
  }
}

function buildTurnGroupWhereSql(orgId: string, filters?: ActionLogFilters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [PrismaRuntime.sql`a.organization_id = ${orgId}::uuid`];

  if (filters?.from) clauses.push(PrismaRuntime.sql`a.executed_at >= ${filters.from}`);
  if (filters?.to) clauses.push(PrismaRuntime.sql`a.executed_at <= ${filters.to}`);
  if (filters?.channels?.length) {
    clauses.push(PrismaRuntime.sql`t.channel_type::text IN (${PrismaRuntime.join(filters.channels)})`);
  }
  if (filters?.tools?.length) {
    clauses.push(PrismaRuntime.sql`a.tool IN (${PrismaRuntime.join(filters.tools)})`);
  }
  if (filters?.modes?.length) {
    clauses.push(PrismaRuntime.sql`a.mode IN (${PrismaRuntime.join(filters.modes)})`);
  }
  if (filters?.errorsOnly) {
    clauses.push(PrismaRuntime.sql`a.status IN (${PrismaRuntime.join(["error", "policy_block"])})`);
  }

  return PrismaRuntime.sql`WHERE ${PrismaRuntime.join(clauses, " AND ")}`;
}

function buildTurnCursorSql(cursor: AgentActionCursor | null): Prisma.Sql {
  if (!cursor) return PrismaRuntime.empty;
  return PrismaRuntime.sql`
    WHERE (max_executed_at, turn_id) < (${new Date(cursor.executedAt)}, ${cursor.turnId}::uuid)
  `;
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

export interface AgentActionReportStats {
  totalRuns: number;
  toolCounts: Record<string, number>;
  topTools: { tool: string; count: number }[];
}

interface TurnGroupRow {
  turnId: string;
  maxExecutedAt: Date;
}

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
    threadId: first.thread?.id ?? first.threadId,
    channelType: (first.thread?.channelType as ActionLogEntry["channelType"]) ?? null,
    threadTag: first.thread?.tag ?? null,
    customerHandle: first.thread ? customerHandle(first.thread.customer) : null,
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
  // tool/errorsOnly narrow the turn set), then page by the grouped turn sort
  // key. Applying a cursor before grouping can duplicate multi-action turns.
  const turnGroups = await db.$queryRaw<TurnGroupRow[]>`
    WITH turn_groups AS (
      SELECT a.turn_id, MAX(a.executed_at) AS max_executed_at
      FROM agent_actions a
      LEFT JOIN threads t ON t.id = a.thread_id
      ${buildTurnGroupWhereSql(orgId, filters)}
      GROUP BY a.turn_id
    )
    SELECT turn_id AS "turnId", max_executed_at AS "maxExecutedAt"
    FROM turn_groups
    ${buildTurnCursorSql(cursor)}
    ORDER BY max_executed_at DESC, turn_id DESC
    LIMIT ${pageSize + 1}
  `;

  if (turnGroups.length === 0) {
    return { turns: [], nextCursor: null };
  }

  const hasMore = turnGroups.length > pageSize;
  const pageTurns = hasMore ? turnGroups.slice(0, pageSize) : turnGroups;
  const turnIds = pageTurns.map((group) => group.turnId);

  // Phase 2: load every row for the selected turns (unfiltered at row level,
  // we want the full action breakdown even when the user filters by one tool).
  const rows = await db.agentAction.findMany({
    where: { organizationId: orgId, turnId: { in: turnIds } },
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
  const nextCursor = hasMore
    ? { executedAt: last.maxExecutedAt.toISOString(), turnId: last.turnId }
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
    entry.customerHandle ?? "",
    entry.channelType ?? "",
    entry.threadTag ?? "",
    entry.threadId ?? "",
    entry.mode ?? "",
    entry.instruction ?? "",
    entry.summary,
    actions,
    actionResults,
  ].map((cell) => escapeCsvCell(normalizeCsvText(cell))).join(",");
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

export async function getAgentActionReportStatsForOrgInRange(
  orgId: string,
  from: Date,
  to: Date,
): Promise<AgentActionReportStats> {
  const where: Prisma.AgentActionWhereInput = {
    organizationId: orgId,
    executedAt: { gte: from, lte: to },
  };

  const [runCountRows, toolRows] = await Promise.all([
    db.$queryRaw<{ total_runs: bigint }[]>`
      SELECT COUNT(DISTINCT turn_id)::bigint AS total_runs
      FROM agent_actions
      WHERE organization_id = ${orgId}::uuid
        AND executed_at >= ${from}
        AND executed_at <= ${to}
    `,
    db.agentAction.groupBy({
      by: ["tool"],
      where,
      _count: { id: true },
      orderBy: [{ _count: { id: "desc" } }, { tool: "asc" }],
    }),
  ]);

  const toolCounts = Object.fromEntries(
    toolRows.map((row) => [row.tool, row._count.id]),
  );

  return {
    totalRuns: Number(runCountRows[0]?.total_runs ?? 0),
    toolCounts,
    topTools: toolRows.slice(0, 5).map((row) => ({
      tool: row.tool,
      count: row._count.id,
    })),
  };
}
