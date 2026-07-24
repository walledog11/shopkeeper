import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY read-only diagnostic — print recent OperatorEvent rows (the P4-03
// durable inbound ledger) for an org so a stuck/undrained event can be
// classified: pending (never claimed) / claimed (worker died or hung mid-turn) /
// committed / failed / unknown (reconciled by the sweep).
//
//   railway run bash -lc 'NODE_ENV=production ORG_ID=... npx tsx apps/gateway/src/scripts/inspect-operator-events.ts'
//
// Optional: ORG_ID, EVENTS (row count, default 12).

async function main() {
  const { db } = await import('@shopkeeper/db');

  const orgId = process.env.ORG_ID;
  if (!orgId) throw new Error('Set ORG_ID');
  const limit = Number(process.env.EVENTS ?? 12);

  const events = await db.operatorEvent.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      channel: true,
      status: true,
      providerMessageId: true,
      chatId: true,
      attempts: true,
      createdAt: true,
      claimedAt: true,
      processedAt: true,
      replyDeliveredAt: true,
      lastError: true,
      body: true,
      replyText: true,
    },
  });

  console.log(`── Last ${events.length} OperatorEvents (newest first) ──────────────────`);
  for (const e of events) {
    const t = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(11, 19) : '—');
    console.log(
      `${e.createdAt.toISOString().slice(11, 19)}  ${e.channel.padEnd(8)} ${e.status.padEnd(9)} `
      + `att:${e.attempts} claimed:${t(e.claimedAt)} processed:${t(e.processedAt)} delivered:${t(e.replyDeliveredAt)}`,
    );
    console.log(`    id:${e.id}  pmid:${e.providerMessageId}  chat:${e.chatId}`);
    console.log(`    body:  ${JSON.stringify(e.body.slice(0, 80))}`);
    console.log(`    reply: ${JSON.stringify((e.replyText ?? '').slice(0, 200))}`);
    if (e.lastError) console.log(`    lastError: ${e.lastError.slice(0, 120)}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
