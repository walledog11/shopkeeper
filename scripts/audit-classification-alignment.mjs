// Milestone 2 request-contract source alignment (READ-ONLY).
//
// Reports whether each thread's persisted request fields describe the newest
// customer message on that thread. A `stale` row is what the unguarded email
// pre-persistence write could produce before 933019d5; rows created after the
// guard deployed are counted apart because those would be a live defect.
//
// It never prints organization, customer, thread, or message identifiers, and it
// never selects message text.
//
//   npm run audit:classification-alignment
//   SHOPKEEPER_DB_TARGET=prod npm run audit:classification-alignment
import { loadLocalEnv } from './load-local-env.mjs';
import { summarizeRequestAlignment } from './classification-alignment-lib.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

try {
  const threads = await db.thread.findMany({
    where: {
      deletedAt: null,
      channelType: { notIn: ['sms_agent', 'dashboard_agent'] },
    },
    select: {
      id: true,
      organizationId: true,
      channelType: true,
      status: true,
      createdAt: true,
      requestSummary: true,
      requestSourceMessageId: true,
    },
  });

  const customerMessages = threads.length === 0
    ? []
    : await db.message.findMany({
      where: {
        threadId: { in: threads.map((thread) => thread.id) },
        senderType: 'customer',
        deletedAt: null,
      },
      select: { id: true, threadId: true, sentAt: true },
    });

  const latestByThread = new Map();
  const sentAtById = new Map();
  for (const message of customerMessages) {
    sentAtById.set(message.id, message.sentAt);
    const current = latestByThread.get(message.threadId);
    if (!current || message.sentAt > current.sentAt) latestByThread.set(message.threadId, message);
  }

  const rows = threads.map((thread) => {
    const latest = latestByThread.get(thread.id);
    return {
      organizationId: thread.organizationId,
      channelType: thread.channelType,
      status: thread.status,
      createdAt: thread.createdAt,
      // Reduced to a boolean immediately; the summary text never leaves this line.
      requestSummary: thread.requestSummary ? 'present' : null,
      requestSourceMessageId: thread.requestSourceMessageId,
      sourceSentAt: thread.requestSourceMessageId
        ? sentAtById.get(thread.requestSourceMessageId) ?? null
        : null,
      latestCustomerMessageId: latest?.id ?? null,
      latestCustomerSentAt: latest?.sentAt ?? null,
    };
  });

  console.log(JSON.stringify(summarizeRequestAlignment(rows), null, 2));
} finally {
  await db.$disconnect();
}
