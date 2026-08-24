import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import {
  getLastConversationMessage,
  readAgentPlanCacheRecordShape,
  type PlanThreadMessage,
} from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { CHANNEL_TYPE, SENDER_TYPE, THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import { db, Prisma, ThreadFilterStatus } from '@shopkeeper/db';
import logger from '../logger.js';
import { parseStoredPendingPlan } from '../operator-context.js';
import { ONE_DAY_MS } from './registration.js';

/** Fixed product default — not a merchant setting. */
export const CLOSE_AFTER_QUIET_DAYS = 7;

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

type SweepMessage = PlanThreadMessage & { sentAt: Date };

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

export function hasMerchantWorkCachedPlan(
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
export function classifyInactiveThreadClose(
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

async function loadSweepContext(): Promise<{
  operatorPendingThreadIds: Set<string>;
  pendingExecutionThreadIds: Set<string>;
  openWatchThreadIds: Set<string>;
  settingsByOrg: Map<string, ReturnType<typeof resolveAgentSettings>>;
}> {
  const operatorPendingThreadIds = new Set<string>();
  const contexts = await db.operatorContext.findMany({
    where: { pendingPlans: { not: Prisma.DbNull } },
    select: { pendingPlans: true },
  });
  for (const row of contexts) {
    if (!Array.isArray(row.pendingPlans)) continue;
    for (const raw of row.pendingPlans) {
      const plan = parseStoredPendingPlan(raw);
      if (plan) operatorPendingThreadIds.add(plan.threadId);
    }
  }

  const pendingExecutions = await db.planExecution.findMany({
    where: { status: { in: ['pending', 'claimed'] }, threadId: { not: null } },
    select: { threadId: true },
  });
  const pendingExecutionThreadIds = new Set(
    pendingExecutions.map((row) => row.threadId!).filter(Boolean),
  );

  const openWatchThreadIds = new Set<string>();
  const [returnWatches, shipmentWatches] = await Promise.all([
    db.returnWatch.findMany({ where: { status: 'open' }, select: { threadId: true } }),
    db.shipmentWatch.findMany({ where: { status: 'open' }, select: { threadId: true } }),
  ]);
  for (const row of returnWatches) if (row.threadId) openWatchThreadIds.add(row.threadId);
  for (const row of shipmentWatches) if (row.threadId) openWatchThreadIds.add(row.threadId);

  const orgs = await db.organization.findMany({ select: { id: true, settings: true } });
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
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        filterStatus: { not: ThreadFilterStatus.filtered },
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: SWEEP_BATCH_SIZE,
      select: {
        id: true,
        organizationId: true,
        updatedAt: true,
        escalatedAt: true,
        cachedPlan: true,
        cachedPlanMessageId: true,
        filterStatus: true,
        messages: {
          where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
          orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
          select: { id: true, senderType: true, sentAt: true },
        },
      },
    });

    if (threads.length === 0) break;
    lastId = threads[threads.length - 1]!.id;

    const toClose: string[] = [];
    for (const thread of threads) {
      const settings = context.settingsByOrg.get(thread.organizationId) ?? resolveAgentSettings(null);
      const decision = classifyInactiveThreadClose(
        thread,
        now,
        settings,
        context,
      );
      if (decision === 'skip') continue;
      toClose.push(thread.id);
    }

    if (toClose.length > 0) {
      const result = await db.thread.updateMany({
        where: { id: { in: toClose }, status: THREAD_STATUS.OPEN },
        data: { status: THREAD_STATUS.CLOSED, closedReason: 'inactivity' },
      });
      closed += result.count;
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
