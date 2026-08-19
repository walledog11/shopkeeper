import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — move one thread's conversational clock back so the next inbound
// message crosses its episode boundary, for the live storefront-chat episode run
// (item F of the conversation-episodes plan).
//
// Why not just close the thread from the dashboard: a closed thread is not found
// by resolve-inbound-episode.ts at all, so it takes the plain "no open thread"
// branch and returns rolledOverFromThreadId: null. That skips everything worth
// verifying — closedReason = episode_rollover, cachedPlan expiry, the session's
// endedAt, and removePendingPlanForThread. Only the idle boundary reaches the
// hard-rollover branch, and you cannot wait 24 hours mid-session.
//
// What it moves: every non-note, non-deleted Message.sentAt on the thread, which
// is exactly the clock lastConversationalActivity() reads. Thread.lastMessageAt
// moves with them so the row stays internally consistent (it is the fallback
// when a thread has no messages, and the dashboard sorts on it).
//
// Exactly reversible: the shift is a signed offset, so HOURS=-25 undoes HOURS=25.
// Relative spacing between messages is preserved either way.
//
// Dry-run by default — prints what it would move. Pass CONFIRM=1 to execute.
//
//   railway run bash -lc 'NODE_ENV=production THREAD_ID=... npx tsx apps/gateway/src/scripts/backdate-episode-clock.ts'
//   railway run bash -lc 'NODE_ENV=production THREAD_ID=... CONFIRM=1 npx tsx apps/gateway/src/scripts/backdate-episode-clock.ts'
//
// Optional: HOURS (default 25, may be negative to undo).

async function main() {
  const { db, SenderType } = await import('@shopkeeper/db');
  const { episodePolicyFor } = await import('../message-handlers/resolve-inbound-episode.js');

  const threadId = process.env.THREAD_ID;
  if (!threadId) throw new Error('Set THREAD_ID');
  const hours = Number(process.env.HOURS ?? 25);
  if (!Number.isFinite(hours) || hours === 0) throw new Error('HOURS must be a non-zero number');
  const confirm = process.env.CONFIRM === '1';
  const shiftMs = hours * 3_600_000;

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      organizationId: true,
      channelType: true,
      status: true,
      closedReason: true,
      lastMessageAt: true,
      cachedPlan: true,
    },
  });
  if (!thread) throw new Error(`No thread ${threadId}`);

  const policy = episodePolicyFor(thread.channelType);
  console.log(
    `thread ${thread.id}\n  org=${thread.organizationId} channel=${thread.channelType} ` +
    `status=${thread.status}${thread.closedReason ? ` closedReason=${thread.closedReason}` : ''} ` +
    `cachedPlan=${thread.cachedPlan == null ? 'none' : 'present'}`,
  );
  if (!policy) {
    // Channels absent from CHANNEL_EPISODE_POLICY never roll over. Backdating
    // one would move rows and change nothing, which is worse than refusing.
    throw new Error(`Channel ${thread.channelType} has no episode policy — it never rolls over.`);
  }
  const boundaryHours = policy.idleMs / 3_600_000;
  console.log(`  boundary=${boundaryHours}h idle`);

  if (thread.status !== 'open') {
    console.log(
      `  WARNING: thread is ${thread.status}. A non-open thread is not found by ` +
      'resolveInboundEpisode at all, so the next message opens a fresh episode ' +
      'without taking the rollover branch this script exists to reach.',
    );
  }

  const messages = await db.message.findMany({
    where: { threadId: thread.id, senderType: { not: SenderType.note }, deletedAt: null },
    orderBy: { sentAt: 'desc' },
    select: { id: true, senderType: true, sentAt: true },
  });
  if (messages.length === 0) throw new Error('No non-note messages — nothing to move.');

  const now = new Date();
  const clockBefore = messages[0].sentAt;
  const clockAfter = new Date(clockBefore.getTime() - shiftMs);
  const idleAfterMs = now.getTime() - clockAfter.getTime();

  console.log(`\n  ${messages.length} non-note message(s), shifting ${hours > 0 ? 'back' : 'forward'} ${Math.abs(hours)}h:`);
  for (const m of messages) {
    console.log(
      `    ${m.sentAt.toISOString()} -> ${new Date(m.sentAt.getTime() - shiftMs).toISOString()}  ${m.senderType}`,
    );
  }
  console.log(`  lastMessageAt ${thread.lastMessageAt.toISOString()} -> ${new Date(thread.lastMessageAt.getTime() - shiftMs).toISOString()}`);
  console.log(
    `\n  clock after: ${clockAfter.toISOString()} ` +
    `(${(idleAfterMs / 3_600_000).toFixed(1)}h idle) -> next inbound ` +
    `${idleAfterMs >= policy.idleMs ? 'ROLLS OVER' : 'continues this episode'}`,
  );

  if (!confirm) {
    console.log('\nDRY RUN — pass CONFIRM=1 to execute.');
    await db.$disconnect();
    return;
  }

  // Per-row updates rather than one updateMany: each message keeps its own
  // offset, so the spacing between turns survives and the shift stays reversible.
  await db.$transaction([
    ...messages.map((m) =>
      db.message.update({
        where: { id: m.id },
        data: { sentAt: new Date(m.sentAt.getTime() - shiftMs) },
      }),
    ),
    db.thread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date(thread.lastMessageAt.getTime() - shiftMs) },
    }),
  ]);

  console.log(`\nMoved ${messages.length} message(s) and lastMessageAt. Undo with HOURS=${-hours} CONFIRM=1.`);
  await db.$disconnect();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
