import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — push a sample order-risk flag notification through the production
// operator notify path (same formatting + mirrorBody as the order-review worker).
//
//   npm run build -w packages/db && npm run build -w packages/agent
//   railway run bash -lc 'NODE_ENV=production npx tsx apps/gateway/src/scripts/stage-order-flag-notification.ts'
//
// Optional: ORG_ID, ORDER_NAME (default #1027), REASON (long multi-signal sample).

async function main() {
  const {
    formatOrderFlagNotification,
  } = await import('../workers/order-review.js');
  const { listOperatorBindings, notifyOperator } = await import('../operator-notify.js');
  const { db } = await import('@shopkeeper/db');

  let orgId = process.env.ORG_ID?.trim() || undefined;
  if (!orgId) {
    const orgs = await db.organization.findMany({ select: { id: true, name: true } });
    if (orgs.length !== 1) {
      throw new Error(
        `Set ORG_ID — found ${orgs.length} orgs: ${orgs.map((o) => `${o.id} (${o.name})`).join(', ')}`,
      );
    }
    orgId = orgs[0].id;
  }

  const orderName = process.env.ORDER_NAME?.trim() || '#1027';
  const livetestOrderId = `livetest-truncation-${Date.now()}`;
  const defaultReason =
    'First-time customer, $300 order, payment not yet captured, and billing (US) vs shipping (Canada) country mismatch — combination suggests possible stolen card use; recommend human review before capturing payment';
  const reason = process.env.REASON?.trim() || defaultReason;

  const bindings = await listOperatorBindings(orgId);
  if (bindings.length === 0) {
    throw new Error('No operator channels bound — link Telegram or iMessage first.');
  }

  const body = formatOrderFlagNotification(orderName, reason);
  const mirrorBody = formatOrderFlagNotification(orderName, reason, 600);
  const idempotencyKey = `order-risk:${orgId}:${livetestOrderId}`;

  console.log('Push body length:', body.length);
  console.log('Push body preview:', body.slice(0, 120), '…');
  console.log('Mirror longer than push:', mirrorBody.length > body.length);

  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(orgId, member, body, {}, {
      idempotencyKey,
      mirrorBody,
    });
    if (result) {
      notified += 1;
      console.log(`Sent via ${result.channel} → ${result.chatId}`);
    }
  }

  console.log(`Done — ${notified}/${bindings.length} channel(s). Livetest order id: ${livetestOrderId}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
