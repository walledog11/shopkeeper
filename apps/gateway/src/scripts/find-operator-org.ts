import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — list orgs that have a bound operator channel (Telegram/iMessage),
// so you know which ORG_ID to hand stage-pending-plan.ts.

async function main() {
  const { db } = await import('@shopkeeper/db');

  const [tg, im] = await Promise.all([
    db.orgMemberTelegramChat.findMany({
      select: { chatId: true, orgMember: { select: { organizationId: true } } },
    }),
    db.orgMemberImessageBinding.findMany({
      select: { senderId: true, orgMember: { select: { organizationId: true } } },
    }),
  ]);

  const counts = new Map<string, { tg: number; im: number }>();
  const bump = (orgId: string, k: 'tg' | 'im') => {
    const c = counts.get(orgId) ?? { tg: 0, im: 0 };
    c[k] += 1;
    counts.set(orgId, c);
  };
  for (const t of tg) bump(t.orgMember.organizationId, 'tg');
  for (const b of im) bump(b.orgMember.organizationId, 'im');

  if (counts.size === 0) {
    console.log('No operator bindings in ANY org — bind Telegram or iMessage first.');
    await db.$disconnect();
    return;
  }

  for (const [orgId, c] of counts) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    console.log(`${orgId}  ${org?.name ?? '?'}  ·  telegram:${c.tg}  imessage:${c.im}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
