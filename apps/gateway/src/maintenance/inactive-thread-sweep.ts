import type { Prisma as PrismaTypes } from '@prisma/client';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import {
  getLastConversationMessage,
  readAgentPlanCacheRecordShape,
  type PlanThreadMessage,
} from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { stopWaitingTasksOnClosedThreads } from '@shopkeeper/agent/task-ledger';
import { CHANNEL_TYPE, SENDER_TYPE, THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import { db, Prisma, ThreadFilterStatus } from '@shopkeeper/db';
import logger from '../logger.js';
import { parseStoredPendingPlan } from '../operator-context.js';
import { ONE_DAY_MS } from './registration.js';

/** Fixed product default — not a merchant setting. */
const CLOSE_AFTER_QUIET_DAYS = 7;

/**
 * How recently a thread can have changed and still be spared the
 * non-conversational close. A thread is note-only for the window between
 * `processInboundMessage` creating it and writing its first message, so without
 * this a sweep landing inside that window closes a live conversation before the
 * customer's message exists. Retention runs daily, so waiting an hour only
 * defers a genuinely inert order-event thread to the next run.
 */
const NON_CONVERSATIONAL_GRACE_MS = 60 * 60 * 1000;

const SWEEP_BATCH_SIZE = 200;

type SweepMessage = PlanThreadMessage & { sentAt: Date; sendStatus: string | null };

export type InactiveThreadSweepRow = {
  id: string;
  organizationId: string;
  updatedAt: Date;
  escalatedAt: Date | null;
  cachedPlan: unknown;
  cachedPlanMessageId: string | null;
  filterStatus: string;
  messages: SweepMessage[];
};

export type InactiveThreadCloseDecision = 'close_non_conversational' | 'close_quiet' | 'skip';

function hasMerchantWorkCachedPlan(
  thread: Pick<InactiveThreadSweepRow, 'cachedPlan' | 'filterStatus'>,
  settings: ReturnType<typeof resolveAgentSettings>,
): boolean {
  const cached = readAgentPlanCacheRecordShape(thread.cachedPlan);
  if (!cached || cached.plan.steps.length === 0) return false;
  const kind = decideAutonomy(cached.plan, settings, { filterStatus: thread.filterStatus }).kind;
  return kind !== 'quick_reply';
}

/**
 * Whether an open inbox thread should close in the inactive sweep. Notes are
 * ignored when deciding who spoke last; a note-only thread is non-conversational.
 */
function classifyInactiveThreadClose(
  thread: InactiveThreadSweepRow,
  now: Date,
  settings: ReturnType<typeof resolveAgentSettings>,
  context: {
    operatorPendingThreadIds: Set<string>;
    pendingExecutionThreadIds: Set<string>;
    openWatchThreadIds: Set<string>;
  },
): InactiveThreadCloseDecision {
  if (thread.escalatedAt) return 'skip';
  if (context.operatorPendingThreadIds.has(thread.id)) return 'skip';
  if (context.pendingExecutionThreadIds.has(thread.id)) return 'skip';
  if (context.openWatchThreadIds.has(thread.id)) return 'skip';
  if (hasMerchantWorkCachedPlan(thread, settings)) return 'skip';

  // A persisted outbound attempt is not evidence that the customer received a
  // reply. Null is the legacy synchronous-send convention; fail closed for any
  // other state until delivery is confirmed.
  if (thread.messages.some(message =>
    (message.senderType === SENDER_TYPE.AGENT || message.senderType === SENDER_TYPE.AI)
    && message.sendStatus !== null && message.sendStatus !== 'sent'
  )) return 'skip';

  const last = getLastConversationMessage(thread.messages) as SweepMessage | null;
  if (!last) {
    const graceCutoff = new Date(now.getTime() - NON_CONVERSATIONAL_GRACE_MS);
    return thread.updatedAt.getTime() <= graceCutoff.getTime() ? 'close_non_conversational' : 'skip';
  }

  if (last.senderType === SENDER_TYPE.CUSTOMER) return 'skip';

  const quietCutoff = new Date(now.getTime() - CLOSE_AFTER_QUIET_DAYS * ONE_DAY_MS);
  if (last.sentAt.getTime() > quietCutoff.getTime()) return 'skip';

  return 'close_quiet';
}

async function loadSweepContext(
  client: Pick<typeof db, 'operatorContext' | 'planExecution' | 'returnWatch' | 'organization'> = db,
  organizationId?: string,
): Promise<{
  operatorPendingThreadIds: Set<string>;
  pendingExecutionThreadIds: Set<string>;
  openWatchThreadIds: Set<string>;
  settingsByOrg: Map<string, ReturnType<typeof resolveAgentSettings>>;
}> {
  const operatorPendingThreadIds = new Set<string>();
  const contexts = await client.operatorContext.findMany({
    where: { organizationId, pendingPlans: { not: Prisma.DbNull } },
    select: { pendingPlans: true },
  });
  for (const row of contexts) {
    if (!Array.isArray(row.pendingPlans)) continue;
    for (const raw of row.pendingPlans) {
      const plan = parseStoredPendingPlan(raw);
      if (plan) operatorPendingThreadIds.add(plan.threadId);
    }
  }

  const pendingExecutions = await client.planExecution.findMany({
    where: { organizationId, status: { in: ['pending', 'claimed'] }, threadId: { not: null } },
    select: { threadId: true },
  });
  const pendingExecutionThreadIds = new Set(
    pendingExecutions.map((row) => row.threadId!).filter(Boolean),
  );

  const openWatchThreadIds = new Set<string>();
  const returnWatches = await client.returnWatch.findMany({
    where: { organizationId, status: 'open' },
    select: { threadId: true },
  });
  for (const row of returnWatches) if (row.threadId) openWatchThreadIds.add(row.threadId);

  const orgs = await client.organization.findMany({ where: { id: organizationId }, select: { id: true, settings: true } });
  const settingsByOrg = new Map(
    orgs.map((org) => [org.id, resolveAgentSettings(org.settings)]),
  );

  return {
    operatorPendingThreadIds,
    pendingExecutionThreadIds,
    openWatchThreadIds,
    settingsByOrg,
  };
}

const sweepThreadSelect = {
  id: true,
  organizationId: true,
  customerId: true,
  updatedAt: true,
  escalatedAt: true,
  cachedPlan: true,
  cachedPlanMessageId: true,
  filterStatus: true,
  messages: {
    where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true, senderType: true, sentAt: true, sendStatus: true },
  },
} satisfies PrismaTypes.ThreadSelect;

