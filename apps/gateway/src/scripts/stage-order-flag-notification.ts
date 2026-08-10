import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — push a sample order-risk flag notification through the production
// operator notify path (same formatting + mirrorBody as the order-review worker).
//
//   npm run build -w packages/db && npm run build -w packages/agent
//   railway run bash -lc 'NODE_ENV=production ORG_ID=<id> npx tsx apps/gateway/src/scripts/stage-order-flag-notification.ts'
//
// Optional: ORG_ID, ORDER_NAME (default #1027), REASON (long multi-signal sample).

async function shutdown(): Promise<void> {
  const { closeGatewayRedisConnections } = await import('../clients/redis-client.js');
  const { stopAllSpectrumApps } = await import('../clients/spectrum.js');
  const { db } = await import('@shopkeeper/db');
  await closeGatewayRedisConnections().catch(() => {});
  await stopAllSpectrumApps().catch(() => {});
  await db.$disconnect().catch(() => {});
}

async function main() {
  const { formatOrderFlagNotification } = await import('../workers/order-review.js');
  const { listOperatorBindings, notifyOperator, bindingDeliveryKey } = await import('../operator-notify.js');
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
  const livetestOrderId = `livetest-flag-${Date.now()}`;
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

  console.log('--- push body ---');
  console.log(body);
  console.log('--- end push body ---');
  console.log('Bindings:', bindings.map((b) => `${b.channel}:${bindingDeliveryKey(b)}`).join(', '));

  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(orgId, member, body, {}, {
      idempotencyKey,
      mirrorBody,
    });
    if (result) {
      notified += 1;
      console.log(`Delivered via ${result.channel} → ${result.chatId}`);
    } else {
      console.log(`Skipped or failed: ${member.channel}`);
    }
  }

  console.log(`Done — ${notified}/${bindings.length} channel(s). Livetest order id: ${livetestOrderId}`);
}

main()
  .then(() => shutdown())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await shutdown();
    process.exit(1);
  });
