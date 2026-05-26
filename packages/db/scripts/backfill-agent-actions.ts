/**
 * One-shot backfill: convert legacy `__clerk_agent__` note rows into
 * first-class `AgentAction` rows. Lets the dashboard switch its action-log
 * read path off note-parsing without losing historic data.
 *
 * Idempotent — row ids are deterministic SHA-256 of (messageId, actionIdx),
 * so re-runs short-circuit via createMany.skipDuplicates.
 *
 * Usage:
 *   DATABASE_URL=<url> node --import tsx \
 *     packages/db/scripts/backfill-agent-actions.ts [--dry-run] [--org <orgId>]
 */
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '../index.js';

// Kept in sync with apps/dashboard/src/lib/agent/tools/turn-content.ts
const AGENT_TURN_PREFIX = '__clerk_agent__';
// Kept in sync with apps/dashboard/src/lib/agent/tools/thread.ts
const ESCALATION_MARKER = '__ESCALATED__:';

// Mirror of TOOL_CATEGORIES from apps/dashboard/src/lib/agent/tools/registry.ts.
// Inlined because packages/db cannot import from the dashboard app. Unknown
// tools (renamed/removed since the note was written) fall back to "unknown".
const TOOL_CATEGORIES: Record<string, string> = {
  search_kb: 'read',
  search_shopify_products: 'read',
  search_shopify_customers: 'read',
  get_shopify_customer: 'read',
  update_shopify_customer_info: 'action',
  get_shopify_orders: 'read',
  update_shopify_order_address: 'action',
  add_shopify_customer_note: 'action',
  get_order_by_name: 'read',
  get_order_tracking: 'read',
  create_refund: 'action',
  cancel_order: 'action',
  create_shopify_order: 'action',
  edit_shopify_order: 'action',
  add_internal_note: 'internal',
  send_reply: 'communication',
  send_email: 'communication',
  update_thread_status: 'internal',
  update_thread_tag: 'internal',
  escalate_to_human: 'internal',
};

type AgentActionMode = 'human_approved' | 'auto_executed' | 'read_only';

interface ParsedTurn {
  instruction: string;
  actions: { tool: string; result: string }[];
  summary: string | null;
  mode?: AgentActionMode;
}

function parseAgentTurn(text: string | null): ParsedTurn | null {
  if (!text?.startsWith(AGENT_TURN_PREFIX)) return null;
  try {
    const p = JSON.parse(text.slice(AGENT_TURN_PREFIX.length)) as {
      instruction?: unknown;
      actions?: unknown;
      summary?: unknown;
      mode?: unknown;
    };
    const actions = Array.isArray(p.actions)
      ? p.actions.filter(
          (a): a is { tool: string; result: string } =>
            !!a && typeof a === 'object'
            && typeof (a as { tool?: unknown }).tool === 'string'
            && typeof (a as { result?: unknown }).result === 'string',
        )
      : [];
    const mode = p.mode === 'human_approved' || p.mode === 'auto_executed' || p.mode === 'read_only'
      ? (p.mode as AgentActionMode)
      : undefined;
    return {
      instruction: typeof p.instruction === 'string' ? p.instruction : '',
      actions,
      summary: typeof p.summary === 'string' ? p.summary : null,
      ...(mode ? { mode } : {}),
    };
  } catch {
    return null;
  }
}

function deterministicUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function deriveStatus(tool: string, result: string): string {
  if (tool === 'escalate_to_human' || result.startsWith(ESCALATION_MARKER)) return 'escalated';
  if (result.toLowerCase().startsWith('error:')) return 'error';
  return 'success';
}

interface CliArgs {
  dryRun: boolean;
  orgId: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let orgId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--org') {
      orgId = argv[++i] ?? null;
      if (!orgId) throw new Error('--org requires a value');
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { dryRun, orgId };
}

const BATCH_SIZE = 200;

const NOTE_SELECT = {
  id: true,
  contentText: true,
  sentAt: true,
  threadId: true,
  thread: { select: { organizationId: true, customerId: true } },
} satisfies Prisma.MessageSelect;

type NoteRow = Prisma.MessageGetPayload<{ select: typeof NOTE_SELECT }>;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[backfill-agent-actions] starting${args.dryRun ? ' (dry-run)' : ''}`
    + `${args.orgId ? ` org=${args.orgId}` : ''}`,
  );

  let cursor: string | null = null;
  let scannedNotes = 0;
  let parsedNotes = 0;
  let unparseableNotes = 0;
  let plannedRows = 0;
  let insertedRows = 0;

  while (true) {
    const messages: NoteRow[] = await db.message.findMany({
      where: {
        senderType: 'note',
        contentText: { startsWith: AGENT_TURN_PREFIX },
        ...(args.orgId ? { thread: { organizationId: args.orgId } } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: NOTE_SELECT,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    if (messages.length === 0) break;

    const rows: Prisma.AgentActionCreateManyInput[] = [];

    for (const m of messages) {
      scannedNotes++;
      cursor = m.id;
      const turn = parseAgentTurn(m.contentText);
      if (!turn) {
        unparseableNotes++;
        continue;
      }
      parsedNotes++;
      if (turn.actions.length === 0) continue;

      const turnId = deterministicUuid(m.id);
      const baseTime = m.sentAt.getTime();
      const mode: AgentActionMode = turn.mode ?? 'human_approved';

      for (let idx = 0; idx < turn.actions.length; idx++) {
        const a = turn.actions[idx];
        const status = deriveStatus(a.tool, a.result);
        rows.push({
          id: deterministicUuid(`${m.id}:${idx}`),
          turnId,
          organizationId: m.thread.organizationId,
          threadId: m.threadId,
          customerId: m.thread.customerId,
          tool: a.tool,
          category: TOOL_CATEGORIES[a.tool] ?? 'unknown',
          // Legacy notes did not carry tool inputs.
          input: {},
          output: a.result,
          status,
          errorDetail: status === 'error' ? a.result : null,
          mode,
          instruction: turn.instruction,
          summary: turn.summary,
          // Approver identity was not captured on the note; leave null.
          approverId: null,
          approvedAt: null,
          approvedPlanHash: null,
          instructionHash: null,
          // Preserve per-tool ordering inside a turn via a millisecond offset.
          executedAt: new Date(baseTime + idx),
          // Duration was never recorded historically.
          durationMs: 0,
        });
      }
    }

    plannedRows += rows.length;
    if (!args.dryRun && rows.length > 0) {
      const result = await db.agentAction.createMany({ data: rows, skipDuplicates: true });
      insertedRows += result.count;
    }
  }

  console.log(
    `[backfill-agent-actions] scannedNotes=${scannedNotes} parsedNotes=${parsedNotes}`
    + ` unparseableNotes=${unparseableNotes} plannedRows=${plannedRows}`
    + ` insertedRows=${args.dryRun ? '(dry-run)' : insertedRows}`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('[backfill-agent-actions] failed', err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
