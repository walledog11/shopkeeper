import { isRecord } from './lib/guards.mjs';
// Milestone 1 production compatibility inventory (READ-ONLY).
//
// Reports aggregate persisted shapes used by actionable merchant briefings.
// It never prints organization, customer, thread, message, or plan identifiers,
// and it never selects customer message text into the report.
//
//   npm run audit:agent-briefings
//   SHOPKEEPER_DB_TARGET=prod npm run audit:agent-briefings
import { loadLocalEnv } from './load-local-env.mjs';
import { summarizeAgentBriefingInventory } from './agent-briefing-inventory-lib.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');


function pendingThreadIds(contexts) {
  const ids = new Set();
  for (const context of contexts) {
    if (!Array.isArray(context.pendingPlans)) continue;
    for (const entry of context.pendingPlans) {
      if (isRecord(entry) && typeof entry.threadId === 'string') ids.add(entry.threadId);
    }
  }
  return ids;
}

try {
  const [threads, contexts] = await Promise.all([
    db.thread.findMany({
      where: {
        status: 'open',
        archivedAt: null,
        deletedAt: null,
        channelType: { notIn: ['sms_agent', 'dashboard_agent'] },
        filterStatus: { not: 'filtered' },
      },
      select: {
        id: true,
        organizationId: true,
        classifierSignals: true,
        requestSourceMessageId: true,
        escalatedAt: true,
        filterStatus: true,
        cachedPlan: true,
      },
    }),
    db.operatorContext.findMany({ select: { pendingPlans: true } }),
  ]);

  const sourceIds = [...new Set(threads.flatMap((thread) => (
    thread.requestSourceMessageId ? [thread.requestSourceMessageId] : []
  )))];
  const [sourceMessages, customerMessages] = await Promise.all([
    sourceIds.length === 0
      ? Promise.resolve([])
      : db.message.findMany({
        where: {
          id: { in: sourceIds },
          senderType: 'customer',
          deletedAt: null,
        },
        // Text is used only to distinguish empty pointers and is never copied to
        // the report. Exact org/thread ownership is checked below.
        select: { id: true, organizationId: true, threadId: true, contentText: true },
      }),
    threads.length === 0
      ? Promise.resolve([])
      : db.message.findMany({
        where: {
          threadId: { in: threads.map((thread) => thread.id) },
          senderType: 'customer',
          deletedAt: null,
        },
        // As above, text is reduced immediately to a boolean and never reported.
        select: { threadId: true, contentText: true },
      }),
  ]);
  const sources = new Map(sourceMessages.map((message) => [message.id, message]));
  const historyWithText = new Set(customerMessages.flatMap((message) => (
    message.contentText?.trim() ? [message.threadId] : []
  )));
  const operatorPending = pendingThreadIds(contexts);

  const rows = threads.map((thread) => {
    const source = thread.requestSourceMessageId
      ? sources.get(thread.requestSourceMessageId)
      : undefined;
    return {
      ...thread,
      sourceMessageAvailable: Boolean(
        source
        && source.organizationId === thread.organizationId
        && source.threadId === thread.id
        && source.contentText?.trim(),
      ),
      historyCustomerTextAvailable: historyWithText.has(thread.id),
      operatorPlanPending: operatorPending.has(thread.id),
    };
  });

  console.log(JSON.stringify(summarizeAgentBriefingInventory(rows), null, 2));
} finally {
  await db.$disconnect();
}
