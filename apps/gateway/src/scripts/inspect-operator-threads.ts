import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY read-only — show every operator (sms_agent) thread for the org with
// its operator_key + the customer's platform_id, plus the bindings, so we can
// confirm the adoption fix keys correctly for BOTH Telegram and iMessage.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const orgId = process.env.ORG_ID ?? '10c25c34-7a92-4963-b9cd-537ef893f6c0'; // Palette

  const tg = await db.orgMemberTelegramChat.findMany({
    where: { orgMember: { organizationId: orgId } },
    select: { chatId: true },
  });
  const im = await db.orgMemberImessageBinding.findMany({
    where: { orgMember: { organizationId: orgId } },
    select: { senderId: true },
  });
  console.log('bindings → telegram operatorKeys:', tg.map((t) => `telegram:${t.chatId}`));
  console.log('bindings → imessage operatorKeys:', im.map((b) => `imessage:${b.senderId}`));

  const threads = await db.$queryRawUnsafe<
    { id: string; status: string; operator_key: string | null; platform_id: string; customer_id: string }[]
  >(
    `SELECT t.id, t.status::text, t.operator_key, c.platform_id, t.customer_id
       FROM threads t JOIN customers c ON c.id = t.customer_id
      WHERE t.organization_id = $1 AND t.channel_type = 'sms_agent'
      ORDER BY t.status`,
    orgId,
  );
  console.log('── sms_agent threads (operatorKey / customer.platformId) ──');
  for (const t of threads) {
    console.log(`  ${t.status.padEnd(7)} operator_key=${String(t.operator_key)}  platformId=${t.platform_id}  (thread ${t.id})`);
  }
  if (threads.length === 0) console.log('  (none)');

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