/**
 * Daily inbox retention: close note-only threads and threads the agent answered
 * that stayed silent for seven days. Episode rollover and persistent identity are
 * owned elsewhere; this sweep only removes stale open work from the inbox.
 */
export async function closeInactiveOpenThreads(now: Date = new Date()): Promise<number> {
  const context = await loadSweepContext();
  let closed = 0;
  let lastId: string | undefined;

  for (;;) {
    const threads = await db.thread.findMany({
      where: {
        status: THREAD_STATUS.OPEN,
        archivedAt: null,
        deletedAt: null,
        channelType: { notIn: [CHANNEL_TYPE.OPERATOR] },
        filterStatus: { not: ThreadFilterStatus.filtered },
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: SWEEP_BATCH_SIZE,
      select: sweepThreadSelect,
    });

    if (threads.length === 0) break;
    lastId = threads[threads.length - 1]!.id;

    for (const thread of threads) {
      const settings = context.settingsByOrg.get(thread.organizationId) ?? resolveAgentSettings(null);
      if (classifyInactiveThreadClose(thread, now, settings, context) === 'skip') continue;

      closed += await db.$transaction(async (tx) => {
        // Match inbound episode resolution's customer-first lock order. The
        // thread lock also serializes message inserts (via their foreign key)
        // and changes to escalation/plan state while we recheck eligibility.
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${thread.customerId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM threads WHERE id = ${thread.id}::uuid FOR UPDATE`;
        const current = await tx.thread.findFirst({
          where: {
            id: thread.id,
            status: THREAD_STATUS.OPEN,
            archivedAt: null,
            deletedAt: null,
            filterStatus: { not: ThreadFilterStatus.filtered },
          },
          select: sweepThreadSelect,
        });
        if (!current) return 0;
        const freshContext = await loadSweepContext(tx, thread.organizationId);
        const freshSettings = freshContext.settingsByOrg.get(thread.organizationId) ?? resolveAgentSettings(null);
        if (classifyInactiveThreadClose(current, now, freshSettings, freshContext) === 'skip') return 0;

        await tx.thread.update({
          where: { id: thread.id },
          data: { status: THREAD_STATUS.CLOSED, closedReason: 'inactivity' },
        });
        await stopWaitingTasksOnClosedThreads(tx, {
          organizationId: thread.organizationId, threadIds: [thread.id],
        });
        return 1;
      });
    }

    if (threads.length < SWEEP_BATCH_SIZE) break;
  }

  if (closed > 0) {
    logger.info(
      { count: closed, quietDays: CLOSE_AFTER_QUIET_DAYS },
      '[InactiveThreadSweep] Closed inactive open threads',
    );
  }

  return closed;
}
